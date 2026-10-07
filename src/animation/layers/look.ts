// Look layer: turns the head toward a point (or a moving target), within the neck's range.
import * as THREE from 'three';
import type { Layer, LayerState } from '../layer';

const MAX_YAW = 1.1, MAX_PITCH = 0.35;
// the eyes sit this far above the head bone (which is at the base of the neck)
const EYE_HEIGHT = 0.43;

export class LookLayer implements Layer {
  /** World point to look at (re-read every frame, so it can follow something), or null. */
  target: (() => THREE.Vector3) | null = null;
  private w = 0;
  private yaw = 0;
  private pitch = 0;
  private v = new THREE.Vector3();
  private q = new THREE.Quaternion();

  update(dt: number, s: LayerState): void {
    const head = s.bones.head;
    this.w += ((this.target ? 1 : 0) - this.w) * Math.min(1, dt * 4);
    if (this.target) {
      // direction to the target in the space of the head's parent (the torso)
      head.parent!.getWorldQuaternion(this.q).invert();
      const from = head.localToWorld(new THREE.Vector3(0, EYE_HEIGHT, 0));
      const d = this.v.copy(this.target()).sub(from).applyQuaternion(this.q);
      const yaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -MAX_YAW, MAX_YAW);
      const pitch = THREE.MathUtils.clamp(Math.atan2(-d.y, Math.hypot(d.x, d.z)), -MAX_PITCH, MAX_PITCH);
      const k = Math.min(1, dt * 6);
      this.yaw += (yaw - this.yaw) * k;
      this.pitch += (pitch - this.pitch) * k;
    }
    if (this.w < 0.001) return;
    head.rotateY(this.yaw * this.w);
    head.rotateX(this.pitch * this.w);
  }
}
