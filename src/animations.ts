// Procedurally generated animation clips (AnimationClip + KeyframeTracks) and a
// state machine that crossfades between them through an AnimationMixer.
import * as THREE from 'three';
import type { BoneName, CharacterModel } from './character';
import { random } from './core/random';

const TAU = Math.PI * 2;

type V3 = [number, number, number];
/** Per-bone offsets over REST: rotation (Euler XYZ) and, for the hips, position. */
type BoneOffsets = Partial<Record<BoneName, { r?: number[]; p?: number[] }>>;

// rest pose of each bone driven by the clips
const REST: Partial<Record<BoneName, { p?: V3; r: V3 }>> = {
  hips: { p: [0, 0.52, 0], r: [0, 0, 0] },
  spine: { r: [0, 0, 0] },
  head: { r: [0, 0, 0] },
  // relaxed arms: slightly back at the shoulder with a bent elbow (soft curve, not robotic)
  shoulderL: { r: [0.1, 0, 0.36] }, // includes the bind spread (ARM_SPREAD)
  shoulderR: { r: [0.1, 0, -0.36] },
  elbowL: { r: [-0.38, 0.15, -0.1] },
  elbowR: { r: [-0.38, -0.15, 0.1] },
  legL: { r: [0, 0, 0] },
  legR: { r: [0, 0, 0] },
  kneeL: { r: [0, 0, 0] },
  kneeR: { r: [0, 0, 0] },
  footL: { r: [0, 0, 0] },
  footR: { r: [0, 0, 0] },
};

// Samples fn(t) -> { bone: { r:[dx,dy,dz], p:[dx,dy,dz] } } as offsets over REST.
function sampleClip(name: string, duration: number, fps: number, fn: (u: number) => BoneOffsets) {
  const frames = Math.round(duration * fps);
  const times: number[] = [];
  const data: Record<string, { q: number[]; p: number[] }> = {};
  for (const bone of Object.keys(REST)) data[bone] = { q: [], p: [] };
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  for (let i = 0; i <= frames; i++) {
    const t = (i / frames) * duration;
    times.push(t);
    const off = fn(t / duration) || {};
    for (const [bone, rest] of Object.entries(REST)) {
      const o = off[bone as BoneName] || {};
      const r = o.r || [0, 0, 0];
      e.set(rest.r[0] + r[0], rest.r[1] + r[1], rest.r[2] + r[2], 'XYZ');
      q.setFromEuler(e);
      data[bone].q.push(q.x, q.y, q.z, q.w);
      if (rest.p) {
        const p = o.p || [0, 0, 0];
        data[bone].p.push(rest.p[0] + p[0], rest.p[1] + p[1], rest.p[2] + p[2]);
      }
    }
  }
  const tracks: THREE.KeyframeTrack[] = [];
  for (const [bone, d] of Object.entries(data)) {
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, d.q));
    if (d.p.length) tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, times, d.p));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

// u ∈ [0,1) — every function uses harmonics of 2π·u so the loop closes perfectly.
export function createIdleClip() {
  return sampleClip('idle', 3.2, 30, (u: number) => {
    const a = TAU * u;
    const breath = Math.sin(a * 2);
    return {
      hips: { p: [0, 0.006 * breath, 0], r: [0, 0, 0.012 * Math.sin(a)] },
      spine: { r: [0.02 * breath, 0.03 * Math.sin(a), -0.012 * Math.sin(a)] },
      head: { r: [0.03 * Math.sin(a * 2 + 0.6), 0.09 * Math.sin(a), 0.05 * Math.sin(a + 1.2)] },
      shoulderL: { r: [0.03 * Math.sin(a + 0.5), 0, 0.03 * breath] },
      shoulderR: { r: [0.04 * Math.sin(a + 0.9), 0, -0.03 * breath] },
      elbowL: { r: [-0.04 * Math.sin(a * 2), 0, 0] },
      elbowR: { r: [-0.06 * Math.sin(a * 2 + 0.4), 0, 0] },
      legL: { r: [0, 0, -0.012 * Math.sin(a)] },
      legR: { r: [0, 0, -0.012 * Math.sin(a)] },
      footL: { r: [0, 0, 0.012 * Math.sin(a)] },
      footR: { r: [0, 0, 0.012 * Math.sin(a)] },
    };
  });
}

