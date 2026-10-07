// Character types. A type builds a model in two steps: `build` makes the geometry and the
// hierarchy (pure: it can run in a Web Worker, or in Node to bake models at build time), and
// the page adds the real `materials` and finds the `rig`.
import * as THREE from 'three';
import { Registry, type UiMeta } from '../animation/registry';
import type { Rig } from '../rig/rig';

export interface CharacterInstance {
  /** Root of the model; the actor moves and turns it. Feet at y = 0, facing +Z. */
  object: THREE.Object3D;
  rig: Rig;
}

export interface CharacterDef<Options = any> {
  name: string;
  /** Geometry + hierarchy. Meshes carry placeholder materials whose `name` is a material key. */
  build: (options: Options) => THREE.Object3D;
  /** Real materials by key, for these options. */
  materials: (options: Options) => Record<string, THREE.Material>;
  /** Finds the rig parts in a built or deserialized model. */
  rig: (root: THREE.Object3D) => Rig;
  /** Throws a readable error if the options are invalid (used by npm run check). */
  validate?: (options: Options) => void;
  /** Main color for these options (tints the actor's HUD button). */
  accent?: (options: Options) => string;
  ui?: UiMeta;
}

export const characters = new Registry<CharacterDef>('character');
export const defineCharacter = <O>(def: CharacterDef<O>) => characters.define(def);

/** Swaps the placeholder materials of a built model for the real ones and finds its rig. */
export function assemble(def: CharacterDef, options: unknown, root: THREE.Object3D): CharacterInstance {
  const mats = def.materials(options);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = mats[(o.material as THREE.Material).name];
    if (!m) throw new Error(`Character "${def.name}" has no material "${(o.material as THREE.Material).name}"`);
    o.material = m;
  });
  return { object: root, rig: def.rig(root) };
}

/** Builds a character on the calling thread (blocks while the geometry is generated). */
export function createCharacter(type: string, options: unknown = {}): CharacterInstance {
  const def = characters.get(type);
  return assemble(def, options, def.build(options));
}

/** A color in JSON or code: '#rrggbb' or a hex number. */
export type ColorValue = string | number;
export function parseColor(value: ColorValue): number {
  if (typeof value === 'number') return value;
  if (/^#[0-9a-f]{6}$/i.test(value)) return parseInt(value.slice(1), 16);
  throw new Error(`Invalid color "${value}" (use '#rrggbb')`);
}
