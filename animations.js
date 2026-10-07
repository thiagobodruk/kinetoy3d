// Clipes de animação gerados proceduralmente (AnimationClip + KeyframeTracks) e
// máquina de estados que faz crossfade entre eles via AnimationMixer.
import * as THREE from 'three';

const TAU = Math.PI * 2;

// pose de descanso de cada osso controlado pelos clipes
const REST = {
  hips: { p: [0, 0.52, 0], r: [0, 0, 0] },
  spine: { r: [0, 0, 0] },
  head: { r: [0, 0, 0] },
  // braços relaxados: levemente para trás no ombro e cotovelo dobrado (curva suave, não robótica)
  shoulderL: { r: [0.1, 0, 0.36] }, // inclui a abertura de bind (ARM_SPREAD / FOREARM_SPREAD)
  shoulderR: { r: [0.1, 0, -0.36] },
  elbowL: { r: [-0.38, 0.15, -0.1] },
  elbowR: { r: [-0.38, -0.15, 0.1] },
  legL: { r: [0, 0, 0] },
  legR: { r: [0, 0, 0] },
  footL: { r: [0, 0, 0] },
  footR: { r: [0, 0, 0] },
};

// Amostra fn(t) -> { osso: { r:[dx,dy,dz], p:[dx,dy,dz] } } como offsets sobre REST.
function sampleClip(name, duration, fps, fn) {
  const frames = Math.round(duration * fps);
  const times = [];
  const data = {};
  for (const bone of Object.keys(REST)) data[bone] = { q: [], p: [] };
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  for (let i = 0; i <= frames; i++) {
    const t = (i / frames) * duration;
    times.push(t);
    const off = fn(t / duration) || {};
    for (const [bone, rest] of Object.entries(REST)) {
      const o = off[bone] || {};
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
  const tracks = [];
  for (const [bone, d] of Object.entries(data)) {
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, d.q));
    if (d.p.length) tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, times, d.p));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

