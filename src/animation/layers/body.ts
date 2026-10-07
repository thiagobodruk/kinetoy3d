// Body layer: a small state machine that crossfades looping clips through an AnimationMixer.
import * as THREE from 'three';
import type { BoneName } from '../../rig/rig';
import { clips } from '../clips';
import { REST } from '../pose';
import type { Layer, LayerState } from '../layer';

/**
 * Per-frame input that drives the state transitions: moving → walk; otherwise `loop`
 * (a stationary looping clip such as dance or bow) or idle.
 */
export interface MotionContext { moving: boolean; speed: number; loop: string | null }
/** idle, walk, or the name of a stationary loop clip (dance, bow, lookAround…). */
export type BodyStateName = string;
type StateListener = (to: BodyStateName, from: BodyStateName | null) => void;
const WALK_SPEED = 1.1; // speed at which the walk clip plays at 1×

export class BodyLayer implements Layer {
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<BodyStateName, THREE.AnimationAction>();
  current: BodyStateName | null = null;
  // The mixer only writes a bone when the clip value changes, so on a held pose (e.g. the bow's
  // pause) the bone would keep last frame's value — including the additive layers on top of it
  // (face, look…), which then pile up. The clip pose is saved after each mixer update and
  // restored before the next one.
  private saved = false;
  private pose: { bone: THREE.Object3D; q: THREE.Quaternion; p: THREE.Vector3 }[] | null = null;
  ctx: MotionContext = { moving: false, speed: 0, loop: null };
  private listeners: StateListener[] = [];

  constructor(root: THREE.Object3D, readonly fade = 0.28) {
    this.mixer = new THREE.AnimationMixer(root);
    this.set('idle', 0);
  }

  onChange(fn: StateListener): void { this.listeners.push(fn); }

  /** The clip action for a state, built on first use. */
  private action(name: BodyStateName): THREE.AnimationAction {
    let a = this.actions.get(name);
    if (!a) this.actions.set(name, a = this.mixer.clipAction(clips.get(name).build()));
    return a;
  }

  set(name: BodyStateName, fade = this.fade): void {
    if (this.current === name) return;
    const next = this.action(name);
    next.reset().setEffectiveWeight(1).play();
    // sync the phase so the step starts naturally
    if (this.current) this.action(this.current).crossFadeTo(next, fade, true);
    const from = this.current;
    this.current = name;
    this.listeners.forEach((fn) => fn(name, from));
  }

  update(dt: number, s: LayerState): void {
    const ctx = this.ctx;
    this.set(ctx.moving ? 'walk' : ctx.loop ?? 'idle');
    // walk playback speed follows movement speed
    if (this.current === 'walk') this.action('walk').timeScale = THREE.MathUtils.clamp(ctx.speed / WALK_SPEED, 0.5, 2);
    this.pose ??= (Object.keys(REST) as BoneName[]).map((name) => ({ bone: s.bones[name], q: new THREE.Quaternion(), p: new THREE.Vector3() }))
      .filter((b) => b.bone);
    if (this.saved) for (const b of this.pose) { b.bone.quaternion.copy(b.q); b.bone.position.copy(b.p); }
    this.mixer.update(dt);
    for (const b of this.pose) { b.q.copy(b.bone.quaternion); b.p.copy(b.bone.position); }
    this.saved = true;
    s.body = this.current;
  }
}
