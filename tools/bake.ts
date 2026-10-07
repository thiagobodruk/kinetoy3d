// Bakes every character preset (content/characters/*.json) into public/models/, so the
// production build loads ready-made models instead of generating them in the browser.
//
//   npm run bake        (also runs as part of npm run build)
//
// Output: public/models/<id>.ktm (compacted, gzip) + manifest.json { id: { file, key } }. The page only uses a
// baked model whose key matches its preset, so a stale file is never shown.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import '../src/characters';
import { characters } from '../src/characters/registry';
import type { CharacterPreset } from '../src/characters/presets';
import { bakeKey } from '../src/model/loader';
import { gzipSync } from 'node:zlib';
import { compactModel, packModel, serializeModel } from '../src/model/serialize';

const SRC = 'content/characters', OUT = 'public/models';
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const manifest: Record<string, { file: string; key: string }> = {};
for (const file of (await readdir(SRC)).filter((f) => f.endsWith('.json')).sort()) {
  const preset: CharacterPreset = JSON.parse(await readFile(join(SRC, file), 'utf8'));
  const t = performance.now();
  const ref = { type: preset.type, options: preset.options ?? {}, id: preset.id };
  const buffer = gzipSync(packModel(compactModel(serializeModel(characters.get(ref.type).build(ref.options)))), { level: 9 });
  const out = `${preset.id}.ktm`;
  await writeFile(join(OUT, out), buffer);
  manifest[preset.id] = { file: out, key: bakeKey(ref) };
  console.log(`${preset.id.padEnd(12)} ${(buffer.byteLength / 1024).toFixed(0).padStart(6)} KB  ${((performance.now() - t) / 1000).toFixed(1)} s`);
}
await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
