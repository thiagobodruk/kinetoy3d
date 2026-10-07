// Built-in arm gestures. Each one plays once: it blends in, overrides the arm pose
// (idle/walk/dance/talk) while it lasts and blends out.
import * as THREE from 'three';
import { defineGesture } from '../animation/gestures';
import { armQuats, dir } from '../animation/pose';

// thumbs up: closed fingers, fist in front, palm inward → thumb up
defineGesture({
  name: 'thumbsUp',
  ui: { label: 'Thumbs up', icon: 'thumbs-up', key: 'Digit1' },
  duration: 2.4,
  pose: (t: number) => {
    const pump = 0.08 * Math.sin(Math.min(1, t / 0.6) * Math.PI); // small "ta-da" on arrival
    // arm well forward and forearm nearly level at chest height: the elbow bends little
    // (no "biceps") and the thumb stays clearly visible above the fist
    const q = armQuats(-1, dir(-0.1, -0.78, 0.6), dir(0.12, 0.08 + pump, 1), [1, 0, 0]);
    return {
      q: { shoulderR: q.s, elbowR: q.e },
      fingers: { fingersR: 1.45, fingerTipsR: 1.7 }, // fingers curl in an arc down to the palm
      thumbs: { thumbR: -1.0 }, // thumb (rigid piece) rotates until upright
      add: { head: [0.04, -0.08, -0.06] },
    };
  },
});

// wave: hand raised in front of the shoulder, palm forward, swaying side to side
defineGesture({
  name: 'wave',
  ui: { label: 'Wave', icon: 'hand-waving', key: 'Digit2' },
  duration: 2.8,
  pose: (t: number) => {
    const wv = Math.sin(t * Math.PI * 2 * 2) * Math.min(1, t / 0.4);
    // the wave rotates the whole arm around its own axis (at the shoulder): the elbow keeps
    // the same bend and the skin doesn't twist; the forearm sweeps side to side
    const dU = dir(-0.5, -0.35, 0.55);
    const q = armQuats(-1, dU, dir(-0.08, 1, 0.12), [0, 0, 1]);
    const swing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().fromArray(dU), -0.16 + 0.3 * wv); // offset arc: rotating outward folded the sleeve
    return {
      q: { shoulderR: swing.multiply(q.s), elbowR: q.e },
      add: { head: [0, -0.08, -0.06] },
    };
  },
});

// raise arm: upper arm forward at shoulder height and forearm up, palm forward
// (an elbow above the shoulder sank the sleeve into the torso)
defineGesture({
  name: 'armUp',
  ui: { label: 'Raise arm', icon: 'hand-palm', key: 'Digit3' },
  duration: 2.4,
  pose: (t: number) => {
    const bob = 0.06 * Math.sin(t * Math.PI * 2 * 1.2);
    const q = armQuats(-1, dir(-0.8, -0.1 + bob, 0.6), dir(-0.12, 1, 0.1), [0, -0.1, 1]); // opened diagonally: the sleeve doesn't sink into the chest
    return {
      q: { shoulderR: q.s, elbowR: q.e },
      add: { spine: [-0.03, 0, 0.04], head: [-0.06, 0, -0.04] },
      lift: 0.012, // the shoulder rises a little too
    };
  },
});

// shrug: shoulders up, forearms forward with palms up, head tilted
defineGesture({
  name: 'shrug',
  ui: { label: 'Shrug', icon: 'question', key: 'Digit4' },
  duration: 2.2,
  pose: () => ({
    r: {
      shoulderL: [-0.15, 0, 0.55], shoulderR: [-0.15, 0, -0.55],
      elbowL: [-1.35, 1.0, 0], elbowR: [-1.35, -1.0, 0],
    },
    add: { head: [-0.04, 0, 0.16], spine: [0, 0, -0.03] },
    lift: 0.025,
  }),
});
