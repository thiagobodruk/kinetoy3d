const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:9222/json', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const pages = JSON.parse(data);
    const page = pages.find(p => p.type === 'page');
    if (!page) return process.exit(1);
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.on('open', () => {
      let id = 1;
      const send = (method, params) => ws.send(JSON.stringify({ id: id++, method, params }));
      
      // Just take a screenshot using DevTools!
      send('Page.captureScreenshot', { format: 'png' });
      
      ws.on('message', msg => {
        const res = JSON.parse(msg);
        if (res.result && res.result.data) {
          const fs = require('fs');
          fs.writeFileSync('evidence/screenshot_devtools.png', Buffer.from(res.result.data, 'base64'));
          console.log('Saved evidence/screenshot_devtools.png');
          process.exit(0);
        }
      });
    });
  });
});
