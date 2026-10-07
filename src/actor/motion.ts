// Moves an actor around the stage and reports what it's doing to the body layer.
//   idle · walkInPlace · circle (a fixed circle from home) · dance
//   free (steered every frame, e.g. by the keyboard) · walkTo (walks to a point, then idles)
import * as THREE from 'three';
import type { MotionContext } from '../animation/animator';
import type { UiMeta } from '../animation/registry';

export type Mode = 'idle' | 'walkInPlace' | 'circle' | 'dance' | 'free' | 'walkTo';

/** Modes offered in the HUD. */
export const MODES: { name: Mode; ui: UiMeta }[] = [
  { name: 'idle', ui: { label: 'Idle', icon: 'person-simple' } },
  { name: 'walkInPlace', ui: { label: 'Walk', icon: 'person-simple-walk' } },
  { name: 'circle', ui: { label: 'Walk in circle', icon: 'arrows-clockwise' } },
  { name: 'dance', ui: { label: 'Dance', icon: 'music-notes', key: 'KeyG' } },
];

export const WALK_SPEED = 1.1;
const CIRCLE_RADIUS = 1.6;
const ARRIVE_DISTANCE = 0.01;

export class Motion {
  mode: Mode = 'idle';
  /** Displacement in the last update (lets a camera follow the actor). */
  readonly step = new THREE.Vector3();
  private circleAngle = 0;
  private steerDir: THREE.Vector3 | null = null;
  private target: THREE.Vector3 | null = null;
  private arrived: (() => void) | null = null;
  private listeners: ((mode: Mode) => void)[] = [];
  private tmp = new THREE.Vector3();

  constructor(private body: THREE.Object3D, readonly home: THREE.Vector3) {}

  setMode(mode: Mode): void {
    if (this.mode === 'walkTo' && mode !== 'walkTo') this.finishWalk();
    this.mode = mode;
    this.listeners.forEach((fn) => fn(mode));
  }
  onModeChange(fn: (mode: Mode) => void): void { this.listeners.push(fn); }

  /** Free movement input for this frame: a horizontal unit direction, or null to stand still. */
  steer(dir: THREE.Vector3 | null): void {
    this.steerDir = dir;
    if (dir && this.mode !== 'free') this.setMode('free');
  }

  /** Walks to (x, z) and idles there. Resolves on arrival or when another mode takes over. */
  walkTo(x: number, z: number): Promise<void> {
    this.setMode('idle'); // ends a previous walk
    this.target = new THREE.Vector3(x, 0, z);
    const done = new Promise<void>((resolve) => { this.arrived = resolve; });
    this.setMode('walkTo');
    return done;
  }

  private finishWalk(): void {
    this.target = null;
    const fn = this.arrived;
    this.arrived = null;
    fn?.();
  }

  /** Back home, facing forward, standing still. */
  reset(): void {
    this.setMode('idle');
    this.circleAngle = 0;
    this.body.position.copy(this.home);
    this.body.rotation.set(0, 0, 0);
  }

  private turnToward(dir: THREE.Vector3, dt: number): void {
    const targetYaw = Math.atan2(dir.x, dir.z);
    let d = targetYaw - this.body.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.body.rotation.y += d * Math.min(1, dt * 10);
  }

  update(dt: number): MotionContext {
    const body = this.body;
    this.step.set(0, 0, 0);
    let moving = false, speed = 0;
    if (this.mode === 'walkInPlace') { moving = true; speed = WALK_SPEED; }
    else if (this.mode === 'circle') {
      moving = true; speed = WALK_SPEED;
      const R = CIRCLE_RADIUS, h = this.home;
      this.circleAngle += (WALK_SPEED / R) * dt;
      body.position.set(h.x + Math.sin(this.circleAngle) * R, 0, h.z + Math.cos(this.circleAngle) * R - R);
      body.rotation.y = this.circleAngle + Math.PI / 2;
    } else if (this.mode === 'free' && this.steerDir) {
      const dir = this.steerDir;
      moving = true; speed = WALK_SPEED;
      this.step.copy(dir).multiplyScalar(WALK_SPEED * dt);
      body.position.addScaledVector(dir, WALK_SPEED * dt);
      this.turnToward(dir, dt);
    } else if (this.mode === 'walkTo' && this.target) {
      const to = this.tmp.subVectors(this.target, body.position).setY(0);
      const dist = to.length();
      if (dist <= ARRIVE_DISTANCE) {
        body.position.x = this.target.x; body.position.z = this.target.z;
        this.setMode('idle');
      } else {
        to.divideScalar(dist);
        moving = true; speed = WALK_SPEED;
        this.step.copy(to).multiplyScalar(Math.min(WALK_SPEED * dt, dist));
        body.position.add(this.step);
        this.turnToward(to, dt);
      }
    }
    return { moving, speed, dancing: this.mode === 'dance' };
  }
}
