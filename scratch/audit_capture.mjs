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
  const { token } = await loginRes.json();

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
      await new Promise(r => setTimeout(r, 200));
      try {
        const res = await fetch('http://localhost:9232/json/version');
        version = await res.json();
        if (version?.webSocketDebuggerUrl) break;
      } catch {}
    }

    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise(r => { ws.onopen = r; });

    let id = 1;
    const send = (method, params = {}) => new Promise(resolve => {
      const curId = id++;
      const handler = evt => {
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
    await new Promise(r => { targetWs.onopen = r; });

    let pageId = 1;
    const sendPage = (method, params = {}) => new Promise(resolve => {
      const curId = pageId++;
      const handler = evt => {
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
    await sendPage('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 1000));

    await sendPage('Page.navigate', { url });
    await new Promise(r => setTimeout(r, 2000));

    await sendPage('Runtime.evaluate', {
      expression: `
        (async () => {
          const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@vaksinamed.uz', password: 'vaksinamed' }),
          });
          const data = await res.json();
          if (data.token) {
            localStorage.setItem('vm-admin-token', data.token);
            localStorage.setItem('vm_theme', 'dark');
            window.location.reload();
          }
        })()
      `,
    });
    await new Promise(r => setTimeout(r, 4000));

    async function navAndShot(tabName, fileBase) {
      await sendPage('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('.nav-item'));
            const target = btns.find(b => b.textContent.includes('${tabName}'));
            if (target) target.click();
          })()
        `,
      });
      await new Promise(r => setTimeout(r, 2000));
      const shotDark = await sendPage('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(`${brainDir}\\${fileBase}_dark.png`, Buffer.from(shotDark.data, 'base64'));
      console.log(`Captured ${fileBase}_dark`);
    }

    await navAndShot('Buyurtmalar', 'audit_orders');
    await navAndShot('To‘lovlar', 'audit_payments');
    await navAndShot('Ombor', 'audit_inventory');
    await navAndShot('Katalog', 'audit_catalog');
    await navAndShot('Mijozlar', 'audit_customers');

  } catch (err) {
    console.error(err);
  } finally {
    chrome.kill();
    process.exit(0);
  }
}
run();
