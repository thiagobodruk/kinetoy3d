// Orbit camera with preset views around a subject and smooth zoom steps.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Offsets from the subject for each preset view. */
export const VIEWS = {
  front: [0, 1.2, 6.2],
  side: [6.2, 1.2, 0],
  back: [0, 1.2, -6.2],
  '3q': [4.2, 1.8, 4.6],
} as const satisfies Record<string, readonly [number, number, number]>;
export type ViewName = keyof typeof VIEWS;

const TARGET_HEIGHT = 1.0;

export class CameraRig {
  readonly controls: OrbitControls;
  private zoomGoal: number | null = null;
  private tmp = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    camera.position.set(...VIEWS.front);
    const controls = new OrbitControls(camera, dom);
    controls.target.set(0, TARGET_HEIGHT, 0);
    controls.enableDamping = true;
    controls.minDistance = 1.2;
    controls.maxDistance = 16;
    this.controls = controls;
    // the mouse wheel takes over from a zoom step in progress
    dom.addEventListener('wheel', () => { this.zoomGoal = null; }, { passive: true });
  }

  /** Called when the user starts dragging the camera. */
  onUserOrbit(fn: () => void): void { this.controls.addEventListener('start', fn); }

  /** Places the camera at a preset view around `subject`. */
  setView(name: ViewName, subject: THREE.Vector3): void {
    const v = VIEWS[name];
    this.camera.position.set(subject.x + v[0], v[1], subject.z + v[2]);
    this.controls.target.set(subject.x, TARGET_HEIGHT, subject.z);
    this.zoomGoal = null;
  }

  /** Eases the camera distance by `factor` (< 1 zooms in). */
  zoom(factor: number): void {
    const dist = (this.zoomGoal ?? this.camera.position.distanceTo(this.controls.target)) * factor;
    this.zoomGoal = THREE.MathUtils.clamp(dist, this.controls.minDistance, this.controls.maxDistance);
  }

  /** Moves camera and target together (keeps the framing while following a subject). */
  translate(delta: THREE.Vector3): void {
    this.camera.position.add(delta);
    this.controls.target.add(delta);
  }

  /** Horizontal forward direction of the camera (for camera-relative movement). */
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.subVectors(this.controls.target, this.camera.position).setY(0).normalize();
  }

  update(dt: number): void {
    if (this.zoomGoal !== null) {
      const offset = this.tmp.subVectors(this.camera.position, this.controls.target);
      const dist = offset.length();
      const next = THREE.MathUtils.lerp(dist, this.zoomGoal, Math.min(1, dt * 10));
      this.camera.position.copy(this.controls.target).addScaledVector(offset.normalize(), next);
      if (Math.abs(next - this.zoomGoal) < 1e-3) this.zoomGoal = null;
    }
    this.controls.update();
  }

  /** Fixed shot used by renders: orbit angle in degrees around `subject`. */
  frame(subject: THREE.Vector3, azimuthDeg: number, { dist = 4.2, height = 1.1, target = TARGET_HEIGHT } = {}): void {
    const a = THREE.MathUtils.degToRad(azimuthDeg);
    this.camera.position.set(subject.x + Math.sin(a) * dist, height, subject.z + Math.cos(a) * dist);
    this.controls.target.set(subject.x, target, subject.z);
    this.zoomGoal = null;
    this.controls.update();
  }
}
