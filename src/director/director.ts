// Director: plays a scene. Each actor runs its track (one step after the other) and the camera
// follows its cues. Steps run synchronously inside the frame loop (no promises), so a scene
// replays identically when time is stepped in fixed increments: that's how seeking works
// (start over and fast-forward), and how renders of a scene at a given time are made.
import * as THREE from 'three';
import type { Actor } from '../actor/actor';
import type { Cast } from '../actor/cast';
import type { CameraRig } from '../core/camera';
import { setSeed } from '../core/random';
import { getPreset } from '../characters/presets';
import type { CameraCue, Scene, Step, Target } from './scene';
import { shotPose, type Pose } from './shots';

const STEP = 1 / 60;          // fixed time step for seeking
const MAX_LENGTH = 300;       // seconds; a scene that never ends is cut here
const MEET_DISTANCE = 1.4;    // walking to an actor stops this far from them
const SEED = 1;

interface Running { step: Step; done: () => boolean; end?: () => void }
interface Track { actor: Actor; id: string; steps: Step[]; i: number; current: Running | null; background: Running[]; ended: boolean }

export class Director {
  scene: Scene | null = null;
  time = 0;
  playing = false;
  /** Length in seconds (measured by a dry run when the scene loads). */
  duration = 0;
  /** The user moved the camera: cues stop driving it until the scene restarts. */
  cameraFree = false;
  private actors = new Map<string, Actor>();
  private tracks: Track[] = [];
  private marks = new Set<string>();
  private cues: CameraCue[] = [];
  private cueIndex = 0;
  // current shot: where it started, and its end pose (fixed unless the cue follows the actors)
  private shot: { cue: CameraCue; from: Pose; to: Pose; start: number } | null = null;
  private listeners: (() => void)[] = [];

  constructor(private cast: Cast, private camera: CameraRig, private stepWorld: (dt: number) => void) {}

  onChange(fn: () => void): void { this.listeners.push(fn); }
  private emit(): void { this.listeners.forEach((fn) => fn()); }

  get ended(): boolean { return this.tracks.every((t) => t.ended) && this.cueIndex >= this.cues.length; }

