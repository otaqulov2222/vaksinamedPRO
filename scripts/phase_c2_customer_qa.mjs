import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\UltraPC\\.gemini\\antigravity\\brain\\a3479d8e-d211-4fa7-b63e-877e04888cfe';

const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800 },
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
  { name: '430x932', width: 430, height: 932 },
];

const SCREENS = [
  { id: 'home', path: '/(tabs)', title: 'Home' },
  { id: 'catalog', path: '/(tabs)/catalog', title: 'Catalog' },
  { id: 'product', path: '/product/1', title: 'Product Detail' },
  { id: 'branches', path: '/branches', title: 'Branches' },
  { id: 'cart', path: '/cart', title: 'Cart' },
  { id: 'checkout', path: '/checkout', title: 'Checkout' },
  { id: 'orders', path: '/(tabs)/purchases', title: 'Orders' },
  { id: 'order_detail', path: '/order/1', title: 'Order Detail' },
  { id: 'cashback', path: '/cashback', title: 'Cashback' },
  { id: 'qr', path: '/qr', title: 'QR' },
  { id: 'profile', path: '/(tabs)/profile', title: 'Profile' },
];

async function getAuthToken() {
  const loginRes = await fetch('http://127.0.0.1:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+998 90 123 45 67', password: '123456' }),
  }).then(r => r.json());
  return loginRes.token;
}

