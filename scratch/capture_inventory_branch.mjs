import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const brainDir = 'C:\\Users\\UltraPC\\.gemini\\antigravity\\brain\\a3479d8e-d211-4fa7-b63e-877e04888cfe';

async function run() {
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9232',
    '--disable-gpu',
    '--window-size=1440,900',
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

    const target = await send('Target.createTarget', { url: 'http://77.83.206.192/admin/' });
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
    await sendPage('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 1000));

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

    // Nav to Ombor
    await sendPage('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('.nav-item'));
          const target = btns.find(b => b.textContent.includes('Ombor'));
          if (target) target.click();
        })()
      `,
    });
    await new Promise(r => setTimeout(r, 2000));

    // Select first branch
    await sendPage('Runtime.evaluate', {
      expression: `
        (() => {
          const select = document.querySelector('.inv-branch-select');
          if (select && select.options.length > 1) {
            select.selectedIndex = 1;
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `,
    });
    await new Promise(r => setTimeout(r, 2500));

    const shotDark = await sendPage('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(`${brainDir}\\live_vps_inventory_with_branch_dark.png`, Buffer.from(shotDark.data, 'base64'));
    console.log('Saved live_vps_inventory_with_branch_dark.png');

    // Switch to light mode
    await sendPage('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = document.querySelector('.topbar-theme-toggle');
          if (btn) btn.click();
        })()
      `,
    });
    await new Promise(r => setTimeout(r, 2000));

    const shotLight = await sendPage('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(`${brainDir}\\live_vps_inventory_with_branch_light.png`, Buffer.from(shotLight.data, 'base64'));
    console.log('Saved live_vps_inventory_with_branch_light.png');

  } catch (err) {
    console.error(err);
  } finally {
    chrome.kill();
    process.exit(0);
  }
}
run();
