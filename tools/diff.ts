// Visual regression check: compares two sets of renders produced by tools/render.ts.
//
//   npm run diff -- <nameA> <nameB> [--out renders] [--views front,side,back,3q]
//
// Writes <nameA>_vs_<nameB>_<view>.png (changed pixels in red) and prints the changed area.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const { values: args, positionals: [a, b] } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: 'renders' },
    views: { type: 'string', default: 'front,side,back,3q' },
  },
});
if (!a || !b) throw new Error('Usage: npm run diff -- <nameA> <nameB>');

const load = async (file: string) => PNG.sync.read(await readFile(file));
let worst = 0;
for (const view of args.views.split(',')) {
  const imgA = await load(join(args.out, `${a}_${view}.png`));
  const imgB = await load(join(args.out, `${b}_${view}.png`));
  const { width, height } = imgA;
  const diff = new PNG({ width, height });
  const changed = pixelmatch(imgA.data, imgB.data, diff.data, width, height, { threshold: 0.1 });
  const pct = (100 * changed) / (width * height);
  worst = Math.max(worst, pct);
  await writeFile(join(args.out, `${a}_vs_${b}_${view}.png`), PNG.sync.write(diff));
  console.log(`${view.padEnd(6)} ${changed} px changed (${pct.toFixed(3)}%)`);
}
process.exitCode = worst > 0.5 ? 1 : 0;
