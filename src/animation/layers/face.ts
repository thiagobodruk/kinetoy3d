// Face layer: turns the current expression into mouth morphs, brow motion, eye squint and
// a little posture. Talking expressions open and close the mouth in random syllables and
// arch the brows for emphasis from time to time.
import type * as THREE from 'three';
import type { Rig } from '../../rig/rig';
import { random } from '../../core/random';
import type { Layer, LayerState } from '../layer';

export class FaceLayer implements Layer {
  /** Current (smoothed) channel values. */
  readonly face = { open: 0, smile: 0, sad: 0, surprise: 0 };
  private syllableTarget = 0;
  private syllableTimer = 0;
  private phraseTimer = 1.5;
  private pauseTimer = 0;
  private browRest: THREE.Vector3[];
  private browArch = 0;      // current arch 0..1 (smoothed)
  private browTarget = 0;
  private browTimer = 0;     // time left for the current arch

  constructor(rig: Rig) {
    this.browRest = rig.face.brows.map((b) => b.position.clone());
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
    const smileTarget = e.channels?.smile ?? 0;
    const sadTarget = e.channels?.sad ?? 0;
    const surpriseTarget = e.channels?.surprise ?? 0;
    const f = this.face;
    const rate = openTarget > f.open ? 28 : 18;
    f.open += (openTarget - f.open) * Math.min(1, dt * rate);
    f.smile += (smileTarget - f.smile) * Math.min(1, dt * 8);
    f.sad += (sadTarget - f.sad) * Math.min(1, dt * 4); // sadness sets in slowly
    f.surprise += (surpriseTarget - f.surprise) * Math.min(1, dt * 7);

    // mouth morph targets: 0 = smile, 1 = open (talk), 2 = sad, 3 = "O"
    face.mouth.forEach((m) => {
      const o = f.surprise * (1 - f.open); // surprise: "O" mouth (😯)
      if (!m.morphTargetInfluences) return;
      m.morphTargetInfluences[0] = f.smile * (1 - f.open) * (1 - o);
      m.morphTargetInfluences[1] = f.open;
      m.morphTargetInfluences[2] = f.sad * (1 - f.open) * (1 - o);
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
      const arch = this.browArch + 2.4 * f.surprise; // surprise: strongly arched brows
      b.position.y += 0.012 * f.smile + 0.018 * arch + 0.01 * f.sad;
      b.position.x -= sx * 0.006 * f.sad; // pulls the brows together (furrowed forehead)
      // the inner end rises more than the outer one: an expressive arch between the brows;
      // when sad the outer end drops much more ("roof"-shaped brow)
      b.rotation.z = -sx * (0.09 * arch + 0.38 * f.sad);
    });
    s.squint = 0.4 * f.smile + 0.18 * f.sad; // applied together with blinking
    // sad: head down and torso slightly hunched
    if (f.sad > 0.001) {
      s.bones.head?.rotateX(0.16 * f.sad);
      s.bones.spine?.rotateX(0.06 * f.sad);
    }
    // subtle head nod while talking (over the mixer pose)
    if (e.talk && s.bones.head) s.bones.head.rotateX(-f.open * 0.035);
  }
}