  /** Replaces the cast with the scene's actors, measures its length and stops at time 0. */
  async load(scene: Scene): Promise<void> {
    this.playing = false;
    this.scene = null;
    this.cast.clear();
    this.actors.clear();
    const actors = await Promise.all(scene.cast.map((c) => {
      const preset = getPreset(c.preset);
      return this.cast.add({ ...preset, options: preset.options ?? {} });
    }));
    scene.cast.forEach((c, i) => this.actors.set(c.actor, actors[i]));
    this.cast.select(actors[0]);
    this.scene = scene;
    this.cues = [...(scene.camera ?? [])].sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity));
    // dry run: how long does it take for every track and cue to finish?
    this.restart();
    while (!this.ended && this.time < MAX_LENGTH) this.stepWorld(STEP);
    this.duration = this.time;
    this.restart();
    this.emit();
  }

  /** Stops directing (the actors stay where they are). */
  unload(): void {
    this.scene = null;
    this.playing = false;
    this.tracks = [];
    this.emit();
  }

  play(): void { if (this.scene) { if (this.ended) this.restart(); this.playing = true; this.emit(); } }
  pause(): void { this.playing = false; this.emit(); }

  /** Back to time 0: starting positions, fresh animation state and random sequence. */
  restart(): void {
    const scene = this.scene!;
    setSeed(SEED);
    this.time = 0;
    this.marks.clear();
    this.cueIndex = 0;
    this.shot = null;
    this.cameraFree = false;
    for (const c of scene.cast) {
      const actor = this.actors.get(c.actor)!;
      const [x, z] = c.at ?? [actor.motion.home.x, 0];
      actor.place(x, z);
      actor.resetAnimation();
    }
    for (const c of scene.cast) {
      const actor = this.actors.get(c.actor)!;
      if (c.facing !== undefined) actor.object.rotation.y = this.heading(actor, c.facing);
    }
    this.tracks = scene.cast.map((c) => ({
      actor: this.actors.get(c.actor)!, id: c.actor, steps: scene.tracks[c.actor] ?? [], i: 0, current: null, background: [], ended: false,
    }));
    // first frame: default wide shot (cut) unless a cue starts at 0
    if (!this.cues.some((c) => (c.t ?? -1) === 0)) this.cut({ shot: 'wide' });
    this.updateCamera(0);
  }

  /** Jumps to a time: replays from the start in fixed steps (forward jumps continue from now). */
  seek(t: number): void {
    if (!this.scene) return;
    t = THREE.MathUtils.clamp(t, 0, this.duration);
    if (t < this.time) this.restart();
    while (this.time + STEP / 2 < t) this.stepWorld(STEP);
    this.emit();
  }

  /** Called every frame (before the actors update) while the scene plays. */
  update(dt: number): void {
    if (!this.scene) return;
    this.time += dt;
    for (const track of this.tracks) this.runTrack(track);
    this.updateCamera(dt);
    if (this.playing && this.ended && this.time >= this.duration) {
      if (this.scene.loop) this.restart();
      else this.playing = false;
      this.emit();
    }
  }

  // ---------- tracks ----------
  private runTrack(t: Track): void {
    t.background = t.background.filter((r) => { if (!r.done()) return true; this.finish(r); return false; });
    for (let guard = 0; guard < 1000; guard++) {
      if (t.current) {
        if (!t.current.done()) return;
        this.finish(t.current);
        t.current = null;
      }
      if (t.i >= t.steps.length) {
        if (!t.ended && !t.background.length) { t.ended = true; this.marks.add(`${t.id}:end`); }
        return;
      }
      const running = this.start(t.actor, t.steps[t.i++]);
      if (running.step.async) t.background.push(running);
      else t.current = running;
    }
  }

  private finish(r: Running): void {
    r.end?.();
    if (r.step.mark) this.marks.add(r.step.mark);
  }

  private start(actor: Actor, step: Step): Running {
    const now = this.time;
    const after = (seconds: number | undefined) => () => seconds === undefined || this.time >= now + seconds - 1e-9;
    switch (step.do) {
      case 'walkTo': {
        const p = this.walkPoint(actor, step.to);
        void actor.walkTo(p.x, p.z);
        return { step, done: () => actor.mode !== 'walkTo' };
      }
      case 'turnTo': {
        void actor.motion.turnTo(typeof step.to === 'number' ? THREE.MathUtils.degToRad(step.to) : this.heading(actor, step.to));
        return { step, done: () => actor.mode !== 'turnTo' };
      }
      case 'lookAt':
        actor.lookAt(step.at === null ? null : typeof step.at === 'string' ? this.actor(step.at) : new THREE.Vector3(step.at[0], 1.45, step.at[1]));
        return { step, done: () => true };
      case 'gesture': {
        void actor.gesture(step.name);
        const playing = actor.animator.gesture.playing;
        return { step, done: () => actor.animator.gesture.playing !== playing };
      }
      case 'face':
        actor.setExpression(step.name);
        return { step, done: after(step.for), end: () => { if (step.for !== undefined && actor.expression === step.name) actor.setExpression('neutral'); } };
      case 'act':
        actor.setMode(step.mode);
        return { step, done: after(step.for), end: () => { if (step.for !== undefined && actor.mode === step.mode) actor.setMode('idle'); } };
      case 'wait': {
        const timeUp = after(step.for), until = step.until;
        if (step.for === undefined && until === undefined) return { step, done: () => true };
        return { step, done: () => (until !== undefined && this.marks.has(until)) || (step.for !== undefined && timeUp()) };
      }
      case 'mark':
        this.marks.add(step.name);
        return { step, done: () => true };
    }
  }

  private actor(id: string): Actor {
    const a = this.actors.get(id);
    if (!a) throw new Error(`Scene "${this.scene?.id}": no actor "${id}"`);
    return a;
  }

  private point(target: Target): THREE.Vector3 {
    return typeof target === 'string' ? this.actor(target).position.clone() : new THREE.Vector3(target[0], 0, target[1]);
  }

  /** Heading (radians) from an actor toward a target, or a heading given in degrees. */
  private heading(actor: Actor, to: Target | number): number {
    if (typeof to === 'number') return THREE.MathUtils.degToRad(to);
    const p = this.point(to);
    return Math.atan2(p.x - actor.position.x, p.z - actor.position.z);
  }

  private walkPoint(actor: Actor, to: Target): THREE.Vector3 {
    const p = this.point(to);
    if (typeof to !== 'string') return p;
    // stop in front of the other actor, on the side we come from
    const away = actor.position.clone().sub(p).setY(0);
    if (away.lengthSq() < 1e-6) away.set(0, 0, 1);
    return p.addScaledVector(away.normalize(), MEET_DISTANCE);
  }

  // ---------- camera ----------
  private cueActors(cue: CameraCue): Actor[] {
    const ids = cue.on === undefined ? [...this.actors.keys()] : Array.isArray(cue.on) ? cue.on : [cue.on];
    return ids.map((id) => this.actor(id));
  }

  private pose(cue: CameraCue): Pose {
    const framed = this.cueActors(cue);
    return shotPose(cue, framed, [...this.actors.values()].filter((a) => !framed.includes(a)), this.camera.camera);
  }

  private cut(cue: CameraCue): void {
    const pose = this.pose(cue);
    this.shot = { cue: { ...cue, ease: 0 }, from: pose, to: pose, start: this.time };
  }

  private updateCamera(_dt: number): void {
    // start the cues that are due (a cue at time 0 always cuts)
    while (this.cueIndex < this.cues.length) {
      const cue = this.cues[this.cueIndex];
      const due = cue.t !== undefined ? this.time >= cue.t - 1e-9 : cue.after !== undefined && this.marks.has(cue.after);
      if (!due) break;
      this.cueIndex++;
      if (this.time === 0) { this.cut(cue); continue; }
      const cam = this.camera.camera;
      const from = { position: cam.position.clone(), target: this.camera.controls.target.clone() };
      this.shot = { cue, from, to: this.pose(cue), start: this.time };
    }
    if (!this.shot || this.cameraFree) return;
    const { cue, from, start } = this.shot;
    const ease = cue.ease ?? 1.2;
    const k = ease > 0 ? THREE.MathUtils.smootherstep(this.time - start, 0, ease) : 1;
    const to = cue.follow ? this.pose(cue) : this.shot.to;
    this.camera.camera.position.lerpVectors(from.position, to.position, k);
    this.camera.controls.target.lerpVectors(from.target, to.target, k);
  }
}
