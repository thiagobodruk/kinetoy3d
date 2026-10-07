// Pose helpers shared by clips and gestures: the rest pose, clip sampling and arm aiming.
import * as THREE from 'three';
import type { BoneName } from '../rig/rig';

export const TAU = Math.PI * 2;
export type V3 = [number, number, number];
/** Per-bone offsets over REST: rotation (Euler XYZ) and, for the hips, position. */
export type BoneOffsets = Partial<Record<BoneName, { r?: number[]; p?: number[] }>>;

// rest pose of each bone driven by the clips
export const REST: Partial<Record<BoneName, { p?: V3; r: V3 }>> = {
  hips: { p: [0, 0.52, 0], r: [0, 0, 0] },
  spine: { r: [0, 0, 0] },
  head: { r: [0, 0, 0] },
  // relaxed arms: slightly back at the shoulder with a bent elbow (soft curve, not robotic)
  shoulderL: { r: [0.1, 0, 0.36] }, // includes the bind spread (ARM_SPREAD)
  shoulderR: { r: [0.1, 0, -0.36] },
  elbowL: { r: [-0.38, 0.15, -0.1] },
  elbowR: { r: [-0.38, -0.15, 0.1] },
  legL: { r: [0, 0, 0] },
  legR: { r: [0, 0, 0] },
  kneeL: { r: [0, 0, 0] },
  kneeR: { r: [0, 0, 0] },
  footL: { r: [0, 0, 0] },
  footR: { r: [0, 0, 0] },
};

// Samples fn(t) -> { bone: { r:[dx,dy,dz], p:[dx,dy,dz] } } as offsets over REST.
export function sampleClip(name: string, duration: number, fps: number, fn: (u: number) => BoneOffsets) {
  const frames = Math.round(duration * fps);
  const times: number[] = [];
  const data: Record<string, { q: number[]; p: number[] }> = {};
  for (const bone of Object.keys(REST)) data[bone] = { q: [], p: [] };
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  for (let i = 0; i <= frames; i++) {
    const t = (i / frames) * duration;
    times.push(t);
    const off = fn(t / duration) || {};
    for (const [bone, rest] of Object.entries(REST)) {
      const o = off[bone as BoneName] || {};
      const r = o.r || [0, 0, 0];
      e.set(rest.r[0] + r[0], rest.r[1] + r[1], rest.r[2] + r[2], 'XYZ');
      q.setFromEuler(e);
      data[bone].q.push(q.x, q.y, q.z, q.w);
      if (rest.p) {
        const p = o.p || [0, 0, 0];
        data[bone].p.push(rest.p[0] + p[0], rest.p[1] + p[1], rest.p[2] + p[2]);
      }
    }
  }
  const tracks: THREE.KeyframeTrack[] = [];
  for (const [bone, d] of Object.entries(data)) {
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, d.q));
    if (d.p.length) tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, times, d.p));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

// Arm poses built from directions in torso space (x = character's left,
// y = up, z = forward): upper arm direction, forearm direction and where the palm faces.
// The arm twist lives in the shoulder (the sleeve is round, so rotating doesn't deform it) and
// the elbow only bends — the elbow skin never twists.
const _v = () => new THREE.Vector3();
const _m = new THREE.Matrix4();
export function armQuats(sx: number, dU: number[], dF: number[], palm: number[]) {
  const yF = _v().fromArray(dF).normalize().negate();
  // the palm faces the bone's "inside" (−sx on the local x axis): x axis = −sx · palm
  const xF = _v().fromArray(palm).multiplyScalar(-sx);
  xF.addScaledVector(yF, -xF.dot(yF)).normalize();
  const zF = _v().crossVectors(xF, yF);
  const yU = _v().fromArray(dU).normalize().negate();
  const xU = xF.clone().addScaledVector(yU, -xF.dot(yU)).normalize();
  const zU = _v().crossVectors(xU, yU);
  const qS = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(xU, yU, zU));
  const qF = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(xF, yF, zF));
  return { s: qS, e: qS.clone().invert().multiply(qF) };
}
/** Normalized direction. */
export const dir = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };

