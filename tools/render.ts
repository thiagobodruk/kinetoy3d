// Headless capture tool: opens the app in Chrome, optionally sets a pose, and saves
// PNG renders of the character from fixed camera angles.
//
//   npm run render -- [--url http://localhost:5178] [--views front,side,back,3q]
//                     [--face smile] [--mode dance] [--gesture wave] [--wait 1.5]
//                     [--actors 3 | --cast squid,kelp]
//   npm run render -- --scene meeting --at 2,5.5,9   (frames of a scene, through its camera)
//                     [--name prefix] [--out renders] [--size 900x1200] [--seed 1]
//
// Without --url it starts its own Vite dev server on a free port. The page runs in manual
// time (?manual) with a fixed seed, so the same arguments always give the same image.
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
    out: { type: 'string', default: 'renders' },
    size: { type: 'string', default: '900x1200' },
    dist: { type: 'string', default: '4.2' },
    seed: { type: 'string', default: '1' },
    actors: { type: 'string', default: '1' },
    cast: { type: 'string' },
    scene: { type: 'string' },
    at: { type: 'string', default: '0' },
  },
});

let server: ViteDevServer | null = null;
let url = args.url;
if (!url) {
  server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'warn' });
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
  const target = new URL(url);
  target.searchParams.set('manual', '');
  target.searchParams.set('seed', args.seed);
  if (args.cast) target.searchParams.set('cast', args.cast);
  if (args.scene) target.searchParams.set('scene', args.scene);
  await page.goto(target.href);
  await Promise.race([page.waitForFunction(() => window.__app, null, { timeout: 180_000 }), failed]);

  await mkdir(args.out, { recursive: true });
  if (args.scene) {
    // scene frames: seek to each time and render through the scene's camera
    for (const t of args.at.split(',').map(Number)) {
      const dataUrl = await page.evaluate((t) => { window.__app.seek(t); return window.__app.captureView(); }, t);
      const file = join(args.out, `${args.name}_t${t}.png`);
      await writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
      console.log(file);
    }
  } else {
    await page.evaluate(async ({ face, mode, gesture, wait, actors, cast }) => {
      const app = window.__app;
      // extra actors (face/mode/gesture apply to the active one, the first)
      if (!cast) await Promise.all(Array.from({ length: actors - 1 }, () => app.addActor()));
      if (mode) app.setMode(mode as Parameters<typeof app.setMode>[0]);
      if (face) app.setFace(face);
      if (gesture) void app.active.gesture(gesture);
      app.advance(wait);
    }, { face: args.face, mode: args.mode, gesture: args.gesture, wait: Number(args.wait), actors: Number(args.actors), cast: args.cast });

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
  }
} finally {
  await browser.close();
  await server?.close();
}
