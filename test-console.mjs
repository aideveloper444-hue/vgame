import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9335',
  '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=C:\\Users\\aidev\\AppData\\Local\\Temp\\chrome-debug-temp3',
  'http://localhost:5173/games/city/play'
]);

await delay(1500);

try {
  const tabsRes = await fetch('http://127.0.0.1:9335/json');
  const tabs = await tabsRes.json();
  const pageTab = tabs.find(t => t.type === 'page' && t.url.includes('5173')) || tabs[0];
  if (!pageTab || !pageTab.webSocketDebuggerUrl) {
    chrome.kill();
    process.exit(1);
  }

  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let id = 1;
  const send = (method, params = {}) => {
    ws.send(JSON.stringify({ id: id++, method, params }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.consoleAPICalled') {
      const args = data.params.args.map(a => a.value ?? a.description ?? JSON.stringify(a)).join(' ');
      console.log(`[BROWSER ${data.params.type.toUpperCase()}]:`, args);
    } else if (data.method === 'Runtime.exceptionThrown') {
      console.error('[BROWSER EXCEPTION]:', JSON.stringify(data.params.exceptionDetails, null, 2));
    }
  };

  send('Runtime.enable');
  send('Page.enable');
  send('Console.enable');

  // Wait 10 seconds
  console.log('Waiting 10s for lazy chunk and renders...');
  await delay(10000);

  const evalMsg = {
    id: id++,
    method: 'Runtime.evaluate',
    params: { expression: 'document.querySelector("main")?.innerHTML' }
  };
  ws.send(JSON.stringify(evalMsg));

  await new Promise(res => {
    const handler = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === evalMsg.id) {
        console.log('[MAIN INNER HTML AT 10s]:\n', data.result?.result?.value);
        ws.removeEventListener('message', handler);
        res();
      }
    };
    ws.addEventListener('message', handler);
  });

  // Take a screenshot of what headless chrome rendered
  const shotMsg = { id: id++, method: 'Page.captureScreenshot' };
  ws.send(JSON.stringify(shotMsg));
  await new Promise(res => {
    const handler = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === shotMsg.id) {
        import('node:fs').then(fs => {
          fs.writeFileSync('d:/vgame/test-rendered.png', Buffer.from(data.result.data, 'base64'));
          console.log('Saved d:/vgame/test-rendered.png');
          ws.removeEventListener('message', handler);
          res();
        });
      }
    };
    ws.addEventListener('message', handler);
  });

  ws.close();
} catch (err) {
  console.error('Script error:', err);
} finally {
  chrome.kill();
}