export function createWalkClip() {
  // full cycle = two steps
  return sampleClip('walk', 0.9, 60, (u: number) => {
    const a = TAU * u;
    const s = Math.sin(a);
    const c = Math.cos(a);
    const bob = 0.5 - 0.5 * Math.cos(a * 2); // two peaks per cycle
    const liftL = Math.max(0, -s); // left foot in the air while the leg swings back
    const liftR = Math.max(0, s);
    // knee: nearly straight at heel strike, slight flex in stance, strong bend in swing (leg moving forward)
    const kneeL = 0.15 + 1.1 * Math.max(0, c) ** 1.2; // up to ~72° mid-swing
    const kneeR = 0.15 + 1.1 * Math.max(0, -c) ** 1.2;
    return {
      hips: { p: [0.015 * s, 0.035 * bob - 0.01, 0], r: [0.04, 0.12 * s, 0.05 * c] },
      spine: { r: [0.05 + 0.02 * bob, -0.18 * s, -0.04 * c] },
      head: { r: [-0.04 - 0.03 * bob, 0.08 * s, 0.03 * c] },
      legL: { r: [-0.6 * s - 0.3 * Math.max(0, c) ** 1.2, 0, 0] }, // thigh lifts during swing
      legR: { r: [0.6 * s - 0.3 * Math.max(0, -c) ** 1.2, 0, 0] },
      // the foot follows the stride: toe up at heel strike in front, down at push-off behind,
      // with a slight toe turn and side roll
      kneeL: { r: [kneeL, 0, 0] },
      kneeR: { r: [kneeR, 0, 0] },
      // foot (world angle): toe ~25° up at heel strike, ~55° down at push-off,
      // flat in stance and slightly hanging in swing (offsets part of the knee bend)
      footL: { r: [0.15 * s + 0.55 * liftL - 0.73 * kneeL + 0.3 * Math.max(0, c) ** 1.2 - 0.08, 0.1 * s, -0.04 * c] },
      footR: { r: [-0.15 * s + 0.55 * liftR - 0.73 * kneeR + 0.3 * Math.max(0, -c) ** 1.2 - 0.08, 0.1 * s, -0.04 * c] },
      // the arm swings less back than forward (the sleeve doesn't overstretch)
      // and opens slightly sideways going back, keeping the sleeve off the back
      shoulderL: { r: [s > 0 ? 0.25 * s : 0.55 * s, 0, 0.04 + 0.08 * Math.max(0, s)] },
      shoulderR: { r: [s < 0 ? -0.25 * s : -0.55 * s, 0, -0.04 - 0.08 * Math.max(0, -s)] },
      elbowL: { r: [-0.3 - 0.25 * Math.max(0, -s), 0, 0] },
      elbowR: { r: [-0.3 - 0.25 * Math.max(0, s), 0, 0] },
    };
  });
}

