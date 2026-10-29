import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const width = 1440;
const height = 900;
const url = 'http://77.83.206.192/admin/';
const brainDir = 'C:\\Users\\UltraPC\\.gemini\\antigravity\\brain\\a3479d8e-d211-4fa7-b63e-877e04888cfe';

async function run() {
  const loginRes = await fetch('http://77.83.206.192/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@vaksinamed.uz', password: 'vaksinamed' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;

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

    // Nav to Kassa POS
    await sendPage('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('.nav-item'));
          const target = btns.find(b => b.textContent.includes('Kassa POS'));
          if (target) target.click();
        })()
      `,
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Enter customer QR and lookup
    await sendPage('Runtime.evaluate', {
      expression: `
        (() => {
          const input = document.querySelector('.pos-scan-field input');
          if (input) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeInputValueSetter.call(input, 'VM-00000001');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          setTimeout(() => {
            const btn = document.querySelector('.pos-scan-go');
            if (btn) btn.click();
          }, 300);
        })()
      `,
    });
    await new Promise((r) => setTimeout(r, 2500));

    // Click 50 000 quick chip
    await sendPage('Runtime.evaluate', {
      expression: `
        (() => {
          const chips = Array.from(document.querySelectorAll('.pos-chip'));
          const chip50k = chips.find(c => c.textContent.trim() === '50 000');
          if (chip50k) chip50k.click();
        })()
      `,
    });
    await new Promise((r) => setTimeout(r, 2500));

    // Screenshot in Dark Mode (Active Sale Flow)
    const shotDark = await sendPage('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(`${brainDir}\\live_vps_kassa_pos_dark_active.png`, Buffer.from(shotDark.data, 'base64'));
    console.log('Saved live_vps_kassa_pos_dark_active.png');

    // Switch to Light Mode
    await sendPage('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = document.querySelector('.topbar-theme-toggle');
          if (btn) btn.click();
        })()
      `,
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Screenshot in Light Mode (Active Sale Flow)
    const shotLight = await sendPage('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(`${brainDir}\\live_vps_kassa_pos_light_active.png`, Buffer.from(shotLight.data, 'base64'));
    console.log('Saved live_vps_kassa_pos_light_active.png');

  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    chrome.kill();
    process.exit(0);
  }
}

run();
