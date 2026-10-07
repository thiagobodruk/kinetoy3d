// Talk gestures: while talking, each arm chases a new random pose on every "beat".
// A gesture is a full arm pose (rest + gesture) that overrides idle/walk while talking: when
// walking, the hands gesture just like in idle, without adding the stride swing.
import * as THREE from 'three';
import { random } from '../../core/random';
import type { Layer, LayerState } from '../layer';
import { REST } from '../pose';

interface GestureParams { s: number; e: number; o: number; t: number; w: number }

export class TalkGestureLayer implements Layer {
  private arms = [1, -1].map((sx) => ({
    sx, timer: 0,
    cur: { s: 0, e: 0, o: 0, t: 0, w: 0 } as GestureParams,
    tgt: { s: 0, e: 0, o: 0, t: 0, w: 0 } as GestureParams,
  }));
  private tmp = new THREE.Object3D();

  update(dt: number, s: LayerState): void {
    const bones = s.bones;
    const talking = !!s.expression.talk;
    const tmp = this.tmp;
    for (const g of this.arms) {
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
      if (!sh || !el) continue;
      const rS = REST[shName]!.r, rE = REST[elName]!.r;
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
}
