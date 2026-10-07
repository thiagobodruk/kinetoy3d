// Arm gestures: one-shot poses that override the arms while they play.
import type * as THREE from 'three';
import type { BoneName } from '../rig/rig';
import type { V3 } from './pose';
import { Registry, type UiMeta } from './registry';

/** Arm pose returned by a gesture at time t (seconds since it started). */
export interface ArmPose {
  q?: Partial<Record<BoneName, THREE.Quaternion>>;  // absolute bone rotations
  r?: Partial<Record<BoneName, V3>>;                // absolute bone rotations (Euler)
  fingers?: Partial<Record<BoneName, number>>;      // finger curl (rad)
  thumbs?: Partial<Record<BoneName, number>>;       // thumb rotation (rad)
  add?: Partial<Record<BoneName, V3>>;              // additive rotations (head, torso)
  lift?: number;                                    // shoulder raise
}

export interface GestureDef {
  name: string;
  /** Total length in seconds (including the blend in and out). */
  duration: number;
  pose: (t: number) => ArmPose;
  ui?: UiMeta;
}

export const gestures = new Registry<GestureDef>('gesture');
export const defineGesture = (def: GestureDef) => gestures.define(def);
