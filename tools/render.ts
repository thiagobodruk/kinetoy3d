// Headless capture tool: opens the app in Chrome, optionally sets a pose, and saves
// PNG renders of the character from fixed camera angles.
//
//   npm run render -- [--url http://localhost:5178] [--views front,side,back,3q]
//                     [--face smile] [--mode dance] [--gesture wave] [--wait 1.5]
//                     [--name prefix] [--out evidence] [--size 900x1200]
//
// Without --url it starts its own Vite dev server on a free port.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import type {} from '../src/main';

const VIEWS: Record<string, number> = { front: 0, '3q': 40, side: 90, back: 180 };

const { values: args } = parseArgs({
  options: {
    url: { type: 'string' },
    views: { type: 'string', default: 'front,side,back,3q' },
    face: { type: 'string' },
    mode: { type: 'string' },
    gesture: { type: 'string' },
    wait: { type: 'string', default: '0.5' },
    name: { type: 'string', default: 'render' },
    out: { type: 'string', default: 'evidence' },
    size: { type: 'string', default: '900x1200' },
    dist: { type: 'string', default: '4.2' },
  },
});

let server: ViteDevServer | null = null;
let url = args.url;
if (!url) {
  server = await createServer({ server: { port: 0 }, logLevel: 'warn' });
  await server.listen();
  url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('Could not start the Vite dev server');
}

const [width, height] = args.size.split('x').map(Number);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
try {
  const page = await browser.newPage({ viewport: { width, height } });
  // fail fast: any uncaught page error or failed module load aborts the render
  const failed = new Promise<never>((_, reject) => {
    page.on('pageerror', (e) => reject(new Error(`[page] ${e.message}`)));
    page.on('response', (r) => {
      if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) reject(new Error(`[http ${r.status()}] ${r.url()}`));
    });
  });
  await page.goto(url);
  await Promise.race([page.waitForFunction(() => window.__app, null, { timeout: 180_000 }), failed]);

  await page.evaluate(({ face, mode, gesture }) => {
    const app = window.__app;
    if (mode) app.setMode(mode as Parameters<typeof app.setMode>[0]);
    if (face) app.setFace(face as Parameters<typeof app.setFace>[0]);
    if (gesture) app.fsm.playArmAction(gesture);
  }, { face: args.face, mode: args.mode, gesture: args.gesture });
  await page.waitForTimeout(Number(args.wait) * 1000);

  await mkdir(args.out, { recursive: true });
  for (const view of args.views.split(',')) {
    const azimuth = VIEWS[view] ?? Number(view);
    if (!Number.isFinite(azimuth)) throw new Error(`Unknown view "${view}"`);
    const dataUrl = await page.evaluate(
      ({ azimuth, dist }) => window.__app.capture(azimuth, { dist }),
      { azimuth, dist: Number(args.dist) });
    const file = join(args.out, `${args.name}_${view}.png`);
    await writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(file);
  }
} finally {
  await browser.close();
  await server?.close();
}
