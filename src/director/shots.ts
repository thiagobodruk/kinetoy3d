// Camera shots: where the camera goes to frame a set of actors.
import * as THREE from 'three';
import type { Actor } from '../actor/actor';
import type { CameraCue } from './scene';

export interface Pose { position: THREE.Vector3; target: THREE.Vector3 }

const FROM = { front: 0, '3q': 40, side: 90, back: 180 } as const;
// distance (grows with the group's spread), width margin around the group, camera height and look-at height
const SIZES = {
  wide: { dist: 5.6, spread: 1.15, margin: 1.6, height: 1.55, look: 0.95 },
  medium: { dist: 3.3, spread: 0.95, margin: 1.0, height: 1.35, look: 1.1 },
  close: { dist: 2.0, spread: 0.6, margin: 0.7, height: 1.5, look: 1.4 },
};

// an actor's head is about this wide: the camera keeps out of it and doesn't look through it
const CLEARANCE = 0.75;

/** Is the view from `position` to `target` free of the `others` (their heads/bodies)? */
function clear(position: THREE.Vector3, target: THREE.Vector3, others: Actor[]): boolean {
  const seg = new THREE.Line3(new THREE.Vector3(position.x, 0, position.z), new THREE.Vector3(target.x, 0, target.z));
  const p = new THREE.Vector3();
  return others.every((o) => seg.closestPointToPoint(o.position.clone().setY(0), true, p).distanceTo(o.position.clone().setY(0)) > CLEARANCE);
}

/**
 * Camera pose for a cue framing `actors` (resolved from cue.on), avoiding the `others`.
 * `camera` gives the field of view and aspect: on narrow (portrait) screens the camera backs
 * off until the group fits the width.
 */
export function shotPose(cue: CameraCue, actors: Actor[], others: Actor[], camera: THREE.PerspectiveCamera): Pose {
  if (cue.shot === 'overShoulder') {
    const [a, b] = actors;
    const dir = new THREE.Vector3().subVectors(b.position, a.position).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    return {
      position: a.position.clone().addScaledVector(dir, -2.4).addScaledVector(right, 1.1).setY(1.9),
      target: b.position.clone().setY(1.3),
    };
  }
  const center = new THREE.Vector3();
  for (const a of actors) center.add(a.position);
  center.divideScalar(actors.length).setY(0);
  let spread = 0;
  for (const a of actors) for (const b of actors) spread = Math.max(spread, a.position.distanceTo(b.position));
  const from = typeof cue.from === 'number' ? cue.from : FROM[cue.from ?? 'front'];
  // one actor: relative to where they face; a group: relative to the stage
  const base = actors.length === 1 ? actors[0].object.rotation.y : 0;
  const s = SIZES[cue.shot];
  const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
  const dist = Math.max(s.dist + spread * s.spread, (spread + s.margin) / 2 / Math.tan(halfH));
  const target = new THREE.Vector3(center.x, s.look, center.z);
  const at = (deg: number) => {
    const az = base + THREE.MathUtils.degToRad(deg);
    return new THREE.Vector3(center.x + Math.sin(az) * dist, s.height, center.z + Math.cos(az) * dist);
  };
  // the asked direction, or the nearest one with a clear view (someone may be standing there)
  for (const offset of [0, 30, -30, 55, -55, 80, -80]) {
    const position = at(from + offset);
    if (clear(position, target, others)) return { position, target };
  }
  return { position: at(from), target };
}
