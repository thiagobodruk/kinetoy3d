// Gesture layer: plays one arm gesture at a time over everything else, with a smooth
// blend in and out. Stopping early eases out from the current weight (no jumps).
import * as THREE from 'three';
import type { BoneName } from '../../rig/rig';
import { gestures } from '../gestures';
import type { Layer, LayerState } from '../layer';

const BLEND_IN = 0.35, BLEND_OUT = 0.45;

interface Playing { name: string; t: number; duration: number; w?: number; stop?: { from: number; t: number }; done: () => void }

export class GestureLayer implements Layer {
  playing: Playing | null = null;
  private tmp = new THREE.Object3D();
  private shoulderRestY: [number, number] | null = null;

  /** Starts a gesture (replacing the current one). Resolves when it ends or is stopped. */
  play(name: string): Promise<void> {
    const duration = gestures.get(name).duration;
    this.playing?.done();
    return new Promise((done) => { this.playing = { name, t: 0, duration, done }; });
  }

  private end(): void {
    const P = this.playing;
    this.playing = null;
    P?.done();
  }

  /** Ends the gesture with a smooth exit (or right away, with immediate). */
  stop(immediate = false): void {
    const P = this.playing;
    if (!P) return;
    if (immediate) { this.end(); return; }
    if (!P.stop) P.stop = { from: P.w ?? 0, t: 0 }; // leave from the current weight, no jumps
  }

  /** Name of the gesture playing (null once it starts easing out). */
  get active(): string | null { return (!this.playing?.stop && this.playing?.name) || null; }

  update(dt: number, s: LayerState): void {
    const bones = s.bones;
    // the mixer doesn't animate these: reset them every frame
    if (!this.shoulderRestY) this.shoulderRestY = [bones.shoulderL.position.y, bones.shoulderR.position.y];
    bones.shoulderL.position.y = this.shoulderRestY[0];
    bones.shoulderR.position.y = this.shoulderRestY[1];
    bones.fingersL?.rotation.set(0, 0, 0);
    bones.fingersR?.rotation.set(0, 0, 0);
    bones.fingerTipsL?.rotation.set(0, 0, 0);
    bones.fingerTipsR?.rotation.set(0, 0, 0);
    bones.thumbL?.rotation.set(0, 0, 0);
    bones.thumbR?.rotation.set(0, 0, 0);
    const P = this.playing;
    if (!P) return;
    P.t += dt;
    let w;
    if (P.stop) {
      P.stop.t += dt;
      if (P.stop.t >= BLEND_OUT) { this.end(); return; }
      w = P.stop.from * (1 - THREE.MathUtils.smootherstep(P.stop.t, 0, BLEND_OUT));
    } else {
      if (P.t >= P.duration) { this.end(); return; }
      w = THREE.MathUtils.smootherstep(P.t, 0, BLEND_IN) * (1 - THREE.MathUtils.smootherstep(P.t, P.duration - BLEND_OUT, P.duration));
    }
    P.w = w;
    const pose = gestures.get(P.name).pose(P.t);
    const tmp = this.tmp;
    const bone = (name: string) => bones[name as BoneName];
    for (const [name, q] of Object.entries(pose.q || {})) bone(name)?.quaternion.slerp(q, w);
    for (const [name, c] of Object.entries(pose.fingers || {})) {
      const f = bone(name);
      if (f) f.rotation.z = (name.endsWith('L') ? -1 : 1) * c * w; // bend toward the palm
    }
    for (const [name, c] of Object.entries(pose.thumbs || {})) {
      const b = bone(name);
      if (b) b.rotation.x = c * w;
    }
    for (const [name, r] of Object.entries(pose.r || {})) {
      const b = bone(name);
      if (!b) continue;
      tmp.rotation.set(r[0], r[1], r[2]);
      b.quaternion.slerp(tmp.quaternion, w);
    }
    // additive layers (head, torso, raised shoulders)
    for (const [name, r] of Object.entries(pose.add || {})) {
      const b = bone(name);
      if (!b) continue;
      b.rotateX(r[0] * w); b.rotateY(r[1] * w); b.rotateZ(r[2] * w);
    }
    if (pose.lift) {
      bones.shoulderL.position.y += pose.lift * w;
      bones.shoulderR.position.y += pose.lift * w;
    }
  }
}
