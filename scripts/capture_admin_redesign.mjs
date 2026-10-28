import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\UltraPC\\.gemini\\antigravity\\brain\\a3479d8e-d211-4fa7-b63e-877e04888cfe';

const userDataDir = path.join(os.tmpdir(), 'chrome-admin-redesign-' + Date.now());
const cdpPort = 9330;
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,900',
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

const target = await sendBrowser('Target.createTarget', { url: 'http://77.83.206.192/admin/' });
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
await sendPage('Network.enable');

// 1. Login via API to get token
const loginRes = await fetch('http://77.83.206.192/api/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@vaksinamed.uz', password: 'vaksinamed' }),
}).then((r) => r.json());

const token = loginRes.token;

await sendPage('Page.navigate', { url: 'http://77.83.206.192/admin/' });
await new Promise((r) => setTimeout(r, 1500));

// Store token in localStorage
await sendPage('Runtime.evaluate', {
  expression: `
    localStorage.setItem('vm-admin-token', '${token}');
    location.reload();
  `,
});

await new Promise((r) => setTimeout(r, 4500));

const screenshot = await sendPage('Page.captureScreenshot', { format: 'png' });
const buf = Buffer.from(screenshot.data, 'base64');
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'live_vps_admin_dashboard_redesigned.png'), buf);
console.log('Saved live_vps_admin_dashboard_redesigned.png');

pageWs.close();
browserWs.close();
chrome.kill();
