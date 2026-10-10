import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const distDir = path.resolve('artifacts/soglom-apteka/dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// 1. Static HTTP Server for dist
const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  let filePath = path.join(distDir, reqPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch (err) {
    res.writeHead(500);
    res.end('Error loading file: ' + err.message);
  }
});

await new Promise((resolve) => server.listen(8089, '127.0.0.1', resolve));
console.log('[QA] Static dist server listening on http://127.0.0.1:8089');

// 2. Launch Headless Chrome
const userDataDir = path.join(os.tmpdir(), 'chrome-dist-qa-' + Date.now());
const cdpPort = 9279;
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=420,866',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

await new Promise((r) => setTimeout(r, 2000));
const version = await fetch(`http://127.0.0.1:${cdpPort}/json/version`).then((r) => r.json());
const browserWs = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => { browserWs.onopen = r; });

let bId = 1;
const sendBrowser = (method, params = {}) =>
  new Promise((resolve) => {
    const curId = bId++;
    const handler = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id === curId) {
        browserWs.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    browserWs.addEventListener('message', handler);
    browserWs.send(JSON.stringify({ id: curId, method, params }));
  });

const target = await sendBrowser('Target.createTarget', { url: 'http://127.0.0.1:8089/' });
const pageWs = new WebSocket(`ws://127.0.0.1:${cdpPort}/devtools/page/` + target.targetId);
await new Promise((r) => { pageWs.onopen = r; });

let pId = 1;
const sendPage = (method, params = {}) =>
  new Promise((resolve) => {
    const curId = pId++;
    const handler = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id === curId) {
        pageWs.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    pageWs.addEventListener('message', handler);
    pageWs.send(JSON.stringify({ id: curId, method, params }));
  });

const consoleErrors = [];
const fontNetworkRequests = [];

pageWs.addEventListener('message', (evt) => {
  const data = JSON.parse(evt.data);
  if (data.method === 'Log.entryAdded') {
    const { level, text } = data.params.entry;
    if (level === 'error' || level === 'warning') {
      consoleErrors.push(`[${level}] ${text}`);
    }
  }
  if (data.method === 'Runtime.consoleAPICalled') {
    const { type, args } = data.params;
    if (type === 'error' || type === 'warn') {
      consoleErrors.push(`[console.${type}] ` + args.map((a) => a.value || a.description || '').join(' '));
    }
  }
  if (data.method === 'Network.responseReceived') {
    const { url, status, mimeType } = data.params.response;
    if (url.includes('.ttf') || url.includes('/fonts/')) {
      fontNetworkRequests.push({ url, status, mimeType });
    }
  }
});

await sendPage('Page.enable');
await sendPage('DOM.enable');
await sendPage('Runtime.enable');
await sendPage('Log.enable');
await sendPage('Network.enable');

// Navigate to app
await sendPage('Page.navigate', { url: 'http://127.0.0.1:8089/' });
await new Promise((r) => setTimeout(r, 4000));

// Check computed font families and document.fonts status
const evalRes = await sendPage('Runtime.evaluate', {
  expression: `
    (function() {
      const bodyFont = window.getComputedStyle(document.body).fontFamily;
      const rootFont = document.getElementById('root') ? window.getComputedStyle(document.getElementById('root')).fontFamily : 'no-root';
      const loadedFonts = [];
      document.fonts.forEach(f => {
        loadedFonts.push({ family: f.family, status: f.status });
      });
      return {
        bodyFont,
        rootFont,
        loadedFonts,
        title: document.title,
      };
    })()
  `,
  returnByValue: true,
});

console.log('=== QA STATIC DIST VERIFICATION RESULTS ===');
console.log('DOM Font Family (body):', evalRes?.result?.value?.bodyFont);
console.log('DOM Font Family (#root):', evalRes?.result?.value?.rootFont);
console.log('Document loaded fonts count:', evalRes?.result?.value?.loadedFonts?.length);
console.log('Loaded fonts details:', JSON.stringify(evalRes?.result?.value?.loadedFonts, null, 2));

console.log('\n--- Font Network Requests ---');
console.log(`Total font requests captured: ${fontNetworkRequests.length}`);
for (const req of fontNetworkRequests) {
  console.log(`  ${req.status === 200 ? 'OK 200' : 'FAIL ' + req.status}: ${req.url} (${req.mimeType})`);
}

console.log('\n--- Console & OTS Errors ---');
const otsErrors = consoleErrors.filter((e) => e.includes('OTS') || e.includes('font') || e.includes('decode'));
console.log(`OTS / Font Errors count: ${otsErrors.length}`);
if (otsErrors.length > 0) {
  for (const err of otsErrors) {
    console.error('  ERROR:', err);
  }
} else {
  console.log('  PASS: Zero OTS or Font decoding errors found in browser!');
}

console.log('\nAll Console Warnings/Errors count:', consoleErrors.length);
for (const err of consoleErrors.slice(0, 10)) {
  console.log('  log:', err);
}

// Clean up
browserWs.close();
pageWs.close();
chrome.kill();
server.close();

const pass = otsErrors.length === 0 && fontNetworkRequests.length > 0;
console.log(`\nOVERALL QA STATUS: ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
