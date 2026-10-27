import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\UltraPC\\.gemini\\antigravity\\brain\\a3479d8e-d211-4fa7-b63e-877e04888cfe';
const token = 's1.2781c7c7ffeb295a8338c82853a4bc6a.02c831a047569b55531e71370a9c33d84836b1eb658dbf45c5d649a3519e5c71';

const userDataDir = path.join(os.tmpdir(), 'chrome-branches-' + Date.now());
const cdpPort = 9286;
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

await new Promise((r) => setTimeout(r, 1000));

await sendPage('Runtime.evaluate', {
  expression: `
    localStorage.setItem('vaksinamed-customer-token', '${token}');
    localStorage.setItem('vaksinamed_session_ended', 'false');
    localStorage.setItem('vaksinamed-preferred-language', 'uz');
    localStorage.setItem('vm_token', '${token}');
    localStorage.setItem('vm_customer_token', '${token}');
  `,
});

console.log('Navigating to /branches...');
await sendPage('Page.navigate', { url: 'http://77.83.206.192/branches' });
await new Promise((r) => setTimeout(r, 4000));

const shot = await sendPage('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'live_vps_branches_screen.png'), Buffer.from(shot.data, 'base64'));
console.log('Saved live_vps_branches_screen.png');

// Scroll down to see branch cards
await sendPage('Runtime.evaluate', {
  expression: `
    (() => {
      const allDivs = document.querySelectorAll('div');
      for (const d of allDivs) {
        if (d.scrollHeight > d.clientHeight && d.clientHeight > 200) {
          d.scrollTop = 500;
        }
      }
      window.scrollTo(0, 500);
    })()
  `,
});
await new Promise((r) => setTimeout(r, 1000));

const shotScrolled = await sendPage('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'live_vps_branches_scrolled.png'), Buffer.from(shotScrolled.data, 'base64'));
console.log('Saved live_vps_branches_scrolled.png');

// Click first branch card
const clickBranch = await sendPage('Runtime.evaluate', {
  expression: `
    (() => {
      const els = Array.from(document.querySelectorAll('*'));
      for (const el of els) {
        if (el.innerText && el.innerText.includes('АСКИЯ')) {
          el.click();
          return 'clicked askiya';
        }
      }
      return 'not found';
    })()
  `,
});
console.log('Click branch result:', clickBranch);
await new Promise((r) => setTimeout(r, 1500));

const shotSelected = await sendPage('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'live_vps_branch_selected.png'), Buffer.from(shotSelected.data, 'base64'));
console.log('Saved live_vps_branch_selected.png');

browserWs.close();
pageWs.close();
chrome.kill();
process.exit(0);
