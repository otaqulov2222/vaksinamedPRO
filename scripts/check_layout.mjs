import { spawn } from 'node:child_process';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9299', '--window-size=390,844', 'about:blank']);
await new Promise(r => setTimeout(r, 2000));
const v = await fetch('http://127.0.0.1:9299/json/version').then(r => r.json());
const ws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });

let bId = 1;
const send = (m, p={}) => new Promise(res => {
  const id = bId++;
  const h = (e) => { const d = JSON.parse(e.data); if (d.id === id) { ws.removeEventListener('message', h); res(d.result); } };
  ws.addEventListener('message', h);
  ws.send(JSON.stringify({ id, method: m, params: p }));
});

const t = await send('Target.createTarget', { url: 'http://77.83.206.192/' });
const pws = new WebSocket('ws://127.0.0.1:9299/devtools/page/' + t.targetId);
await new Promise(r => { pws.onopen = r; });

let pId = 1;
const sendP = (m, p={}) => new Promise(res => {
  const id = pId++;
  const h = (e) => { const d = JSON.parse(e.data); if (d.id === id) { pws.removeEventListener('message', h); res(d.result); } };
  pws.addEventListener('message', h);
  pws.send(JSON.stringify({ id, method: m, params: p }));
});

await sendP('Page.enable');
await sendP('Network.enable');
await sendP('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});

const token = 's1.2781c7c7ffeb295a8338c82853a4bc6a.02c831a047569b55531e71370a9c33d84836b1eb658dbf45c5d649a3519e5c71';
await sendP('Network.setCookie', {
  name: 'vm_customer_token',
  value: token,
  domain: '77.83.206.192',
  path: '/',
});

await new Promise(r => setTimeout(r, 1000));

await sendP('Runtime.evaluate', {
  expression: `
    localStorage.setItem('vaksinamed-customer-token', '${token}');
    localStorage.setItem('vaksinamed_session_ended', 'false');
    localStorage.setItem('vaksinamed-preferred-language', 'uz');
    localStorage.setItem('vm_token', '${token}');
    localStorage.setItem('vm_customer_token', '${token}');
  `,
});

await sendP('Page.navigate', { url: 'http://77.83.206.192/profile' });
await new Promise(r => setTimeout(r, 3500));

const res = await sendP('Runtime.evaluate', {
  expression: `
    (() => {
      const nav = Array.from(document.querySelectorAll('div')).find(d => {
        const s = window.getComputedStyle(d);
        return s.borderTopWidth && d.textContent.includes('Bosh sahifa') && d.textContent.includes('Profil');
      });
      const logout = Array.from(document.querySelectorAll('*')).find(el => el.textContent && el.textContent.trim() === 'Chiqish');
      const scrolls = Array.from(document.querySelectorAll('div')).filter(d => d.scrollHeight > d.clientHeight && d.clientHeight > 300);
      return JSON.stringify({
        url: window.location.href,
        text: document.body.innerText.slice(0, 100),
        windowH: window.innerHeight,
        nav: nav ? { rect: nav.getBoundingClientRect(), pos: window.getComputedStyle(nav).position, h: nav.offsetHeight } : null,
        logout: logout ? logout.getBoundingClientRect() : null,
        scrolls: scrolls.map(s => ({
          clientH: s.clientHeight,
          scrollH: s.scrollHeight,
          rect: s.getBoundingClientRect(),
          overflowY: window.getComputedStyle(s).overflowY
        }))
      });
    })()
  `
});

console.log('RESULT:', res.result.value);
chrome.kill();
process.exit(0);