// dance: soft 4-beat groove (~100 bpm). Knees keep the beat (body dips and rises),
// hips sway side to side with the torso compensating, bent arms alternate in front.
// Feet stay planted: legs and feet offset the hip shift and tilt.
export function createDanceClip() {
  const LEG = 0.34; // hip → ankle
  return sampleClip('dance', 2.4, 60, (u: number) => {
    const a = TAU * u;
    const b = 0.5 - 0.5 * Math.cos(a * 4);     // 0..1, dips on every beat
    const sw = Math.sin(a * 2);                // side to side every 2 beats
    const tw = Math.sin(a);                    // slow twist (1 cycle)
    // knee bend: thigh forward, shin back, foot flat on the ground
    const th = 0.35 * b;
    const drop = 0.17 * (1 - Math.cos(th)) + 0.17 * (1 - Math.cos(th)); // how far the hips drop
    const hipX = 0.045 * sw, hipTilt = 0.06 * sw;
    const legZ = -hipX / LEG - hipTilt;         // keeps the foot in place
    // step-touch: when the weight shifts onto one leg, the other foot lifts slightly off the
    // ground (thigh forward + knee bend, foot kept almost flat, toe a touch down)
    const liftL = Math.max(0, -sw) ** 3, liftR = Math.max(0, sw) ** 3;
    const leg = (lift: number) => ({ thigh: -th - 0.32 * lift, knee: 2 * th + 0.72 * lift });
    const lL = leg(liftL), lR = leg(liftR);
    return {
      hips: { p: [hipX, -drop, 0], r: [0.03 * b, 0.07 * tw, hipTilt] },
      spine: { r: [0.04 * b, -0.12 * tw, -0.09 * sw] },
      head: { r: [0.07 * b - 0.02, 0.12 * Math.sin(a + 0.6), 0.08 * Math.sin(a * 2 + 0.5)] },
      legL: { r: [lL.thigh, 0, legZ] }, legR: { r: [lR.thigh, 0, legZ] },
      kneeL: { r: [lL.knee, 0, 0] }, kneeR: { r: [lR.knee, 0, 0] },
      footL: { r: [-lL.thigh - lL.knee - 0.03 * b + 0.12 * liftL, -0.07 * tw, -legZ - hipTilt] },
      footR: { r: [-lR.thigh - lR.knee - 0.03 * b + 0.12 * liftR, -0.07 * tw, -legZ - hipTilt] },
      // bent arms, alternating forward/back and opening on the beat,
      // spread enough for the hands to clear the belly
      shoulderL: { r: [-0.15 + 0.22 * sw, 0, 0.46 + 0.12 * (0.5 + 0.5 * Math.sin(a * 2 + 1.2))] },
      shoulderR: { r: [-0.15 - 0.22 * sw, 0, -0.46 - 0.12 * (0.5 - 0.5 * Math.sin(a * 2 + 1.2))] },
      elbowL: { r: [-0.95 + 0.2 * Math.sin(a * 2 + 1), 0.1 * b, 0] },
      elbowR: { r: [-0.95 - 0.2 * Math.sin(a * 2 + 1), -0.1 * b, 0] },
    };
  });
}

// ---------- on-demand arm gestures ----------
// Arm poses built from directions in torso space (x = character's left,
// y = up, z = forward): upper arm direction, forearm direction and where the palm faces.
// The arm twist lives in the shoulder (the sleeve is round, so rotating doesn't deform it) and
// the elbow only bends — the elbow skin never twists.
const _v = () => new THREE.Vector3();
const _m = new THREE.Matrix4();
function armQuats(sx: number, dU: number[], dF: number[], palm: number[]) {
  const yF = _v().fromArray(dF).normalize().negate();
  // the palm faces the bone's "inside" (−sx on the local x axis): x axis = −sx · palm
  const xF = _v().fromArray(palm).multiplyScalar(-sx);
  xF.addScaledVector(yF, -xF.dot(yF)).normalize();
  const zF = _v().crossVectors(xF, yF);
  const yU = _v().fromArray(dU).normalize().negate();
  const xU = xF.clone().addScaledVector(yU, -xF.dot(yU)).normalize();
  const zU = _v().crossVectors(xU, yU);
  const qS = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(xU, yU, zU));
  const qF = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(xF, yF, zF));
  return { s: qS, e: qS.clone().invert().multiply(qF) };
}
const N = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };

/** Arm pose returned by a gesture at time t (seconds since it started). */
interface ArmPose {
  q?: Partial<Record<BoneName, THREE.Quaternion>>;  // absolute bone rotations
  r?: Partial<Record<BoneName, V3>>;                // absolute bone rotations (Euler)
  fingers?: Partial<Record<BoneName, number>>;      // finger curl (rad)
  thumbs?: Partial<Record<BoneName, number>>;       // thumb rotation (rad)
  add?: Partial<Record<BoneName, V3>>;              // additive rotations (head, torso)
  lift?: number;                                    // shoulder raise
}
interface ArmActionDef { dur: number; pose: (t: number) => ArmPose }

