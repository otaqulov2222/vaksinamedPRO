import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const width = 1440;
const height = 900;
const url = 'http://77.83.206.192/admin/';
const brainDir = 'C:\\Users\\UltraPC\\.gemini\\antigravity\\brain\\a3479d8e-d211-4fa7-b63e-877e04888cfe';

async function run() {
  console.log('Logging in to VPS API...');
  const loginRes = await fetch('http://77.83.206.192/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@vaksinamed.uz', password: 'vaksinamed' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  if (!token) throw new Error('Failed to get token: ' + JSON.stringify(loginData));
  console.log('Logged in successfully, token received.');

  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9232',
    '--disable-gpu',
    `--window-size=${width},${height}`,
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    let version = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const res = await fetch('http://localhost:9232/json/version');
        version = await res.json();
        if (version?.webSocketDebuggerUrl) break;
      } catch {}
    }

    if (!version?.webSocketDebuggerUrl) throw new Error('Chrome remote debugging not ready');

    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((r) => { ws.onopen = r; });

    let id = 1;
    const send = (method, params = {}) => new Promise((resolve) => {
      const curId = id++;
      const handler = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.id === curId) {
          ws.removeEventListener('message', handler);
          resolve(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });

    const target = await send('Target.createTarget', { url });
    const targetWs = new WebSocket(`ws://localhost:9232/devtools/page/${target.targetId}`);
    await new Promise((r) => { targetWs.onopen = r; });

    let pageId = 1;
    const sendPage = (method, params = {}) => new Promise((resolve) => {
      const curId = pageId++;
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
    await sendPage('Runtime.enable');
    await sendPage('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await new Promise((r) => setTimeout(r, 1000));

    // Inject token and theme=dark in localStorage
    await sendPage('Runtime.evaluate', {
      expression: `
        (() => {
          localStorage.setItem('vm-admin-token', '${token}');
          localStorage.setItem('vm_theme', 'dark');
          window.location.reload();
        })()
      `,
    });

    await new Promise((r) => setTimeout(r, 4000));

    async function navigateToTab(tabLabel) {
      const res = await sendPage('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('.nav-item'));
            const target = btns.find(b => {
              const label = b.querySelector('.nav-label')?.textContent?.trim() || b.textContent.trim();
              return label.toLowerCase() === '${tabLabel}'.toLowerCase();
            });
            if (target) {
              target.click();
              return 'clicked ' + target.textContent.trim();
            }
            return 'not found: ' + '${tabLabel}' + ' in ' + btns.map(b => b.textContent.trim()).join(', ');
          })()
        `,
        returnByValue: true,
      });
      console.log('Nav:', res?.result?.value);
      await new Promise((r) => setTimeout(r, 2000));
    }

    async function takeScreenshot(fileName) {
      const shot = await sendPage('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(`${brainDir}\\${fileName}`, Buffer.from(shot.data, 'base64'));
      console.log(`Saved ${fileName}`);
    }

    // 1. Kassa POS in Dark Mode
    console.log('Navigating to Kassa POS (dark)...');
    await navigateToTab('Kassa POS');
    await takeScreenshot('live_vps_kassa_pos_dark_overhaul.png');

    // 2. Switch to Light Mode by clicking the topbar theme toggle button
    console.log('Switching to Light Mode via topbar toggle...');
    await sendPage('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = document.querySelector('.topbar-theme-toggle');
          if (btn) btn.click();
        })()
      `,
    });
    await new Promise((r) => setTimeout(r, 2000));
    console.log('Capturing Kassa POS (light)...');
    await takeScreenshot('live_vps_kassa_pos_light_overhaul.png');

    console.log('All Kassa POS screenshots captured successfully!');
  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    chrome.kill();
    process.exit(0);
  }
}

run();
