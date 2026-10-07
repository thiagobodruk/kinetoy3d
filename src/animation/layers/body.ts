// Body layer: a small state machine that crossfades looping clips through an AnimationMixer.
import * as THREE from 'three';
import type { CharacterModel } from '../../character';
import { clips } from '../clips';
import type { Layer, LayerState } from '../layer';

/** Per-frame input that drives the state transitions. */
export interface MotionContext { moving: boolean; speed: number; dancing: boolean }
export type BodyStateName = 'idle' | 'walk' | 'dance';
type StateListener = (to: BodyStateName, from: BodyStateName | null) => void;

// allowed transitions and their conditions
const TRANSITIONS: { from: BodyStateName; to: BodyStateName; when: (ctx: MotionContext) => boolean }[] = [
  { from: 'idle', to: 'walk', when: (ctx) => ctx.moving },
  { from: 'idle', to: 'dance', when: (ctx) => ctx.dancing },
  { from: 'walk', to: 'idle', when: (ctx) => !ctx.moving },
  { from: 'dance', to: 'walk', when: (ctx) => ctx.moving },
  { from: 'dance', to: 'idle', when: (ctx) => !ctx.dancing },
];
const WALK_SPEED = 1.1; // speed at which the walk clip plays at 1×

export class BodyLayer implements Layer {
  readonly mixer: THREE.AnimationMixer;
  readonly actions: Record<BodyStateName, THREE.AnimationAction>;
  current: BodyStateName | null = null;
  ctx: MotionContext = { moving: false, speed: 0, dancing: false };
  private listeners: StateListener[] = [];

  constructor(model: CharacterModel, readonly fade = 0.28) {
    this.mixer = new THREE.AnimationMixer(model);
    const action = (name: BodyStateName) => this.mixer.clipAction(clips.get(name).build());
    this.actions = { idle: action('idle'), walk: action('walk'), dance: action('dance') };
    this.set('idle', 0);
  }

  onChange(fn: StateListener): void { this.listeners.push(fn); }

  set(name: BodyStateName, fade = this.fade): void {
    if (this.current === name) return;
    const next = this.actions[name];
    next.reset().setEffectiveWeight(1).play();
    // sync the phase so the step starts naturally
    if (this.current) this.actions[this.current].crossFadeTo(next, fade, true);
    const from = this.current;
    this.current = name;
    this.listeners.forEach((fn) => fn(name, from));
  }

  update(dt: number, s: LayerState): void {
    const ctx = this.ctx;
    for (const tr of TRANSITIONS) {
      if (tr.from === this.current && tr.when(ctx)) { this.set(tr.to); break; }
    }
    // walk playback speed follows movement speed
    if (this.current === 'walk') this.actions.walk.timeScale = THREE.MathUtils.clamp(ctx.speed / WALK_SPEED, 0.5, 2);
    this.mixer.update(dt);
    s.body = this.current;
  }
}
