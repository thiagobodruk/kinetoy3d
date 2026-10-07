// Built-in body clips (looping): idle, walk, dance, bow and look around.
import { defineClip } from '../animation/clips';
import { sampleClip, TAU } from '../animation/pose';

// u ∈ [0,1) — every function uses harmonics of 2π·u so the loop closes perfectly.
defineClip({
  name: 'idle',
  build: () => sampleClip('idle', 3.2, 30, (u: number) => {
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
  }),
});

// full cycle = two steps
defineClip({
  name: 'walk',
  build: () => sampleClip('walk', 0.9, 60, (u: number) => {
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
  }),
});

// dance: soft 4-beat groove (~100 bpm). Knees keep the beat (body dips and rises),
// hips sway side to side with the torso compensating, bent arms alternate in front.
// Feet stay planted: legs and feet offset the hip shift and tilt.
const LEG = 0.34; // hip → ankle
defineClip({
  name: 'dance',
  build: () => sampleClip('dance', 2.4, 60, (u: number) => {
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
  }),
});

// bow: bends forward from the spine, holds, comes back up and pauses (one bow per cycle)
defineClip({
  name: 'bow',
  build: () => sampleClip('bow', 3.2, 60, (u: number) => {
    // 0–0.2 down, 0.2–0.45 hold, 0.45–0.65 up, rest standing
    const ease = (x: number) => x * x * (3 - 2 * x);
    const k = u < 0.2 ? ease(u / 0.2) : u < 0.45 ? 1 : u < 0.65 ? 1 - ease((u - 0.45) / 0.2) : 0;
    return {
      hips: { p: [0, 0, -0.015 * k], r: [0.1 * k, 0, 0] },
      spine: { r: [0.3 * k, 0, 0] },
      head: { r: [0.12 * k, 0, 0] },
      legL: { r: [-0.1 * k, 0, 0] }, legR: { r: [-0.1 * k, 0, 0] }, // legs stay upright
      footL: { r: [0, 0, 0] }, footR: { r: [0, 0, 0] },
      // arms hang down as the torso bends
      shoulderL: { r: [-0.4 * k, 0, -0.1 * k] }, shoulderR: { r: [-0.4 * k, 0, 0.1 * k] },
    };
  }),
});

// look around: turns the head and torso left and right, peering, with a glance up
defineClip({
  name: 'lookAround',
  build: () => sampleClip('lookAround', 5, 30, (u: number) => {
    const a = TAU * u;
    const turn = Math.sin(a) * 0.8 + 0.2 * Math.sin(a * 3);   // lingers on each side
    const up = 0.5 - 0.5 * Math.cos(a * 2);
    return {
      hips: { r: [0, 0.08 * turn, 0] },
      spine: { r: [0.02, 0.22 * turn, 0] },
      head: { r: [-0.12 * up + 0.04, 0.55 * turn, 0.05 * Math.sin(a * 2)] },
      shoulderL: { r: [0.05, 0, 0.03 * up] }, shoulderR: { r: [0.05, 0, -0.03 * up] },
      footL: { r: [0, -0.08 * turn, 0] }, footR: { r: [0, -0.08 * turn, 0] },
    };
  }),
});
