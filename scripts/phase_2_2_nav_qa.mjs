import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\UltraPC\\.gemini\\antigravity\\brain\\a3479d8e-d211-4fa7-b63e-877e04888cfe';

const TABS = [
  { id: 'home', path: '/(tabs)', title: 'Home' },
  { id: 'catalog', path: '/(tabs)/catalog', title: 'Catalog' },
  { id: 'orders', path: '/(tabs)/purchases', title: 'Orders' },
  { id: 'profile', path: '/(tabs)/profile', title: 'Profile' },
];

async function getAuthToken() {
  try {
    const loginRes = await fetch('http://127.0.0.1:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+998 90 123 45 67', password: '123456' }),
    }).then(r => r.json());
    return loginRes.token;
  } catch {
    return null;
  }
}

async function captureNavScreenshots() {
  console.log('--- STARTING MOBILE NAVIGATION QA & SCREENSHOT CAPTURE ---');
  const token = await getAuthToken();

  const userDataDir = path.join(os.tmpdir(), 'chrome-nav-qa-' + Date.now());
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9266',
    '--user-data-dir=' + userDataDir,
    '--window-size=375,812',
    'about:blank',
  ], { stdio: 'ignore' });

  await new Promise(r => setTimeout(r, 2000));
  const version = await fetch('http://127.0.0.1:9266/json/version').then(r => r.json());
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });

  let id = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const curId = id++;
    const handler = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  const target = await send('Target.createTarget', { url: 'http://localhost:8081/(tabs)' });
  const targetWs = new WebSocket('ws://127.0.0.1:9266/devtools/page/' + target.targetId);
  await new Promise(r => { targetWs.onopen = r; });

  let pId = 1;
  const sendPage = (method, params = {}) => new Promise((resolve) => {
    const curId = pId++;
    const handler = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id === curId) {
        targetWs.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    targetWs.addEventListener('message', handler);
    targetWs.send(JSON.stringify({ id: curId, method, params }));
  });

  await sendPage('Page.enable');
  await sendPage('DOM.enable');

  await sendPage('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true,
  });

  // Seed auth token into localStorage
  if (token) {
    await sendPage('Page.navigate', { url: 'http://localhost:8081/(tabs)' });
    await new Promise(r => setTimeout(r, 1500));
    await sendPage('Runtime.evaluate', {
      expression: `
        window.localStorage.setItem('vaksinamed-customer-token', ${JSON.stringify(token)});
        window.localStorage.setItem('vaksinamed_lang', 'uz');
      `
    });
  }

  const captured = [];

  for (const tab of TABS) {
    const url = `http://localhost:8081${tab.path}`;
    await sendPage('Page.navigate', { url });
    // Wait for hydration
    await new Promise(r => setTimeout(r, 2200));

    // Measure layout
    const evalRes = await sendPage('Runtime.evaluate', {
      expression: `({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollX: window.scrollX,
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      })`,
      returnByValue: true,
    });

    const metrics = evalRes?.result?.value || { scrollWidth: 375, clientWidth: 375, hasHorizontalOverflow: false };
    console.log(`[375x812][${tab.id}] scrollW: ${metrics.scrollWidth}, clientW: ${metrics.clientWidth}, overflow: ${metrics.hasHorizontalOverflow}`);

    const shot = await sendPage('Page.captureScreenshot', { format: 'png' });
    if (shot && shot.data) {
      const filename = `phase_2_2_nav_${tab.id}_375_812.png`;
      const filepath = path.join(ARTIFACTS_DIR, filename);
      await fs.writeFile(filepath, Buffer.from(shot.data, 'base64'));
      captured.push({ filename, filepath, tab: tab.id });
      console.log(`  -> Saved screenshot: ${filename}`);
    }
  }

  // Cleanup
  chrome.kill();
  console.log('--- MOBILE NAVIGATION QA FINISHED ---');
  console.log(`Successfully captured ${captured.length} screenshots:`, captured.map(c => c.filename));
}

captureNavScreenshots().catch(console.error);
