// Moves a character around the stage and tells the animation layer what it's doing.
//   idle · walkInPlace · circle (walks a fixed circle) · dance · free (WASD, camera-relative)
import * as THREE from 'three';
import type { MotionContext } from '../animation/animator';
import type { UiMeta } from '../animation/registry';
import type { CameraRig } from '../core/camera';
import type { Keyboard } from '../core/keyboard';

export type Mode = 'idle' | 'walkInPlace' | 'circle' | 'dance' | 'free';

/** Modes offered in the HUD ('free' starts by itself when a movement key is pressed). */
export const MODES: { name: Exclude<Mode, 'free'>; ui: UiMeta }[] = [
  { name: 'idle', ui: { label: 'Idle', icon: 'person-simple' } },
  { name: 'walkInPlace', ui: { label: 'Walk', icon: 'person-simple-walk' } },
  { name: 'circle', ui: { label: 'Walk in circle', icon: 'arrows-clockwise' } },
  { name: 'dance', ui: { label: 'Dance', icon: 'music-notes', key: 'KeyG' } },
];

const SPEED = 1.1;
const CIRCLE_RADIUS = 1.6;
const UP = new THREE.Vector3(0, 1, 0);

export class Locomotion {
  mode: Mode = 'idle';
  private circleAngle = 0;
  private listeners: ((mode: Mode) => void)[] = [];
  private v = { move: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3(), dir: new THREE.Vector3() };

  constructor(private body: THREE.Object3D, private camera: CameraRig, private keys: Keyboard) {}

  setMode(mode: Mode): void {
    this.mode = mode;
    this.listeners.forEach((fn) => fn(mode));
  }
  onModeChange(fn: (mode: Mode) => void): void { this.listeners.push(fn); }

  /** Back to the origin, facing forward, standing still. */
  reset(): void {
    this.setMode('idle');
    this.circleAngle = 0;
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
  }

  update(dt: number): MotionContext {
    const { move, fwd, right, dir } = this.v;
    const keys = this.keys;
    move.set(
      keys.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']), 0,
      keys.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']));
    if (move.lengthSq() > 0 && this.mode !== 'free') this.setMode('free');

    const body = this.body;
    let moving = false, speed = 0;
    if (this.mode === 'walkInPlace') { moving = true; speed = SPEED; }
    else if (this.mode === 'circle') {
      moving = true; speed = SPEED;
      const R = CIRCLE_RADIUS;
      this.circleAngle += (SPEED / R) * dt;
      body.position.set(Math.sin(this.circleAngle) * R, 0, Math.cos(this.circleAngle) * R - R);
      body.rotation.y = this.circleAngle + Math.PI / 2;
    } else if (this.mode === 'free' && move.lengthSq() > 0) {
      // camera-relative movement; the camera travels along with the character
      this.camera.forward(fwd);
      right.crossVectors(fwd, UP);
      dir.set(0, 0, 0).addScaledVector(right, move.x).addScaledVector(fwd, -move.z).normalize();
      moving = true; speed = SPEED;
      body.position.addScaledVector(dir, SPEED * dt);
      this.camera.translate(dir.clone().multiplyScalar(SPEED * dt));
      const targetYaw = Math.atan2(dir.x, dir.z);
      let d = targetYaw - body.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      body.rotation.y += d * Math.min(1, dt * 10);
    }
    return { moving, speed, dancing: this.mode === 'dance' };
  }
}