const ARM_ACTIONS: Record<string, ArmActionDef> = {
  // thumbs up: closed fingers, fist in front, palm inward → thumb up
  thumbsUp: {
    dur: 2.4,
    pose: (t: number) => {
      const pump = 0.08 * Math.sin(Math.min(1, t / 0.6) * Math.PI); // small "ta-da" on arrival
      // arm well forward and forearm nearly level at chest height: the elbow bends little
      // (no "biceps") and the thumb stays clearly visible above the fist
      const q = armQuats(-1, N(-0.1, -0.78, 0.6), N(0.12, 0.08 + pump, 1), [1, 0, 0]);
      return {
        q: { shoulderR: q.s, elbowR: q.e },
        fingers: { fingersR: 1.45, fingerTipsR: 1.7 }, // fingers curl in an arc down to the palm
        thumbs: { thumbR: -1.0 }, // thumb (rigid piece) rotates until upright
        add: { head: [0.04, -0.08, -0.06] },
      };
    },
  },
  // wave: hand raised in front of the shoulder, palm forward, swaying side to side
  wave: {
    dur: 2.8,
    pose: (t: number) => {
      const wv = Math.sin(t * Math.PI * 2 * 2) * Math.min(1, t / 0.4);
      // the wave rotates the whole arm around its own axis (at the shoulder): the elbow keeps
      // the same bend and the skin doesn't twist; the forearm sweeps side to side
      const dU = N(-0.5, -0.35, 0.55);
      const q = armQuats(-1, dU, N(-0.08, 1, 0.12), [0, 0, 1]);
      const swing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().fromArray(dU), -0.16 + 0.3 * wv); // offset arc: rotating outward folded the sleeve
      return {
        q: { shoulderR: swing.multiply(q.s), elbowR: q.e },
        add: { head: [0, -0.08, -0.06] },
      };
    },
  },
  // raise arm: upper arm forward at shoulder height and forearm up, palm forward
  // (an elbow above the shoulder sank the sleeve into the torso)
  armUp: {
    dur: 2.4,
    pose: (t: number) => {
      const bob = 0.06 * Math.sin(t * Math.PI * 2 * 1.2);
      const q = armQuats(-1, N(-0.8, -0.1 + bob, 0.6), N(-0.12, 1, 0.1), [0, -0.1, 1]); // opened diagonally: the sleeve doesn't sink into the chest
      return {
        q: { shoulderR: q.s, elbowR: q.e },
        add: { spine: [-0.03, 0, 0.04], head: [-0.06, 0, -0.04] },
        lift: 0.012, // the shoulder rises a little too
      };
    },
  },
  // shrug: shoulders up, forearms forward with palms up, head tilted
  shrug: {
    dur: 2.2,
    pose: () => ({
      r: {
        shoulderL: [-0.15, 0, 0.55], shoulderR: [-0.15, 0, -0.55],
        elbowL: [-1.35, 1.0, 0], elbowR: [-1.35, -1.0, 0],
      },
      add: { head: [-0.04, 0, 0.16], spine: [0, 0, -0.03] },
      lift: 0.025,
    }),
  },
};

// ---------- state machine ----------
type StateName = 'idle' | 'walk' | 'dance';
export type Expression = 'neutral' | 'smile' | 'talk' | 'sad' | 'doubt';
/** Per-frame input that drives the state transitions. */
export interface MotionContext { moving: boolean; speed: number; dancing: boolean }
interface State { enter: () => void; update: (dt: number, ctx: MotionContext) => void; exit?: () => void }
interface GestureParams { s: number; e: number; o: number; t: number; w: number }
type StateListener = (to: StateName | null, from: StateName | null) => void;

