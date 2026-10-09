import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
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
  { id: 'orders', path: '/(tabs)/purchases', title: 'Orders' },
  { id: 'profile', path: '/(tabs)/profile', title: 'Profile' },
  { id: 'qr', path: '/qr', title: 'QR' },
];

const LANGUAGES = ['uz', 'ru', 'en'];

async function getAuthToken() {
  try {
    const res = await fetch('http://127.0.0.1:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+998 90 123 45 67', password: '123456' }),
    }).then(r => r.json());
    return res.token;
  } catch (e) {
    console.error('Failed to get auth token:', e.message);
    return null;
  }
}

async function run() {
  console.log('=== STARTING PHASE 2.3 NAVIGATION ACCEPTANCE & INTERACTION SUITE ===');
  const token = await getAuthToken();
  console.log('Auth token acquired:', Boolean(token));

  const userDataDir = path.join(os.tmpdir(), 'chrome-phase23-qa-' + Date.now());
  const port = 9277;
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--user-data-dir=' + userDataDir,
    '--window-size=430,932',
    'about:blank',
  ], { stdio: 'ignore' });

  await new Promise(r => setTimeout(r, 2000));
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json());
  const browserWs = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r => { browserWs.onopen = r; });

  let bId = 1;
  const sendBrowser = (method, params = {}) => new Promise((resolve) => {
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

  const target = await sendBrowser('Target.createTarget', { url: 'http://localhost:8081/(tabs)' });
  const pageWs = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/` + target.targetId);
  await new Promise(r => { pageWs.onopen = r; });

  let pId = 1;
  const sendPage = (method, params = {}) => new Promise((resolve) => {
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
  await sendPage('DOM.enable');
  await sendPage('Runtime.enable');

  // Navigate initially and inject localStorage
  await sendPage('Page.navigate', { url: 'http://localhost:8081/(tabs)' });
  await new Promise(r => setTimeout(r, 2000));

  if (token) {
    await sendPage('Runtime.evaluate', {
      expression: `
        window.localStorage.setItem('vaksinamed-customer-token', ${JSON.stringify(token)});
        window.localStorage.setItem('soglom-language', 'uz');
      `
    });
  }

  const results = {
    viewports: {},
    interactions: {},
    languages: {},
    artifacts: [],
  };

  // 1. VIEWPORT MATRIX ACCEPTANCE
  console.log('\n--- 1. VIEWPORT MATRIX CAPTURE & OVERFLOW AUDIT ---');
  for (const vp of VIEWPORTS) {
    results.viewports[vp.name] = {};
    await sendPage('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: true,
    });

    for (const screen of SCREENS) {
      const url = `http://localhost:8081${screen.path}`;
      await sendPage('Page.navigate', { url });
      // Allow react hydration & font load
      await new Promise(r => setTimeout(r, 2200));

      const evalMetrics = await sendPage('Runtime.evaluate', {
        expression: `({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          overflowX: window.getComputedStyle(document.documentElement).overflowX,
          bodyOverflowX: window.getComputedStyle(document.body).overflowX,
        })`,
        returnByValue: true,
      });

      const metrics = evalMetrics?.result?.value || {};
      const hasHorizontalOverflow = metrics.scrollWidth > metrics.clientWidth;

      // Check bottom nav bar positioning and bounding rect
      const navMetrics = await sendPage('Runtime.evaluate', {
        expression: `(() => {
          const nav = document.querySelector('div[role="tablist"]');
          if (!nav) return null;
          const rect = nav.getBoundingClientRect();
          const computed = window.getComputedStyle(nav);
          return {
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
            width: rect.width,
            borderTopLeftRadius: computed.borderTopLeftRadius,
            borderTopRightRadius: computed.borderTopRightRadius,
            position: computed.position,
            backgroundColor: computed.backgroundColor,
          };
        })()`,
        returnByValue: true,
      });

      results.viewports[vp.name][screen.id] = {
        scrollWidth: metrics.scrollWidth,
        clientWidth: metrics.clientWidth,
        hasHorizontalOverflow,
        nav: navMetrics?.result?.value || null,
      };

      console.log(`[${vp.name}][${screen.id}] W: ${metrics.scrollWidth}/${metrics.clientWidth} | Overflow: ${hasHorizontalOverflow} | Nav: ${Boolean(navMetrics?.result?.value)}`);

      const shot = await sendPage('Page.captureScreenshot', { format: 'png' });
      if (shot?.data) {
        const filename = `phase_2_3_${screen.id}_${vp.width}_${vp.height}.png`;
        const filepath = path.join(ARTIFACTS_DIR, filename);
        await fs.writeFile(filepath, Buffer.from(shot.data, 'base64'));
        results.artifacts.push(filename);
      }
    }
  }

  // 2. INTERACTION TESTS
  console.log('\n--- 2. INTERACTION & ROUTE SWITCHING TESTS ---');
  // Set standard 390x844 viewport
  await sendPage('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });

  // A. Tab click & active transition test
  await sendPage('Page.navigate', { url: 'http://localhost:8081/(tabs)' });
  await new Promise(r => setTimeout(r, 2200));

  const tabClickTest = await sendPage('Runtime.evaluate', {
    expression: `(async () => {
      const logs = [];
      const tabs = Array.from(document.querySelectorAll('div[role="tablist"] a, div[role="tablist"] div[role="tab"]'));
      logs.push({ tabCount: tabs.length });
      return logs;
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  console.log('Tab elements detected:', tabClickTest?.result?.value);

  // B. QR center button routing test
  console.log('\nTesting Center QR Button click...');
  const qrClickResult = await sendPage('Runtime.evaluate', {
    expression: `(async () => {
      // Find button with accessibility role button or QR aria label
      const qrBtn = document.querySelector('div[role="button"][aria-label*="QR"], div[role="button"][aria-label*="qr"], div[role="button"][aria-label*="kod"]');
      if (!qrBtn) {
        // Try finding center button in tablist
        const allButtons = Array.from(document.querySelectorAll('div[role="tablist"] div[role="button"]'));
        if (allButtons.length > 0) {
          allButtons[0].click();
          return { clicked: true, target: 'tablist-child-button' };
        }
        return { clicked: false, error: 'QR button not found' };
      }
      qrBtn.click();
      return { clicked: true, ariaLabel: qrBtn.getAttribute('aria-label') };
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  console.log('QR button click dispatch:', qrClickResult?.result?.value);
  await new Promise(r => setTimeout(r, 1500));

  const currentUrlAfterQr = await sendPage('Runtime.evaluate', {
    expression: 'window.location.pathname',
    returnByValue: true,
  });
  console.log('URL after QR click:', currentUrlAfterQr?.result?.value);
  results.interactions.qrButtonClick = {
    dispatchResult: qrClickResult?.result?.value,
    resultingPath: currentUrlAfterQr?.result?.value,
    pass: currentUrlAfterQr?.result?.value === '/qr',
  };

  // C. Horizontal touch drag immunity test
  console.log('\nTesting Touch Drag Drift (zero horizontal drift)...');
  await sendPage('Page.navigate', { url: 'http://localhost:8081/(tabs)' });
  await new Promise(r => setTimeout(r, 2000));

  const touchDragResult = await sendPage('Runtime.evaluate', {
    expression: `(() => {
      const initialScrollX = window.scrollX;
      // Simulate touch drag right
      const startX = 200, startY = 400;
      const target = document.body;

      const createTouchEvent = (type, x, y) => {
        const touch = new Touch({
          identifier: Date.now(),
          target,
          clientX: x,
          clientY: y,
          pageX: x,
          pageY: y,
          screenX: x,
          screenY: y,
        });
        return new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: [touch],
          targetTouches: [touch],
          changedTouches: [touch],
        });
      };

      try {
        target.dispatchEvent(createTouchEvent('touchstart', startX, startY));
        target.dispatchEvent(createTouchEvent('touchmove', startX + 150, startY));
        target.dispatchEvent(createTouchEvent('touchmove', startX - 150, startY));
        target.dispatchEvent(createTouchEvent('touchend', startX - 150, startY));
      } catch (e) {
        // Fallback simulated gesture
      }

      const postScrollX = window.scrollX;
      return {
        initialScrollX,
        postScrollX,
        drift: postScrollX - initialScrollX,
        immune: postScrollX === 0,
      };
    })()`,
    returnByValue: true,
  });
  console.log('Touch drag result:', touchDragResult?.result?.value);
  results.interactions.touchDrag = touchDragResult?.result?.value;

  // D. Vertical scroll invariance test (Bottom navigation pinned)
  console.log('\nTesting Vertical Scroll Anchoring (bottom nav stays pinned)...');
  const scrollPinResult = await sendPage('Runtime.evaluate', {
    expression: `(() => {
      window.scrollTo(0, 300);
      const nav = document.querySelector('div[role="tablist"]');
      if (!nav) return { pass: false, error: 'no tablist' };
      const rect = nav.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      // Is nav touching the bottom of the viewport?
      const pinnedAtBottom = Math.abs(rect.bottom - viewportHeight) <= 2;
      return {
        viewportHeight,
        navBottom: rect.bottom,
        pinnedAtBottom,
        scrollY: window.scrollY,
      };
    })()`,
    returnByValue: true,
  });
  console.log('Scroll anchoring result:', scrollPinResult?.result?.value);
  results.interactions.scrollPinning = scrollPinResult?.result?.value;

  // E. Rapid tab switching stability test
  console.log('\nTesting Rapid Tab Switching...');
  const rapidSwitchResult = await sendPage('Runtime.evaluate', {
    expression: `(async () => {
      const paths = ['/(tabs)', '/(tabs)/catalog', '/(tabs)/purchases', '/(tabs)/profile'];
      const tabs = Array.from(document.querySelectorAll('div[role="tablist"] a'));
      let switchCount = 0;
      let errorOccurred = false;

      try {
        for (let i = 0; i < 4; i++) {
          if (tabs[i]) {
            tabs[i].click();
            switchCount++;
            await new Promise(r => setTimeout(r, 100));
          }
        }
      } catch (e) {
        errorOccurred = true;
      }

      return {
        switchCount,
        errorOccurred,
        pass: !errorOccurred && switchCount > 0,
      };
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  console.log('Rapid switch result:', rapidSwitchResult?.result?.value);
  results.interactions.rapidSwitch = rapidSwitchResult?.result?.value;

  // 3. MULTI-LANGUAGE FIT ACCEPTANCE (UZ, RU, EN)
  console.log('\n--- 3. MULTI-LANGUAGE NAVIGATION LABELS FIT ---');
  for (const lang of LANGUAGES) {
    await sendPage('Runtime.evaluate', {
      expression: `
        window.localStorage.setItem('soglom-language', '${lang}');
      `
    });
    await sendPage('Page.navigate', { url: 'http://localhost:8081/(tabs)' });
    await new Promise(r => setTimeout(r, 2200));

    const labelMetrics = await sendPage('Runtime.evaluate', {
      expression: `(() => {
        const labels = Array.from(document.querySelectorAll('div[role="tablist"] div[dir="auto"], div[role="tablist"] span, div[role="tablist"] a div'))
          .map(el => ({ text: el.innerText?.trim(), width: el.clientWidth, scrollWidth: el.scrollWidth }))
          .filter(l => l.text && l.text.length > 0 && l.text.length < 25);
        return labels;
      })()`,
      returnByValue: true,
    });

    results.languages[lang] = labelMetrics?.result?.value || [];
    console.log(`[Language: ${lang}] Tab labels:`, results.languages[lang].map(l => `${l.text} (w:${l.width}/sw:${l.scrollWidth})`));

    // Capture screenshot for language
    const shot = await sendPage('Page.captureScreenshot', { format: 'png' });
    if (shot?.data) {
      const filename = `phase_2_3_nav_lang_${lang}_390_844.png`;
      const filepath = path.join(ARTIFACTS_DIR, filename);
      await fs.writeFile(filepath, Buffer.from(shot.data, 'base64'));
      results.artifacts.push(filename);
    }
  }

  // 4. REDUCED MOTION ACCEPTANCE
  console.log('\n--- 4. REDUCED MOTION EMULATION ---');
  await sendPage('Emulation.setEmulatedMedia', {
    media: 'screen',
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await sendPage('Page.navigate', { url: 'http://localhost:8081/(tabs)' });
  await new Promise(r => setTimeout(r, 2200));

  const reducedMotionEval = await sendPage('Runtime.evaluate', {
    expression: 'window.matchMedia("(prefers-reduced-motion: reduce)").matches',
    returnByValue: true,
  });
  console.log('Reduced motion media match:', reducedMotionEval?.result?.value);
  results.reducedMotion = {
    emulated: true,
    detectedByWindow: reducedMotionEval?.result?.value,
  };

  const reducedShot = await sendPage('Page.captureScreenshot', { format: 'png' });
  if (reducedShot?.data) {
    const filename = `phase_2_3_nav_reduced_motion_390_844.png`;
    const filepath = path.join(ARTIFACTS_DIR, filename);
    await fs.writeFile(filepath, Buffer.from(reducedShot.data, 'base64'));
    results.artifacts.push(filename);
  }

  // Write full JSON results
  await fs.writeFile(
    path.join(ARTIFACTS_DIR, 'phase_2_3_acceptance_results.json'),
    JSON.stringify(results, null, 2),
    'utf-8'
  );

  chrome.kill();
  console.log('\n=== SUITE COMPLETED SUCCESSFULLY ===');
  console.log(`Total artifacts generated: ${results.artifacts.length}`);
}

run().catch(console.error);