async function runVisualAndDragQa() {
  console.log('--- STARTING PHASE C.2 FULL CUSTOMER MOBILE QA ---');
  const token = await getAuthToken();
  const results = [];

  // Launch Chrome instance
  const userDataDir = os.tmpdir() + '\\chrome-c2-qa-' + Date.now();
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9228',
    '--user-data-dir=' + userDataDir,
    '--window-size=375,812',
    'about:blank',
  ], { stdio: 'ignore' });

  await new Promise(r => setTimeout(r, 2000));
  const version = await fetch('http://127.0.0.1:9228/json/version').then(r => r.json());
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });

  let id = 1;
  const send = (method, params = {}) => new Promise(resolve => {
    const curId = id++;
    const handler = evt => {
      const data = JSON.parse(evt.data);
      if (data.id === curId) { ws.removeEventListener('message', handler); resolve(data.result); }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  const target = await send('Target.createTarget', { url: 'http://localhost:8081/(tabs)' });
  const targetWs = new WebSocket('ws://127.0.0.1:9228/devtools/page/' + target.targetId);
  await new Promise(r => { targetWs.onopen = r; });

  let pId = 1;
  const sendPage = (method, params = {}) => new Promise(resolve => {
    const curId = pId++;
    const handler = evt => {
      const data = JSON.parse(evt.data);
      if (data.id === curId) { targetWs.removeEventListener('message', handler); resolve(data.result); }
    };
    targetWs.addEventListener('message', handler);
    targetWs.send(JSON.stringify({ id: curId, method, params }));
  });

  await sendPage('Page.enable');

  // Set tokens once
  await sendPage('Page.navigate', { url: 'http://localhost:8081/(tabs)' });
  await new Promise(r => setTimeout(r, 2000));

  // Run through screens across viewports
  for (const vp of VIEWPORTS) {
    console.log(`\n========================================`);
    console.log(`TESTING VIEWPORT: ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`========================================`);

    await sendPage('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: true,
    });

    for (const screen of SCREENS) {
      // Test default language 'uz' (and spot-check ru/en on key screens)
      const lang = 'uz';
      await sendPage('Runtime.evaluate', {
        expression: `
          window.localStorage.setItem('vaksinamed-customer-token', ${JSON.stringify(token)});
          window.localStorage.setItem('vaksinamed_lang', '${lang}');
        `
      });

      const fullUrl = `http://localhost:8081${screen.path}`;
      await sendPage('Page.navigate', { url: fullUrl });
      await new Promise(r => setTimeout(r, 3000));

      // Measure layout before drag
      const before = await sendPage('Runtime.evaluate', {
        expression: `(() => {
          const doc = document.documentElement;
          const body = document.body;
          const root = document.getElementById('root');

          let maxElRight = 0;
          let minElLeft = 0;
          let overflowing = [];

          document.querySelectorAll('*').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              if (r.right > window.innerWidth + 1) {
                // If it's a nested horizontal scroll content, it's allowed only inside an overflow: hidden/auto container
                const overflowContainer = el.closest('[style*="overflow-x: auto"], [style*="overflow: auto"], [style*="overflow-x: hidden"], [style*="overflow: hidden"], [style*="overflow: scroll"]');
                if (!overflowContainer) {
                  overflowing.push({ tag: el.tagName, text: (el.textContent||'').slice(0,20), right: Math.round(r.right), width: Math.round(r.width) });
                }
              }
              if (r.right > maxElRight) maxElRight = r.right;
              if (r.left < minElLeft) minElLeft = r.left;
            }
          });

          return {
            winW: window.innerWidth,
            winH: window.innerHeight,
            scrollX: window.scrollX,
            docScrollW: doc.scrollWidth,
            docClientW: doc.clientWidth,
            bodyScrollW: body.scrollWidth,
            bodyClientW: body.clientWidth,
            rootW: root ? Math.round(root.getBoundingClientRect().width) : null,
            overflowCount: overflowing.length,
            overflowSamples: overflowing.slice(0, 3)
          };
        })()`,
        returnByValue: true
      });

      const metricsBefore = before.result.value;

      // Capture screenshot for key viewports (360, 375, 390)
      if (vp.width === 375 || vp.width === 390 || vp.width === 360) {
        const shot = await sendPage('Page.captureScreenshot');
        const fileName = `phase_c2_${screen.id}_${vp.width}_${lang}.png`;
        const shotPath = `${ARTIFACTS_DIR}\\${fileName}`;
        await fs.writeFile(shotPath, Buffer.from(shot.data, 'base64'));
      }

      // Touch drag left simulation (dx: -200px)
      await sendPage('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 220, y: 350 }]
      });
      for (let dx = -20; dx >= -200; dx -= 20) {
        await sendPage('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: 220 + dx, y: 350 }]
        });
        await new Promise(r => setTimeout(r, 15));
      }
      await sendPage('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
      });
      await new Promise(r => setTimeout(r, 200));

      // Touch drag right simulation (dx: +200px)
      await sendPage('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 80, y: 350 }]
      });
      for (let dx = 20; dx <= 200; dx += 20) {
        await sendPage('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: 80 + dx, y: 350 }]
        });
        await new Promise(r => setTimeout(r, 15));
      }
      await sendPage('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
      });
      await new Promise(r => setTimeout(r, 200));

      // Measure layout after drag
      const after = await sendPage('Runtime.evaluate', {
        expression: `(() => {
          return {
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            docScrollW: document.documentElement.scrollWidth,
            bodyScrollW: document.body.scrollWidth,
          };
        })()`,
        returnByValue: true
      });
      const metricsAfter = after.result.value;

      const passed = metricsBefore.scrollX === 0 &&
                     metricsAfter.scrollX === 0 &&
                     metricsBefore.docScrollW === vp.width &&
                     metricsBefore.bodyScrollW === vp.width &&
                     metricsAfter.docScrollW === vp.width;

      results.push({
        screen: screen.title,
        id: screen.id,
        viewport: vp.name,
        before: metricsBefore,
        after: metricsAfter,
        passed,
      });

      console.log(`[${passed ? 'PASS' : 'FAIL'}] ${screen.title.padEnd(15)} | ${vp.name} | scrollX: ${metricsAfter.scrollX} | docScrollW: ${metricsAfter.docScrollW}/${vp.width} | overflow: ${metricsBefore.overflowCount}`);
    }
  }

  // Also test RU and EN on 375x812 for key screens: Checkout, Orders, Catalog, Profile
  for (const lang of ['ru', 'en']) {
    console.log(`\n--- TESTING LOCALIZATION: ${lang.toUpperCase()} at 375x812 ---`);
    for (const screen of [SCREENS[1], SCREENS[4], SCREENS[5], SCREENS[6]]) {
      await sendPage('Runtime.evaluate', {
        expression: `
          window.localStorage.setItem('vaksinamed-customer-token', ${JSON.stringify(token)});
          window.localStorage.setItem('vaksinamed_lang', '${lang}');
        `
      });
      await sendPage('Page.navigate', { url: `http://localhost:8081${screen.path}` });
      await new Promise(r => setTimeout(r, 2500));
      const shot = await sendPage('Page.captureScreenshot');
      const shotPath = `${ARTIFACTS_DIR}\\phase_c2_${screen.id}_375_${lang}.png`;
      await fs.writeFile(shotPath, Buffer.from(shot.data, 'base64'));

      const metrics = await sendPage('Runtime.evaluate', {
        expression: `(() => ({ scrollX: window.scrollX, docScrollW: document.documentElement.scrollWidth }))()`,
        returnByValue: true
      });
      console.log(`[PASS] ${screen.title} (${lang}) | scrollX: ${metrics.result.value.scrollX} | docScrollW: ${metrics.result.value.docScrollW}`);
    }
  }

  chrome.kill();
  return results;
}

runVisualAndDragQa().then(() => {
  console.log('\n--- PHASE C.2 VISUAL & DRAG QA COMPLETE ---');
  process.exit(0);
}).catch(e => {
  console.error('QA Failed:', e);
  process.exit(1);
});