export class CharacterStateMachine {
  model: CharacterModel;
  fade: number;
  mixer: THREE.AnimationMixer;
  actions: Record<StateName, THREE.AnimationAction>;
  states: Record<StateName, State>;
  transitions: { from: StateName; to: StateName; when: (ctx: MotionContext) => boolean }[];
  listeners: StateListener[];
  current: StateName | null;
  blinkTimer: number;
  blinkT: number;
  expression: Expression;
  face: { open: number; smile: number; sad: number; doubt: number };
  syllableTarget: number;
  syllableTimer: number;
  phraseTimer: number;
  pauseTimer: number;
  eyeSquint: number;
  browRest: THREE.Vector3[];
  browArch: number;
  browTarget: number;
  browTimer: number;
  gesture: { sx: number; cur: GestureParams; tgt: GestureParams; timer: number }[];
  gestureTmp: THREE.Object3D;
  idleW: number;
  swayT: number;
  look: { cur: number; tgt: number; timer: number };
  armAction: { name: string; t: number; dur: number; w?: number; stop?: { from: number; t: number } } | null;
  armTmp: THREE.Object3D;
  shoulderRestY: [number, number] | null;

  constructor(model: CharacterModel, { fade = 0.28 } = {}) {
    this.model = model;
    this.fade = fade;
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {
      idle: this.mixer.clipAction(createIdleClip()),
      walk: this.mixer.clipAction(createWalkClip()),
      dance: this.mixer.clipAction(createDanceClip()),
    };
    this.states = {
      idle: {
        enter: () => {},
        update: () => {},
      },
      dance: {
        enter: () => {},
        update: () => {},
      },
      walk: {
        enter: () => {},
        // playback speed follows movement speed
        update: (_dt, ctx) => { this.actions.walk.timeScale = THREE.MathUtils.clamp(ctx.speed / 1.1, 0.5, 2); },
      },
    };
    // allowed transitions and their conditions
    this.transitions = [
      { from: 'idle', to: 'walk', when: (ctx) => ctx.moving },
      { from: 'idle', to: 'dance', when: (ctx) => ctx.dancing },
      { from: 'walk', to: 'idle', when: (ctx) => !ctx.moving },
      { from: 'dance', to: 'walk', when: (ctx) => ctx.moving },
      { from: 'dance', to: 'idle', when: (ctx) => !ctx.dancing },
    ];
    this.listeners = [];
    this.current = null;
    this.set('idle', 0);

    // blinking: independent layer applied over the eye scales
    this.blinkTimer = 1.5;
    this.blinkT = -1;

    // facial expression: layer independent from the body (works in idle and walk)
    //   neutral → closed mouth · smile → smile · talk → opens and closes the mouth in syllables
    //   sad → drooping mouth and brows · doubt → "O" mouth and arched brows
    this.expression = 'neutral';
    this.face = { open: 0, smile: 0, sad: 0, doubt: 0 };  // current (smoothed) values
    this.syllableTarget = 0;
    this.syllableTimer = 0;
    this.phraseTimer = 1.5;
    this.pauseTimer = 0;
    this.eyeSquint = 0;
    this.browRest = (model.userData.brows || []).map((b) => b.position.clone());
    this.browArch = 0;      // current arch 0..1 (smoothed)
    this.browTarget = 0;
    this.browTimer = 0;     // time left for the current arch

    // talk gestures: each arm chases a target pose that changes on every "beat"
    this.gesture = [1, -1].map((sx) => ({ sx, cur: { s: 0, e: 0, o: 0, t: 0, w: 0 }, tgt: { s: 0, e: 0, o: 0, t: 0, w: 0 }, timer: 0 }));
    this.gestureTmp = new THREE.Object3D();

    // neutral idle: slow side sway and occasional glances to the sides (layer over the mixer)
    this.idleW = 0;          // layer weight (0 outside neutral idle)
    this.swayT = 0;
    this.look = { cur: 0, tgt: 0, timer: 2.5 };

    // on-demand arm gestures (thumbs up, wave, raise arm, shrug): play once
    // and override the arm pose (idle/walk/dance/talk) while they last
    this.armAction = null;   // { name, t, dur }
    this.armTmp = new THREE.Object3D();
    this.shoulderRestY = null;
  }

  playArmAction(name: string) {
    const def = ARM_ACTIONS[name];
    if (def) this.armAction = { name, t: 0, dur: def.dur };
  }

  // ends the current gesture with a smooth exit (or right away, with immediate)
  stopArmAction(immediate = false) {
    const A = this.armAction;
    if (!A) return;
    if (immediate) { this.armAction = null; return; }
    if (!A.stop) A.stop = { from: A.w ?? 0, t: 0 }; // leave from the current weight, no jumps
  }

