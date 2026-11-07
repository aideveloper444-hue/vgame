import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9338',
  '--window-size=1280,800',
  '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=C:\\Users\\aidev\\AppData\\Local\\Temp\\chrome-debug-temp6',
  'http://localhost:5173/games/city/play'
]);

await delay(1500);

try {
  const tabsRes = await fetch('http://127.0.0.1:9338/json');
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

  // Set onboarded = true in localStorage
  await send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('vibo-player', JSON.stringify({
        state: {
          onboarded: true,
          profile: { id: 'you', name: 'Dev', avatarEmoji: '😎', title: 'Tycoon', level: 1, xp: 0, coins: 1500, gems: 50, energy: 20, maxEnergy: 20, premium: false },
          stats: {},
          achievements: [],
          recentGames: [],
          settings: { soundOn: true, musicOn: true, notificationsOn: true }
        },
        version: 0
      }));
      location.reload();
    `
  });

  console.log('Reloaded with onboarded = true. Waiting 6 seconds...');
  await delay(6000);

  // Take screenshot
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('d:/vgame/test-onboarded-city.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved d:/vgame/test-onboarded-city.png (size:', shot.data.length, ')');

  // Inspect DOM
  const dom = await send('Runtime.evaluate', {
    expression: `
      (() => {
        return {
          h1: document.querySelector('h1')?.innerText,
          buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText || b.getAttribute('aria-label')).slice(0, 10),
          canvasExists: !!document.querySelector('canvas'),
          mainChildren: Array.from(document.querySelector('main')?.children || []).map(c => c.className)
        };
      })()
    `,
    returnByValue: true
  });
  console.log('DOM when onboarded:\n', JSON.stringify(dom.result.value, null, 2));

  ws.close();
} finally {
  chrome.kill();
}
