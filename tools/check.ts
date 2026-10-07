// Checks the content files before they run: JSON Schema (structure, types, enums) plus the
// links between files and registries (presets, actors, gestures, expressions, markers…).
//
//   npm run check        (also runs as part of npm run build)
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ajv } from 'ajv';
import '../src/library';
import '../src/characters';
import { expressions } from '../src/animation/expressions';
import { gestures } from '../src/animation/gestures';
import { characters } from '../src/characters/registry';
import type { CharacterPresetFile } from '../src/characters/presets';
import type { Scene, Step, Target } from '../src/director/scene';
import { generate, SCHEMAS } from './schema';

const problems: string[] = [];
const report = (file: string, msg: string) => problems.push(`${file}: ${msg}`);

// ---------- schemas are up to date ----------
for (const s of SCHEMAS) {
  const onDisk = await readFile(s.out, 'utf8').catch(() => '');
  if (onDisk !== generate(s.type, s.path)) report(s.out, 'out of date with the TypeScript types — run npm run schema');
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validator = async (schemaFile: string) => ajv.compile(JSON.parse(await readFile(schemaFile, 'utf8')));
type Err = { instancePath: string; message?: string; params?: Record<string, unknown> };
const describe = (err: Err) => `${err.instancePath || '/'} ${err.message}${err.params && 'allowedValues' in err.params ? ` (${(err.params.allowedValues as string[]).join(', ')})` : ''}`;

// scene steps: report against the step type named by "do" (a plain union check lists every type)
const sceneSchema = JSON.parse(await readFile(SCHEMAS[0].out, 'utf8'));
ajv.addSchema(sceneSchema, 'scene');
const STEP_TYPES: Record<string, string> = {
  walkTo: 'WalkToStep', turnTo: 'TurnToStep', lookAt: 'LookAtStep', gesture: 'GestureStep',
  face: 'FaceStep', act: 'ActStep', wait: 'WaitStep', mark: 'MarkStep',
};
function stepErrors(data: unknown, path: string): string[] {
  const step = data as { do?: unknown };
  if (typeof step?.do !== 'string' || !STEP_TYPES[step.do]) return [`${path}/do unknown step ${JSON.stringify(step?.do)} (known: ${Object.keys(STEP_TYPES).join(', ')})`];
  const validate = ajv.getSchema(`scene#/definitions/${STEP_TYPES[step.do]}`)!;
  return validate(data) ? [] : (validate.errors ?? []).map((e) => describe({ ...e, instancePath: path + e.instancePath }));
}
const load = async <T>(dir: string, validate: Awaited<ReturnType<typeof validator>>) => {
  const out: { file: string; data: T }[] = [];
  for (const name of (await readdir(dir)).filter((f) => f.endsWith('.json') && !f.endsWith('.schema.json')).sort()) {
    const file = join(dir, name);
    let data: T;
    try { data = JSON.parse(await readFile(file, 'utf8')); } catch (e) { report(file, `invalid JSON (${(e as Error).message})`); continue; }
    if (!validate(data)) {
      const stepPath = /^\/tracks\/[^/]+\/\d+/;
      const steps = new Set<string>();
      for (const err of validate.errors ?? []) {
        const m = err.instancePath.match(stepPath);
        if (m) steps.add(m[0]); else report(file, describe(err));
      }
      for (const path of steps) {
        const [, , track, i] = path.split('/');
        for (const msg of stepErrors((data as unknown as Scene).tracks[track][Number(i)], path)) report(file, msg);
      }
      continue;
    }
    out.push({ file, data });
  }
  return out;
};

// ---------- characters ----------
const presets = await load<CharacterPresetFile>('content/characters', await validator(SCHEMAS[1].out));
const presetIds = new Set<string>();
for (const { file, data } of presets) {
  if (presetIds.has(data.id)) report(file, `duplicate preset id "${data.id}"`);
  presetIds.add(data.id);
  try { characters.get(data.type).validate?.(data.options ?? {}); } catch (e) { report(file, (e as Error).message); }
}

// ---------- scenes ----------
const scenes = await load<Scene>('content/scenes', await validator(SCHEMAS[0].out));
const sceneIds = new Set<string>();
for (const { file, data: scene } of scenes) {
  const at = (path: string, msg: string) => report(file, `${path}: ${msg}`);
  if (sceneIds.has(scene.id)) at('id', `duplicate scene id "${scene.id}"`);
  sceneIds.add(scene.id);

  const actors = new Set<string>();
  scene.cast.forEach((c, i) => {
    if (actors.has(c.actor)) at(`cast[${i}]`, `duplicate actor "${c.actor}"`);
    actors.add(c.actor);
    if (!presetIds.has(c.preset)) at(`cast[${i}].preset`, `no preset "${c.preset}" (known: ${[...presetIds].join(', ')})`);
  });
  scene.cast.forEach((c, i) => { if (typeof c.facing === 'string' && !actors.has(c.facing)) at(`cast[${i}].facing`, `no actor "${c.facing}"`); });
  const actor = (path: string, id: string) => { if (!actors.has(id)) at(path, `no actor "${id}" in the cast (${[...actors].join(', ')})`); };
  const target = (path: string, t: Target | number | null) => { if (typeof t === 'string') actor(path, t); };

  // markers reached: explicit mark steps, step.mark, and "<actor>:end"
  const marks = new Set<string>([...actors].map((a) => `${a}:end`));
  for (const steps of Object.values(scene.tracks)) for (const s of steps) {
    if (s.mark) marks.add(s.mark);
    if (s.do === 'mark') marks.add(s.name);
  }
  const marker = (path: string, name: string) => { if (!marks.has(name)) at(path, `marker "${name}" is never reached (known: ${[...marks].join(', ')})`); };

  for (const [id, steps] of Object.entries(scene.tracks)) {
    actor(`tracks.${id}`, id);
    steps.forEach((s: Step, i) => {
      const path = `tracks.${id}[${i}]`;
      if (s.do === 'walkTo') target(`${path}.to`, s.to);
      if (s.do === 'turnTo') target(`${path}.to`, s.to);
      if (s.do === 'lookAt') target(`${path}.at`, s.at);
      if (s.do === 'gesture' && !gestures.has(s.name)) at(`${path}.name`, `no gesture "${s.name}" (known: ${gestures.list().map((g) => g.name).join(', ')})`);
      if (s.do === 'face' && !expressions.has(s.name)) at(`${path}.name`, `no expression "${s.name}" (known: ${expressions.list().map((e) => e.name).join(', ')})`);
      if (s.do === 'wait' && s.until !== undefined) marker(`${path}.until`, s.until);
      if ((s.do === 'walkTo' || s.do === 'turnTo') && s.to === id) at(`${path}.to`, `"${id}" can't target itself`);
    });
  }
  (scene.camera ?? []).forEach((c, i) => {
    const path = `camera[${i}]`;
    if ((c.t === undefined) === (c.after === undefined)) at(path, 'needs either "t" or "after"');
    if (c.after !== undefined) marker(`${path}.after`, c.after);
    const on = c.on === undefined ? [] : Array.isArray(c.on) ? c.on : [c.on];
    on.forEach((a) => actor(`${path}.on`, a));
    if (c.shot === 'overShoulder' && on.length !== 2) at(`${path}.on`, 'overShoulder needs two actors: [from, toward]');
  });
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`✓ ${presets.length} character preset(s) and ${scenes.length} scene(s) OK`);