  updateArmAction(dt: number) {
    const bones = this.model.userData.bones;
    if (!this.shoulderRestY) this.shoulderRestY = [bones.shoulderL.position.y, bones.shoulderR.position.y];
    bones.shoulderL.position.y = this.shoulderRestY[0];
    bones.shoulderR.position.y = this.shoulderRestY[1];
    bones.fingersL?.rotation.set(0, 0, 0);
    bones.fingersR?.rotation.set(0, 0, 0);
    bones.fingerTipsL?.rotation.set(0, 0, 0);
    bones.fingerTipsR?.rotation.set(0, 0, 0);
    bones.thumbL?.rotation.set(0, 0, 0);
    bones.thumbR?.rotation.set(0, 0, 0);
    const A = this.armAction;
    if (!A) return;
    A.t += dt;
    const IN = 0.35, OUT = 0.45;
    let w;
    if (A.stop) {
      A.stop.t += dt;
      if (A.stop.t >= OUT) { this.armAction = null; return; }
      w = A.stop.from * (1 - THREE.MathUtils.smootherstep(A.stop.t, 0, OUT));
    } else {
      if (A.t >= A.dur) { this.armAction = null; return; }
      w = THREE.MathUtils.smootherstep(A.t, 0, IN) * (1 - THREE.MathUtils.smootherstep(A.t, A.dur - OUT, A.dur));
    }
    A.w = w;
    const pose = ARM_ACTIONS[A.name].pose(A.t);
    const tmp = this.armTmp;
    for (const [bone, q] of Object.entries(pose.q || {})) bones[bone as BoneName]?.quaternion.slerp(q, w);
    for (const [bone, c] of Object.entries(pose.fingers || {})) {
      const f = bones[bone as BoneName];
      if (f) f.rotation.z = (bone.endsWith('L') ? -1 : 1) * c * w; // bend toward the palm
    }
    for (const [bone, c] of Object.entries(pose.thumbs || {})) {
      if (bones[bone as BoneName]) bones[bone as BoneName].rotation.x = c * w;
    }
    for (const [bone, r] of Object.entries(pose.r || {})) {
      const b = bones[bone as BoneName];
      if (!b) continue;
      tmp.rotation.set(r[0], r[1], r[2]);
      b.quaternion.slerp(tmp.quaternion, w);
    }
    // additive layers (head, torso, raised shoulders)
    for (const [bone, r] of Object.entries(pose.add || {})) {
      const b = bones[bone as BoneName];
      if (!b) continue;
      b.rotateX(r[0] * w); b.rotateY(r[1] * w); b.rotateZ(r[2] * w);
    }
    if (pose.lift) {
      bones.shoulderL.position.y += pose.lift * w;
      bones.shoulderR.position.y += pose.lift * w;
    }
  }

  setExpression(name: Expression) {
    this.expression = name;
    this.listeners.forEach((fn) => fn(this.current, this.current));
  }

  onChange(fn: StateListener) { this.listeners.push(fn); }

  set(name: StateName, fade = this.fade) {
    if (this.current === name) return;
    const next = this.actions[name];
    next.reset().setEffectiveWeight(1).play();
    if (this.current) {
      const prev = this.actions[this.current];
      // sync the phase so the step starts naturally
      prev.crossFadeTo(next, fade, true);
      this.states[this.current].exit?.();
    }
    const from = this.current;
    this.current = name;
    this.states[name].enter();
    this.listeners.forEach((fn) => fn(name, from));
  }

  update(dt: number, ctx: MotionContext) {
    for (const tr of this.transitions) {
      if (tr.from === this.current && tr.when(ctx)) { this.set(tr.to); break; }
    }
    if (this.current) this.states[this.current].update(dt, ctx);
    this.mixer.update(dt);
    this.updateBlink(dt);
    this.updateFace(dt);
  }

