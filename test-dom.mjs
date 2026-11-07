import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9337',
  '--window-size=1280,800',
  '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=C:\\Users\\aidev\\AppData\\Local\\Temp\\chrome-debug-temp5',
  'http://localhost:5173/games/city/play'
]);

await delay(1500);

try {
  const tabsRes = await fetch('http://127.0.0.1:9337/json');
  const tabs = await tabsRes.json();
  const pageTab = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  await new Promise(res => ws.onopen = res);

  let id = 1;
  const send = (method, params = {}) => new Promise(res => {
    const curId = id++;
    const handler = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        res(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await delay(4000);

  const script = `
    (() => {
      const h1 = document.querySelector('h1');
      const canvas = document.querySelector('canvas');
      const topHud = document.querySelector('button[aria-label=\"Back\"]');
      const r = (el) => {
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      };
      return {
        h1: r(h1),
        topHud: r(topHud),
        canvas: r(canvas),
        elementsAtPoint: {
          center: document.elementsFromPoint(640, 400).map(e => e.tagName + '.' + e.className.split(' ').slice(0, 3).join('.')),
          topBar: document.elementsFromPoint(20, 20).map(e => e.tagName + '.' + e.className.split(' ').slice(0, 3).join('.'))
        }
      };
    })()
  `;

  const info = await send('Runtime.evaluate', { expression: script, returnByValue: true });
  console.log('GEOMETRY & HIT-TEST RESULT:\n', JSON.stringify(info.result.value, null, 2));

  ws.close();
} finally {
  chrome.kill();
}
