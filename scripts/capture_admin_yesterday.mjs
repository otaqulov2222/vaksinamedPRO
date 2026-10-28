import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\UltraPC\\.gemini\\antigravity\\brain\\a3479d8e-d211-4fa7-b63e-877e04888cfe';

const userDataDir = path.join(os.tmpdir(), 'chrome-admin-yesterday-' + Date.now());
const cdpPort = 9335;
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

try {
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
  await sendPage('Runtime.enable');

  pageWs.addEventListener('message', (evt) => {
    const data = JSON.parse(evt.data);
    if (data.method === 'Runtime.exceptionThrown') {
      console.error('Browser exception:', JSON.stringify(data.params.exceptionDetails));
    }
    if (data.method === 'Runtime.consoleAPICalled') {
      console.log('Console:', data.params.type, data.params.args.map(a => a.value || a.description));
    }
  });

  const loginRes = await fetch('http://77.83.206.192/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@vaksinamed.uz', password: 'vaksinamed' }),
  }).then((r) => r.json());

  const token = loginRes.token;

  await sendPage('Page.navigate', { url: 'http://77.83.206.192/admin/' });
  await new Promise((r) => setTimeout(r, 1500));

  await sendPage('Runtime.evaluate', {
    expression: `
      localStorage.setItem('vm-admin-token', '${token}');
      location.reload();
    `,
  });

  await new Promise((r) => setTimeout(r, 4000));

  // 1. Click "Kecha" button
  await sendPage('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('.dash-period-btn'));
        const kecha = btns.find(b => b.textContent.includes('Kecha'));
        if (kecha) kecha.click();
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 2000));

  const screenshot1 = await sendPage('Page.captureScreenshot', { format: 'png' });
  const buf1 = Buffer.from(screenshot1.data, 'base64');
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'live_vps_admin_dashboard_yesterday.png'), buf1);
  console.log('Saved live_vps_admin_dashboard_yesterday.png');

  // 2. Click the topbar date button to show the popup
  await sendPage('Runtime.evaluate', {
    expression: `document.querySelector('.topbar-date')?.click();`,
  });

  await new Promise((r) => setTimeout(r, 800));

  const screenshot2 = await sendPage('Page.captureScreenshot', { format: 'png' });
  const buf2 = Buffer.from(screenshot2.data, 'base64');
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'live_vps_admin_date_popover.png'), buf2);
  console.log('Saved live_vps_admin_date_popover.png');

  pageWs.close();
  browserWs.close();
} finally {
  chrome.kill();
}