  updateFace(dt: number) {
    const ud = this.model.userData;
    if (!ud.mouthMeshes) return;
    let openTarget = 0, smileTarget = 0;
    if (this.expression === 'talk') {
      if (this.pauseTimer > 0) {
        this.pauseTimer -= dt;
        this.syllableTarget = 0;
      } else {
        this.phraseTimer -= dt;
        this.syllableTimer -= dt;
        if (this.syllableTimer <= 0) {
          // new syllable: 90–190 ms; some nearly closed (consonants)
          this.syllableTimer = 0.09 + random() * 0.1;
          this.syllableTarget = random() < 0.2 ? 0.05 : 0.35 + random() * 0.65;
        }
        if (this.phraseTimer <= 0) {
          // end of phrase: short closed-mouth pause
          this.phraseTimer = 1.2 + random() * 1.8;
          this.pauseTimer = 0.25 + random() * 0.45;
        }
      }
      openTarget = this.syllableTarget;
      smileTarget = 0.25; // friendly talk
    } else if (this.expression === 'smile') {
      smileTarget = 1;
    }
    const sadTarget = this.expression === 'sad' ? 1 : 0;
    const doubtTarget = this.expression === 'doubt' ? 1 : 0;
    const f = this.face;
    const rate = openTarget > f.open ? 28 : 18;
    f.open += (openTarget - f.open) * Math.min(1, dt * rate);
    f.smile += (smileTarget - f.smile) * Math.min(1, dt * 8);
    f.sad += (sadTarget - f.sad) * Math.min(1, dt * 4); // sadness sets in slowly
    f.doubt += (doubtTarget - f.doubt) * Math.min(1, dt * 7);

    // mouth morph targets: 0 = smile, 1 = open (talk), 2 = sad, 3 = "O"
    ud.mouthMeshes.forEach((m) => {
      const o = f.doubt * (1 - f.open); // doubt: "O" mouth (😯)
      if (!m.morphTargetInfluences) return;
      m.morphTargetInfluences[0] = f.smile * (1 - f.open) * (1 - o);
      m.morphTargetInfluences[1] = f.open;
      m.morphTargetInfluences[2] = f.sad * (1 - f.open) * (1 - o);
      m.morphTargetInfluences[3] = o;
    });
    // eyebrows: while talking, they arch softly from time to time (emphasis) and settle back
    if (this.expression === 'talk') {
      this.browTimer -= dt;
      if (this.browTimer <= 0) {
        const up = this.browTarget === 0;
        this.browTarget = up ? 0.6 + random() * 0.4 : 0;
        this.browTimer = up ? 0.35 + random() * 0.35 : 0.6 + random() * 1.2;
      }
    } else {
      this.browTarget = 0;
      this.browTimer = 0.3;
    }
    this.browArch += (this.browTarget - this.browArch) * Math.min(1, dt * 7);
    (ud.brows || []).forEach((b, i) => {
      const sx = b.userData.side;
      b.position.copy(this.browRest[i]);
      const arch = this.browArch + 2.4 * f.doubt; // doubt: strongly arched brows
      b.position.y += 0.012 * f.smile + 0.018 * arch + 0.01 * f.sad;
      b.position.x -= sx * 0.006 * f.sad; // pulls the brows together (furrowed forehead)
      // the inner end rises more than the outer one: an expressive arch between the brows;
      // when sad the outer end drops much more ("roof"-shaped brow)
      b.rotation.z = -sx * (0.09 * arch + 0.38 * f.sad);
    });
    this.eyeSquint = 0.4 * f.smile + 0.18 * f.sad; // applied together with blinking
    // sad: head down and torso slightly hunched
    if (f.sad > 0.001) {
      ud.bones.head?.rotateX(0.16 * f.sad);
      ud.bones.spine?.rotateX(0.06 * f.sad);
    }
    // subtle head nod while talking (over the mixer pose)
    if (this.expression === 'talk' && ud.bones.head) ud.bones.head.rotateX(-f.open * 0.035);
    this.updateGestures(dt);
    this.updateIdleLife(dt);
    this.updateArmAction(dt);
  }

