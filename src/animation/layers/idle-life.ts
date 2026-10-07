// Idle life: in a calm idle, a slow side sway and occasional glances to the sides.
import { random } from '../../core/random';
import type { Layer, LayerState } from '../layer';

export class IdleLifeLayer implements Layer {
  private w = 0;          // layer weight (0 outside a calm idle)
  private swayT = 0;
  private look = { cur: 0, tgt: 0, timer: 2.5 };

  update(dt: number, s: LayerState): void {
    const bones = s.bones;
    const on = s.body === 'idle' && !!s.expression.idleLife;
    this.w += ((on ? 1 : 0) - this.w) * Math.min(1, dt * 2);
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
    const w = this.w;
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
}
