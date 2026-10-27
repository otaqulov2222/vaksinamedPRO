import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\UltraPC\\.gemini\\antigravity\\brain\\a3479d8e-d211-4fa7-b63e-877e04888cfe';
const token = 's1.2781c7c7ffeb295a8338c82853a4bc6a.02c831a047569b55531e71370a9c33d84836b1eb658dbf45c5d649a3519e5c71';

const userDataDir = path.join(os.tmpdir(), 'chrome-reminders-' + Date.now());
const cdpPort = 9283;
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=390,844',
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

const target = await sendBrowser('Target.createTarget', { url: 'http://77.83.206.192/' });
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
await sendPage('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});

await sendPage('Network.setCookie', {
  name: 'vm_customer_token',
  value: token,
  domain: '77.83.206.192',
  path: '/',
});

await new Promise((r) => setTimeout(r, 1500));

// Setup localstorage
await sendPage('Runtime.evaluate', {
  expression: `
    localStorage.setItem('vaksinamed-customer-token', '${token}');
    localStorage.setItem('vaksinamed_session_ended', 'false');
    localStorage.setItem('vaksinamed-preferred-language', 'uz');
    localStorage.setItem('vm_token', '${token}');
    localStorage.setItem('vm_customer_token', '${token}');
  `,
});

// Now navigate directly to /reminders
console.log('Navigating to /reminders...');
await sendPage('Page.navigate', { url: 'http://77.83.206.192/reminders' });
await new Promise((r) => setTimeout(r, 4000));

// Capture today tab
let shot = await sendPage('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'live_vps_reminders_today.png'), Buffer.from(shot.data, 'base64'));
console.log('Saved live_vps_reminders_today.png');

// Click 3rd tab: "Oila a‘zolari"
const clickResult = await sendPage('Runtime.evaluate', {
  expression: `
    (() => {
      const els = Array.from(document.querySelectorAll('*'));
      for (const el of els) {
        if (el.children.length === 0 && el.innerText && el.innerText.includes('Oila a‘zolari')) {
          el.click();
          return 'clicked by innerText: ' + el.innerText;
        }
      }
      return 'not found';
    })()
  `,
});
console.log('Tab click result:', clickResult);
await new Promise((r) => setTimeout(r, 2000));

// Capture family tab view
shot = await sendPage('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'live_vps_reminders_family.png'), Buffer.from(shot.data, 'base64'));
console.log('Saved live_vps_reminders_family.png');

// Now click "+ Oila a'zosi" or hero add button to open the modal
const clickAddResult = await sendPage('Runtime.evaluate', {
  expression: `
    (() => {
      const els = Array.from(document.querySelectorAll('*'));
      for (const el of els) {
        if (el.children.length === 0 && el.innerText && (el.innerText.includes('Oila a‘zosi') || el.innerText.includes('Yangi oila a‘zosi'))) {
          el.click();
          return 'clicked add: ' + el.innerText;
        }
      }
      return 'not found';
    })()
  `,
});
console.log('Add member click result:', clickAddResult);
await new Promise((r) => setTimeout(r, 1500));

shot = await sendPage('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'live_vps_add_family_member_modal.png'), Buffer.from(shot.data, 'base64'));
console.log('Saved live_vps_add_family_member_modal.png');

browserWs.close();
pageWs.close();
chrome.kill();
process.exit(0);