  updateIdleLife(dt: number) {
    const bones = this.model.userData.bones;
    const on = this.current === 'idle' && this.expression === 'neutral';
    this.idleW += ((on ? 1 : 0) - this.idleW) * Math.min(1, dt * 2);
    this.swayT += dt;
    const L = this.look;
    L.timer -= dt;
    if (L.timer <= 0) {
      // sometimes glance to one side; otherwise return to center
      const glance = L.tgt === 0 && random() < 0.6;
      L.tgt = glance ? (random() < 0.5 ? -1 : 1) * (0.18 + random() * 0.17) : 0;
      L.timer = glance ? 1.2 + random() * 1.6 : 2.5 + random() * 3;
    }
    L.cur += (L.tgt - L.cur) * Math.min(1, dt * 2.5);
    const w = this.idleW;
    if (w < 0.001) return;
    // side sway (~5 s period): hips tilt, legs compensate (feet on the ground)
    const sway = w * 0.03 * Math.sin((this.swayT * Math.PI * 2) / 5.2);
    bones.hips?.rotateZ(sway);
    bones.legL?.rotateZ(-sway);
    bones.legR?.rotateZ(-sway);
    bones.spine?.rotateZ(sway * 0.4);
    bones.head?.rotateZ(-sway * 0.5);
    bones.head?.rotateY(w * L.cur);
  }

  // hand gestures while talking. A gesture is a full arm pose (rest + gesture) that
  // overrides idle/walk while talking: when walking, the hands gesture just like in idle,
  // without adding the stride swing (which spun the arm awkwardly).
  updateGestures(dt: number) {
    const bones = this.model.userData.bones;
    const talking = this.expression === 'talk';
    const tmp = this.gestureTmp;
    for (const g of this.gesture) {
      g.timer -= dt;
      if (g.timer <= 0) {
        const dominant = g.sx < 0; // the right hand gestures more
        const active = talking && random() < (dominant ? 0.75 : 0.45);
        g.tgt = active
          ? {
              s: -(0.2 + random() * 0.5),    // shoulder: arm forward
              e: -(0.5 + random() * 0.5),    // elbow: forearm rises (beyond rest)
              o: 0.06 + random() * 0.16,     // opens slightly sideways
              t: 0.3 + random() * 0.5,       // twists the forearm (palm up)
              w: 1,
            }
          : talking
            ? { s: -0.12, e: -0.35, o: 0.04, t: 0.1, w: 1 } // between gestures: arm slightly raised
            : { ...g.tgt, w: 0 };                 // not talking: back to idle/walk
        g.timer = talking ? (active ? 0.6 + random() * 0.8 : 0.4 + random() * 0.6) : 0.3;
      }
      const k = Math.min(1, dt * 5);
      for (const key of ['s', 'e', 'o', 't', 'w'] as const) g.cur[key] += (g.tgt[key] - g.cur[key]) * k;
      const w = g.cur.w;
      if (w < 0.001) continue;
      const shName = g.sx > 0 ? 'shoulderL' : 'shoulderR', elName = g.sx > 0 ? 'elbowL' : 'elbowR';
      const sh = bones[shName], el = bones[elName];
      const rS = REST[shName]!.r, rE = REST[elName]!.r;
      if (!sh || !el) continue;
      tmp.rotation.set(rS[0], rS[1], rS[2]);
      tmp.rotateX(g.cur.s);
      tmp.rotateZ(g.sx * g.cur.o);
      sh.quaternion.slerp(tmp.quaternion, w);
      tmp.rotation.set(rE[0], rE[1], rE[2]);
      tmp.rotateX(g.cur.e);
      tmp.rotateY(g.sx * g.cur.t);
      el.quaternion.slerp(tmp.quaternion, w);
    }
  }

  updateBlink(dt: number) {
    const eyes = this.model.userData.eyes;
    if (this.blinkT < 0) {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) { this.blinkT = 0; }
    }
    let k = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const d = 0.16;
      k = Math.abs(1 - (2 * this.blinkT) / d);
      if (this.blinkT >= d) {
        this.blinkT = -1;
        k = 1;
        this.blinkTimer = 2 + random() * 3;
      }
    }
    eyes.forEach((e) => { e.scale.y = Math.max(0.08, k * (1 - this.eyeSquint)); });
  }
}
