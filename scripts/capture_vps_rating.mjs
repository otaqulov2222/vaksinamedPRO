import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\UltraPC\\.gemini\\antigravity\\brain\\a3479d8e-d211-4fa7-b63e-877e04888cfe';
const token = 's1.2781c7c7ffeb295a8338c82853a4bc6a.02c831a047569b55531e71370a9c33d84836b1eb658dbf45c5d649a3519e5c71';

const userDataDir = path.join(os.tmpdir(), 'chrome-rating-' + Date.now());
const cdpPort = 9296;
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

// 1. View Purchases list /purchases
console.log('Navigating to /purchases...');
await sendPage('Page.navigate', { url: 'http://77.83.206.192/purchases' });
await new Promise((r) => setTimeout(r, 3500));

const shotPurchases = await sendPage('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'live_vps_purchases_rating_cta.png'), Buffer.from(shotPurchases.data, 'base64'));
console.log('Saved live_vps_purchases_rating_cta.png');

// 2. View Order Detail /order/5
console.log('Navigating to /order/5...');
await sendPage('Page.navigate', { url: 'http://77.83.206.192/order/5' });
await new Promise((r) => setTimeout(r, 3500));

// Scroll down slightly to show rating card
await sendPage('Runtime.evaluate', { expression: 'window.scrollBy(0, 450);' });
await new Promise((r) => setTimeout(r, 800));

const shotOrderDetail = await sendPage('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'live_vps_order_detail_rating.png'), Buffer.from(shotOrderDetail.data, 'base64'));
console.log('Saved live_vps_order_detail_rating.png');

// 3. Navigate to /rating?orderId=5
console.log('Navigating to /rating?orderId=5...');
await sendPage('Page.navigate', { url: 'http://77.83.206.192/rating?orderId=5' });
await new Promise((r) => setTimeout(r, 3500));

const shotRating = await sendPage('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'live_vps_rating_screen.png'), Buffer.from(shotRating.data, 'base64'));
console.log('Saved live_vps_rating_screen.png');

// 4. Select 5 stars, tags and comment
await sendPage('Runtime.evaluate', {
  expression: `
    (() => {
      // Find star buttons
      const stars = Array.from(document.querySelectorAll('[aria-label*="Baho: 5"]'));
      if (stars.length) stars[0].click();
      
      const tags = Array.from(document.querySelectorAll('*')).filter(el => 
        el.textContent && (el.textContent === 'Tez xizmat' || el.textContent === 'Tavsiya qilaman' || el.textContent === 'Toza filial')
      );
      tags.forEach(t => t.click());

      const inputs = document.querySelectorAll('textarea');
      if (inputs.length) {
        inputs[0].value = "Juda a'lo darajadagi dorixona va tez xizmat! Rahmat!";
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()
  `,
});
await new Promise((r) => setTimeout(r, 1200));

const shotRatingFilled = await sendPage('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'live_vps_rating_filled.png'), Buffer.from(shotRatingFilled.data, 'base64'));
console.log('Saved live_vps_rating_filled.png');

browserWs.close();
pageWs.close();
chrome.kill();
console.log('All rating screenshots successfully captured!');
process.exit(0);
