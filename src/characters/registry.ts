// Character types. A type builds a model plus its rig; options select a variation.
import type * as THREE from 'three';
import { Registry, type UiMeta } from '../animation/registry';
import type { Rig } from '../rig/rig';

export interface CharacterInstance {
  /** Root of the model; the actor moves and turns it. Feet at y = 0, facing +Z. */
  object: THREE.Object3D;
  rig: Rig;
}

export interface CharacterDef<Options = any> {
  name: string;
  create: (options?: Options) => CharacterInstance;
  ui?: UiMeta;
}

export const characters = new Registry<CharacterDef>('character');
export const defineCharacter = <O>(def: CharacterDef<O>) => characters.define(def);
