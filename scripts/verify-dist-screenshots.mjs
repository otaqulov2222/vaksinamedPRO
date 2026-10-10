import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const distDir = path.resolve('artifacts/soglom-apteka/dist');
const ARTIFACTS_DIR = 'C:\\Users\\UltraPC\\.gemini\\antigravity\\brain\\a3479d8e-d211-4fa7-b63e-877e04888cfe';

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

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  let filePath = path.join(distDir, reqPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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

// Get auth token from local api
let token = null;
try {
  const loginRes = await fetch('http://127.0.0.1:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+998 90 123 45 67', password: '123456' }),
  }).then((r) => r.json());
  token = loginRes?.token;
} catch (e) {
  console.log('API login skipped:', e.message);
}

const userDataDir = path.join(os.tmpdir(), 'chrome-dist-screenshots-' + Date.now());
const cdpPort = 9281;
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=430,932',
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

await sendPage('Page.enable');
await sendPage('DOM.enable');
await sendPage('Runtime.enable');
await sendPage('Emulation.setDeviceMetricsOverride', {
  width: 420,
  height: 866,
  deviceScaleFactor: 2,
  mobile: true,
});

await sendPage('Page.navigate', { url: 'http://127.0.0.1:8089/' });
await new Promise((r) => setTimeout(r, 2000));

if (token) {
  await sendPage('Runtime.evaluate', {
    expression: `
      localStorage.setItem('vaksinamed-customer-token', ${JSON.stringify(token)});
      localStorage.setItem('vaksinamed-session-ended', '0');
    `,
  });
  await sendPage('Page.navigate', { url: 'http://127.0.0.1:8089/(tabs)' });
  await new Promise((r) => setTimeout(r, 3000));
}

// Screenshot Home screen
const homeShot = await sendPage('Page.captureScreenshot', { format: 'png' });
const homePath = path.join(ARTIFACTS_DIR, 'staging_parity_home_420_866.png');
fs.writeFileSync(homePath, Buffer.from(homeShot.data, 'base64'));
console.log('Saved home screenshot:', homePath);

// Navigate to Catalog
await sendPage('Page.navigate', { url: 'http://127.0.0.1:8089/(tabs)/catalog' });
await new Promise((r) => setTimeout(r, 2000));
const catalogShot = await sendPage('Page.captureScreenshot', { format: 'png' });
const catalogPath = path.join(ARTIFACTS_DIR, 'staging_parity_catalog_420_866.png');
fs.writeFileSync(catalogPath, Buffer.from(catalogShot.data, 'base64'));
console.log('Saved catalog screenshot:', catalogPath);

// Navigate to QR
await sendPage('Page.navigate', { url: 'http://127.0.0.1:8089/qr' });
await new Promise((r) => setTimeout(r, 2000));
const qrShot = await sendPage('Page.captureScreenshot', { format: 'png' });
const qrPath = path.join(ARTIFACTS_DIR, 'staging_parity_qr_420_866.png');
fs.writeFileSync(qrPath, Buffer.from(qrShot.data, 'base64'));
console.log('Saved qr screenshot:', qrPath);

browserWs.close();
pageWs.close();
chrome.kill();
server.close();
console.log('All screenshots captured successfully!');
