// Body clips: looping AnimationClips that the locomotion layer crossfades between.
import type * as THREE from 'three';
import { Registry } from './registry';

export interface ClipDef {
  name: string;
  /** Builds the clip (called once per character). See sampleClip() in pose.ts. */
  build: () => THREE.AnimationClip;
}

export const clips = new Registry<ClipDef>('clip');
export const defineClip = (def: ClipDef) => clips.define(def);
