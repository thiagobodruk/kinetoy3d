// Face layer: turns the current expression into mouth morphs, brow motion, eye squint and
// a little posture. Talking expressions open and close the mouth in random syllables and
// arch the brows for emphasis from time to time.
import type * as THREE from 'three';
import type { Rig } from '../../rig/rig';
import { random } from '../../core/random';
import type { Layer, LayerState } from '../layer';

export class FaceLayer implements Layer {
  /** Current (smoothed) channel values. */
  readonly face = { open: 0, smile: 0, sad: 0, surprise: 0, angry: 0, laugh: 0, fear: 0 };
  private syllableTarget = 0;
  private syllableTimer = 0;
  private phraseTimer = 1.5;
  private pauseTimer = 0;
  private browRest: THREE.Vector3[];
  private browArch = 0;      // current arch 0..1 (smoothed)
  private browTarget = 0;
  private browTimer = 0;     // time left for the current arch
  private t = 0;             // clock for the laugh bounce and the fear tremble

  constructor(rig: Rig) {
    // rest positions are recorded once per model (a new layer may start from a displaced pose)
    this.browRest = rig.face.brows.map((b) => (b.userData.rest ??= b.position.clone()) as THREE.Vector3);
  }

  update(dt: number, s: LayerState): void {
    const face = s.rig.face;
    const e = s.expression;
    let openTarget = 0;
    if (e.talk) {
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
    }
    const f = this.face;
    const ch = e.channels ?? {};
    this.t += dt;
    // laugh: the mouth bounces open and half-closed ~4.5 times a second ("ha-ha-ha")
    const ha = Math.abs(Math.sin(this.t * Math.PI * 4.5));
    openTarget = Math.max(openTarget, f.laugh * (0.15 + 0.35 * ha));
    const rate = openTarget > f.open ? 28 : 18;
    f.open += (openTarget - f.open) * Math.min(1, dt * rate);
    const ease = (key: Exclude<keyof typeof f, 'open'>, k: number) => {
      f[key] += ((ch[key] ?? 0) - f[key]) * Math.min(1, dt * k);
    };
    ease('smile', 8);
    ease('sad', 4); // sadness sets in slowly
    ease('surprise', 7);
    ease('angry', 6);
    ease('laugh', 8);
    ease('fear', 7);

    // mouth morph targets: 0 = smile, 1 = open (talk), 2 = sad, 3 = "O"
    face.mouth.forEach((m) => {
      const o = Math.min(1, f.surprise + 0.55 * f.fear) * (1 - f.open); // surprise/fear: "O" mouth (😯)
      const smile = Math.min(1, f.smile + f.laugh);
      const frown = Math.min(1, f.sad + 0.45 * f.angry + 0.3 * f.fear);
      if (!m.morphTargetInfluences) return;
      // the smile and open morphs add up past the lips (into the beard): a laugh keeps only part of the smile while open
      m.morphTargetInfluences[0] = smile * (1 - f.open * (1 - 0.35 * f.laugh)) * (1 - o);
      m.morphTargetInfluences[1] = f.open;
      m.morphTargetInfluences[2] = frown * (1 - f.open) * (1 - o);
      m.morphTargetInfluences[3] = o;
    });
    // eyebrows: while talking, they arch softly from time to time (emphasis) and settle back
    if (e.talk) {
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
    face.brows.forEach((b, i) => {
      const sx = b.userData.side;
      b.position.copy(this.browRest[i]);
      const arch = this.browArch + 2.4 * f.surprise + 1.6 * f.fear; // surprise/fear: strongly arched brows
      b.position.y += 0.012 * (f.smile + f.laugh) + 0.018 * arch + 0.01 * f.sad - 0.014 * f.angry;
      b.position.x -= sx * (0.006 * f.sad + 0.009 * f.angry + 0.004 * f.fear); // pulls the brows together (furrowed forehead)
      // the inner end rises more than the outer one: an expressive arch between the brows;
      // when sad (or scared) the outer end drops much more ("roof"-shaped brow);
      // angry tilts them the other way: inner ends down (a "V")
      b.rotation.z = -sx * (0.09 * arch + 0.38 * f.sad + 0.3 * f.fear - 0.42 * f.angry);
    });
    s.squint = 0.4 * f.smile + 0.18 * f.sad + 0.35 * f.angry + 0.75 * f.laugh; // applied together with blinking
    // sad: head down and torso slightly hunched
    if (f.sad > 0.001) {
      s.bones.head?.rotateX(0.16 * f.sad);
      s.bones.spine?.rotateX(0.06 * f.sad);
    }
    // angry: head down a little, glaring from under the brows
    if (f.angry > 0.001) s.bones.head?.rotateX(0.07 * f.angry);
    // laugh: head back, shaking with each "ha", the torso bouncing along
    if (f.laugh > 0.001) {
      s.bones.head?.rotateX(-f.laugh * (0.1 + 0.05 * ha));
      s.bones.spine?.rotateX(-f.laugh * 0.03 * ha);
    }
    // fear: head pulled back and a fast, small tremble
    if (f.fear > 0.001) {
      const tremble = Math.sin(this.t * 53) * 0.6 + Math.sin(this.t * 37) * 0.4;
      s.bones.head?.rotateX(-0.05 * f.fear);
      s.bones.head?.rotateZ(0.012 * f.fear * tremble);
      s.bones.spine?.rotateX(-0.03 * f.fear);
    }
    // subtle head nod while talking (over the mixer pose)
    if (e.talk && s.bones.head) s.bones.head.rotateX(-f.open * 0.035);
  }
}
