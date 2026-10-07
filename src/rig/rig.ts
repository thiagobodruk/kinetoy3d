// The rig contract between a character model and the animation engine.
// Every character exposes its skeleton under the canonical humanoid bone names below and
// declares which optional parts it has (capabilities); layers skip what isn't there.
import type * as THREE from 'three';

/** Canonical humanoid bones (L/R = the character's left/right). */
export const HUMANOID_BONES = [
  'hips', 'spine', 'head',
  'shoulderL', 'elbowL', 'fingersL', 'fingerTipsL', 'thumbL',
  'shoulderR', 'elbowR', 'fingersR', 'fingerTipsR', 'thumbR',
  'legL', 'kneeL', 'footL',
  'legR', 'kneeR', 'footR',
] as const;
export type BoneName = (typeof HUMANOID_BONES)[number];
export type Bones = Record<BoneName, THREE.Bone>;

export interface FaceRig {
  /** Eye pivots; blinking scales them on Y. */
  eyes: THREE.Object3D[];
  /** Mouth layers sharing the morph targets 0 smile · 1 open · 2 sad · 3 "O". */
  mouth: THREE.Mesh[];
  /** Eyebrows (pivot at the inner end; `userData.side` = +1 left, −1 right). */
  brows: THREE.Mesh[];
}

export interface Rig {
  bones: Bones;
  face: FaceRig;
  /** Finger and thumb bones can curl (fists, thumbs up). */
  fingers: boolean;
}

/** What a rig supports, derived from its parts. */
export function capabilities(rig: Rig) {
  return { blink: rig.face.eyes.length > 0, mouth: rig.face.mouth.length > 0, brows: rig.face.brows.length > 0, fingers: rig.fingers };
}
