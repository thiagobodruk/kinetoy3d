// An actor: one character on the stage — its model and rig, an animator and a motion
// controller. State setters act immediately; the async methods resolve when the action
// completes (in stage time, so they also work with manual stepping).
import * as THREE from 'three';
import { Animator } from '../animation/animator';
import type { CharacterInstance } from '../characters/registry';
import type { Rig } from '../rig/rig';
import { Motion, type Mode } from './motion';

export class Actor {
  readonly object: THREE.Object3D;
  readonly rig: Rig;
  readonly animator: Animator;
  readonly motion: Motion;
  /** Preset id it was created from, if any. */
  preset?: string;
  private timers: { left: number; done: () => void }[] = [];

  constructor(readonly name: string, readonly type: string, instance: CharacterInstance, home = new THREE.Vector3()) {
    this.object = instance.object;
    this.object.name = name;
    this.object.position.copy(home);
    this.rig = instance.rig;
    this.animator = new Animator(this.object, this.rig);
    this.motion = new Motion(this.object, home.clone());
  }

  get position(): THREE.Vector3 { return this.object.position; }

  // ---------- immediate state ----------
  get mode(): Mode { return this.motion.mode; }
  setMode(mode: Mode): void { this.motion.setMode(mode); }
  get expression(): string { return this.animator.expression; }
  setExpression(name: string): void { this.animator.setExpression(name); }
  /** Gesture playing, or null. */
  get gestureName(): string | null { return this.animator.activeGesture; }
  stopGesture(immediate = false): void { this.animator.stopGesture(immediate); }

  /** Home position, idle, neutral face, no gesture. */
  reset(): void {
    this.motion.reset();
    this.setExpression('neutral');
    this.stopGesture(true);
    if (this.animator.bodyState !== 'idle') this.animator.setBodyState('idle', 0.15);
  }

  // ---------- actions (resolve when done) ----------
  /** Plays an arm gesture. */
  gesture(name: string): Promise<void> { return this.animator.playGesture(name); }
  /** Walks to (x, z) on the ground. */
  walkTo(x: number, z: number): Promise<void> { return this.motion.walkTo(x, z); }
  /** Waits `seconds` of stage time. */
  wait(seconds: number): Promise<void> {
    return new Promise((done) => this.timers.push({ left: seconds, done }));
  }
  /** Sets an expression; with `seconds`, holds it and returns to neutral. */
  async face(name: string, seconds?: number): Promise<void> {
    this.setExpression(name);
    if (seconds === undefined) return;
    await this.wait(seconds);
    if (this.expression === name) this.setExpression('neutral');
  }
  /** Switches to a mode; with `seconds`, keeps it and returns to idle. */
  async act(mode: Mode, seconds?: number): Promise<void> {
    this.setMode(mode);
    if (seconds === undefined) return;
    await this.wait(seconds);
    if (this.mode === mode) this.setMode('idle');
  }

  update(dt: number): void {
    this.animator.update(dt, this.motion.update(dt));
    if (this.timers.length) {
      for (const t of this.timers) t.left -= dt;
      const due = this.timers.filter((t) => t.left <= 0);
      this.timers = this.timers.filter((t) => t.left > 0);
      due.forEach((t) => t.done());
    }
  }
}
