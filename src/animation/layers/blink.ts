// Blink layer: periodic blinks over the eye scales, combined with the face squint.
import { random } from '../../core/random';
import type { Layer, LayerState } from '../layer';

const BLINK_TIME = 0.16;

export class BlinkLayer implements Layer {
  private timer = 1.5;   // time until the next blink
  private t = -1;        // time into the current blink (−1 = eyes open)

  update(dt: number, s: LayerState): void {
    if (this.t < 0) {
      this.timer -= dt;
      if (this.timer <= 0) { this.t = 0; }
    }
    let k = 1;
    if (this.t >= 0) {
      this.t += dt;
      k = Math.abs(1 - (2 * this.t) / BLINK_TIME);
      if (this.t >= BLINK_TIME) {
        this.t = -1;
        k = 1;
        this.timer = 2 + random() * 3;
      }
    }
    s.model.userData.eyes.forEach((e) => { e.scale.y = Math.max(0.08, k * (1 - s.squint)); });
  }
}
