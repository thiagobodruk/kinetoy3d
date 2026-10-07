// Loads characters without blocking the page:
//   1. a model baked at build time (production; see tools/bake.ts), else
//   2. built in a Web Worker (a small pool), else
//   3. built on the main thread (no Worker support).
import { characters, createCharacter, type CharacterInstance } from '../characters/registry';
import { deserializeModel, unpackModel } from './serialize';

export interface CharacterRef {
  type: string;
  options?: unknown;
  /** Preset id: lets a baked model be used. */
  id?: string;
}

/** Key of a baked model: changes whenever the preset changes. */
export const bakeKey = (ref: CharacterRef) => JSON.stringify([ref.type, ref.options ?? {}]);

// ---------- baked models (production builds only) ----------
let manifest: Promise<Record<string, { file: string; key: string }>> | null = null;
async function baked(ref: CharacterRef): Promise<ArrayBuffer | null> {
  if (!import.meta.env.PROD || !ref.id) return null;
  manifest ??= fetch('./models/manifest.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const entry = (await manifest)[ref.id];
  if (!entry || entry.key !== bakeKey(ref)) return null;
  const res = await fetch(`./models/${entry.file}`);
  if (!res.ok || !res.body) return null;
  // baked files are gzip-compressed (the server may not compress unknown file types)
  return new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

// ---------- worker pool ----------
type Job = { resolve: (b: ArrayBuffer) => void; reject: (e: Error) => void };
const POOL_SIZE = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));
const workers: { worker: Worker; busy: number }[] = [];
const jobs = new Map<number, Job>();
let nextId = 0;

function pickWorker() {
  if (workers.length < POOL_SIZE) {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const slot = { worker, busy: 0 };
    worker.onmessage = (e: MessageEvent<{ id: number; buffer?: ArrayBuffer; error?: string }>) => {
      slot.busy--;
      const job = jobs.get(e.data.id)!;
      jobs.delete(e.data.id);
      if (e.data.buffer) job.resolve(e.data.buffer);
      else job.reject(new Error(e.data.error));
    };
    workers.push(slot);
  }
  return workers.reduce((a, b) => (b.busy < a.busy ? b : a));
}

function buildInWorker(ref: CharacterRef): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    jobs.set(id, { resolve, reject });
    const slot = pickWorker();
    slot.busy++;
    slot.worker.postMessage({ id, type: ref.type, options: ref.options ?? {} });
  });
}

/** Loads (or builds) a character and assembles it with its materials and rig. */
export async function loadCharacter(ref: CharacterRef): Promise<CharacterInstance> {
  const def = characters.get(ref.type);
  const options = ref.options ?? {};
  if (typeof Worker === 'undefined') return createCharacter(ref.type, options);
  const buffer = (await baked(ref)) ?? (await buildInWorker(ref));
  const mats = def.materials(options);
  const root = deserializeModel(unpackModel(buffer), (name) => mats[name]);
  return { object: root, rig: def.rig(root) };
}