// u ∈ [0,1) — todas as funções usam harmônicos de 2π·u para o loop fechar perfeitamente.
export function createIdleClip() {
  return sampleClip('idle', 3.2, 30, (u) => {
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
  // ciclo completo = dois passos
  return sampleClip('walk', 0.9, 60, (u) => {
    const a = TAU * u;
    const s = Math.sin(a);
    const c = Math.cos(a);
    const bob = 0.5 - 0.5 * Math.cos(a * 2); // dois picos por ciclo
    const liftL = Math.max(0, -s); // pé esquerdo no ar quando a perna volta
    const liftR = Math.max(0, s);
    return {
      hips: { p: [0.015 * s, 0.035 * bob - 0.01, 0], r: [0.04, 0.12 * s, 0.05 * c] },
      spine: { r: [0.05 + 0.02 * bob, -0.18 * s, -0.04 * c] },
      head: { r: [-0.04 - 0.03 * bob, 0.08 * s, 0.03 * c] },
      legL: { r: [-0.6 * s, 0, 0] },
      legR: { r: [0.6 * s, 0, 0] },
      footL: { r: [0.35 * s + 0.6 * liftL, 0, 0] },
      footR: { r: [-0.35 * s + 0.6 * liftR, 0, 0] },
      shoulderL: { r: [0.55 * s, 0, 0.04] },
      shoulderR: { r: [-0.55 * s, 0, -0.04] },
      elbowL: { r: [-0.3 - 0.25 * Math.max(0, -s), 0, 0] },
      elbowR: { r: [-0.3 - 0.25 * Math.max(0, s), 0, 0] },
    };
  });
}

// ---------- máquina de estados ----------
export class CharacterStateMachine {
  constructor(model, { fade = 0.28 } = {}) {
    this.model = model;
    this.fade = fade;
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {
      idle: this.mixer.clipAction(createIdleClip()),
      walk: this.mixer.clipAction(createWalkClip()),
    };
    this.states = {
      idle: {
        enter: () => {},
        update: () => {},
      },
      walk: {
        enter: () => {},
        // velocidade de reprodução acompanha a velocidade de deslocamento
        update: (dt, ctx) => { this.actions.walk.timeScale = THREE.MathUtils.clamp(ctx.speed / 1.1, 0.5, 2); },
      },
    };
    // transições permitidas e suas condições
    this.transitions = [
      { from: 'idle', to: 'walk', when: (ctx) => ctx.moving },
      { from: 'walk', to: 'idle', when: (ctx) => !ctx.moving },
    ];
    this.listeners = [];
    this.current = null;
    this.set('idle', 0);

    // piscar: camada independente aplicada sobre as escalas dos olhos
    this.blinkTimer = 1.5;
    this.blinkT = -1;

    // expressão facial: camada independente do corpo (funciona em idle e walk)
    //   neutral → boca fechada · smile → sorriso · talk → abre e fecha a boca em sílabas
    this.expression = 'neutral';
    this.face = { open: 0, smile: 0 };  // valores atuais (suavizados)
    this.syllableTarget = 0;
    this.syllableTimer = 0;
    this.phraseTimer = 1.5;
    this.pauseTimer = 0;
    this.eyeSquint = 0;
    this.browRest = (model.userData.brows || []).map((b) => b.position.clone());
    this.browArch = 0;      // arqueamento atual 0..1 (suavizado)
    this.browTarget = 0;
    this.browTimer = 0;     // tempo restante do arqueamento atual

    // gestos de fala: cada braço persegue uma pose-alvo que muda a cada "batida"
    this.gesture = [1, -1].map((sx) => ({ sx, cur: { s: 0, e: 0, o: 0, t: 0 }, tgt: { s: 0, e: 0, o: 0, t: 0 }, timer: 0 }));
  }

  setExpression(name) {
    this.expression = name;
    this.listeners.forEach((fn) => fn(this.current, this.current));
  }

  onChange(fn) { this.listeners.push(fn); }

  set(name, fade = this.fade) {
    if (this.current === name) return;
    const next = this.actions[name];
    next.reset().setEffectiveWeight(1).play();
    if (this.current) {
      const prev = this.actions[this.current];
      // sincroniza a fase para o passo começar natural
      prev.crossFadeTo(next, fade, true);
      this.states[this.current].exit?.();
    }
    const from = this.current;
    this.current = name;
    this.states[name].enter();
    this.listeners.forEach((fn) => fn(name, from));
  }

  update(dt, ctx) {
    for (const tr of this.transitions) {
      if (tr.from === this.current && tr.when(ctx)) { this.set(tr.to); break; }
    }
    this.states[this.current].update(dt, ctx);
    this.mixer.update(dt);
    this.updateBlink(dt);
    this.updateFace(dt);
  }

  updateFace(dt) {
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
          // nova sílaba: 90–190 ms; algumas quase fechadas (consoantes)
          this.syllableTimer = 0.09 + Math.random() * 0.1;
          this.syllableTarget = Math.random() < 0.2 ? 0.05 : 0.35 + Math.random() * 0.65;
        }
        if (this.phraseTimer <= 0) {
          // fim de frase: pausa curta de boca fechada
          this.phraseTimer = 1.2 + Math.random() * 1.8;
          this.pauseTimer = 0.25 + Math.random() * 0.45;
        }
      }
      openTarget = this.syllableTarget;
      smileTarget = 0.25; // fala simpática
    } else if (this.expression === 'smile') {
      smileTarget = 1;
    }
    const f = this.face;
    const rate = openTarget > f.open ? 28 : 18;
    f.open += (openTarget - f.open) * Math.min(1, dt * rate);
    f.smile += (smileTarget - f.smile) * Math.min(1, dt * 8);

    // morph targets da boca: 0 = sorriso, 1 = aberta (fala)
    ud.mouthMeshes.forEach((m) => {
      m.morphTargetInfluences[0] = f.smile * (1 - f.open);
      m.morphTargetInfluences[1] = f.open;
    });
    // sobrancelhas: na fala, arqueiam suavemente de tempos em tempos (ênfase) e voltam ao normal
    if (this.expression === 'talk') {
      this.browTimer -= dt;
      if (this.browTimer <= 0) {
        const up = this.browTarget === 0;
        this.browTarget = up ? 0.6 + Math.random() * 0.4 : 0;
        this.browTimer = up ? 0.35 + Math.random() * 0.35 : 0.6 + Math.random() * 1.2;
      }
    } else {
      this.browTarget = 0;
      this.browTimer = 0.3;
    }
    this.browArch += (this.browTarget - this.browArch) * Math.min(1, dt * 7);
    (ud.brows || []).forEach((b, i) => {
      const sx = b.userData.side;
      b.position.copy(this.browRest[i]);
      b.position.y += 0.012 * f.smile + 0.018 * this.browArch;
      // a ponta interna sobe mais que a externa: arco expressivo entre as duas sobrancelhas
      b.rotation.z = -sx * 0.09 * this.browArch;
    });
    this.eyeSquint = 0.4 * f.smile; // aplicado junto com o piscar
    // leve aceno de cabeça acompanhando a fala (sobre a pose do mixer)
    if (this.expression === 'talk' && ud.bones.head) ud.bones.head.rotateX(-f.open * 0.035);
    this.updateGestures(dt);
  }

  // gesticulação com as mãos durante a fala (camada aditiva sobre o idle/walk)
  updateGestures(dt) {
    const bones = this.model.userData.bones;
    const talking = this.expression === 'talk';
    for (const g of this.gesture) {
      g.timer -= dt;
      if (g.timer <= 0) {
        const dominant = g.sx < 0; // mão direita gesticula mais
        const active = talking && Math.random() < (dominant ? 0.85 : 0.55);
        g.tgt = active
          ? {
              s: -(0.2 + Math.random() * 0.55),   // ombro: braço para a frente
              e: -(0.7 + Math.random() * 0.6),    // cotovelo: antebraço sobe
              o: 0.08 + Math.random() * 0.22,     // abre um pouco para o lado
              t: 0.3 + Math.random() * 0.6,       // gira o antebraço (palma para cima)
            }
          : talking ? { s: -0.12, e: -0.35, o: 0.04, t: 0.1 } : { s: 0, e: 0, o: 0, t: 0 };
        g.timer = talking ? 0.45 + Math.random() * 0.75 : 0.3;
      }
      const k = Math.min(1, dt * (talking ? 6 : 4));
      for (const key of ['s', 'e', 'o', 't']) g.cur[key] += (g.tgt[key] - g.cur[key]) * k;
      const sh = bones[g.sx > 0 ? 'shoulderL' : 'shoulderR'];
      const el = bones[g.sx > 0 ? 'elbowL' : 'elbowR'];
      if (!sh || !el) continue;
      sh.rotateX(g.cur.s);
      sh.rotateZ(g.sx * g.cur.o);
      el.rotateX(g.cur.e);
      el.rotateY(g.sx * g.cur.t);
    }
  }


  updateBlink(dt) {
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
        this.blinkTimer = 2 + Math.random() * 3;
      }
    }
    eyes.forEach((e) => { e.scale.y = Math.max(0.08, k * (1 - this.eyeSquint)); });
  }
}
