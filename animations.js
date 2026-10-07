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
  kneeL: { r: [0, 0, 0] },
  kneeR: { r: [0, 0, 0] },
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
    // joelho: quase reto ao pisar, leve flexão no apoio, dobra forte no balanço (perna indo à frente)
    const kneeL = 0.15 + 1.1 * Math.max(0, c) ** 1.2; // até ~72° no meio do balanço
    const kneeR = 0.15 + 1.1 * Math.max(0, -c) ** 1.2;
    return {
      hips: { p: [0.015 * s, 0.035 * bob - 0.01, 0], r: [0.04, 0.12 * s, 0.05 * c] },
      spine: { r: [0.05 + 0.02 * bob, -0.18 * s, -0.04 * c] },
      head: { r: [-0.04 - 0.03 * bob, 0.08 * s, 0.03 * c] },
      legL: { r: [-0.6 * s - 0.3 * Math.max(0, c) ** 1.2, 0, 0] }, // coxa sobe no balanço
      legR: { r: [0.6 * s - 0.3 * Math.max(0, -c) ** 1.2, 0, 0] },
      // pé acompanha a passada: ponta sobe ao pisar à frente, desce no impulso atrás,
      // com leve giro da ponta e rolamento lateral
      kneeL: { r: [kneeL, 0, 0] },
      kneeR: { r: [kneeR, 0, 0] },
      // pé (ângulo no mundo): ponta ~25° para cima ao pisar, ~55° para baixo no impulso,
      // plano no apoio e levemente pendente no balanço (compensa parte da dobra do joelho)
      footL: { r: [0.15 * s + 0.55 * liftL - 0.73 * kneeL + 0.3 * Math.max(0, c) ** 1.2 - 0.08, 0.1 * s, -0.04 * c] },
      footR: { r: [-0.15 * s + 0.55 * liftR - 0.73 * kneeR + 0.3 * Math.max(0, -c) ** 1.2 - 0.08, 0.1 * s, -0.04 * c] },
      // braço vai menos para trás do que para a frente (a manga não estica demais)
      // e abre um pouco para o lado ao ir para trás, afastando a manga das costas
      shoulderL: { r: [s > 0 ? 0.25 * s : 0.55 * s, 0, 0.04 + 0.08 * Math.max(0, s)] },
      shoulderR: { r: [s < 0 ? -0.25 * s : -0.55 * s, 0, -0.04 - 0.08 * Math.max(0, -s)] },
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
    this.gesture = [1, -1].map((sx) => ({ sx, cur: { s: 0, e: 0, o: 0, t: 0, w: 0 }, tgt: { s: 0, e: 0, o: 0, t: 0, w: 0 }, timer: 0 }));
    this.gestureTmp = new THREE.Object3D();

    // idle neutro: balanço lateral lento e olhadas eventuais para os lados (camada sobre o mixer)
    this.idleW = 0;          // peso da camada (0 fora do idle neutro)
    this.swayT = 0;
    this.look = { cur: 0, tgt: 0, timer: 2.5 };
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
    this.updateIdleLife(dt);
  }

  updateIdleLife(dt) {
    const bones = this.model.userData.bones;
    const on = this.current === 'idle' && this.expression === 'neutral';
    this.idleW += ((on ? 1 : 0) - this.idleW) * Math.min(1, dt * 2);
    this.swayT += dt;
    const L = this.look;
    L.timer -= dt;
    if (L.timer <= 0) {
      // às vezes olha para um lado; senão volta ao centro
      const glance = L.tgt === 0 && Math.random() < 0.6;
      L.tgt = glance ? (Math.random() < 0.5 ? -1 : 1) * (0.18 + Math.random() * 0.17) : 0;
      L.timer = glance ? 1.2 + Math.random() * 1.6 : 2.5 + Math.random() * 3;
    }
    L.cur += (L.tgt - L.cur) * Math.min(1, dt * 2.5);
    const w = this.idleW;
    if (w < 0.001) return;
    // balanço lateral (período ~5 s): quadril inclina, pernas compensam (pés no chão)
    const sway = w * 0.03 * Math.sin((this.swayT * Math.PI * 2) / 5.2);
    bones.hips?.rotateZ(sway);
    bones.legL?.rotateZ(-sway);
    bones.legR?.rotateZ(-sway);
    bones.spine?.rotateZ(sway * 0.4);
    bones.head?.rotateZ(-sway * 0.5);
    bones.head?.rotateY(w * L.cur);
  }

  // gesticulação com as mãos durante a fala. O gesto é uma pose de braço completa
  // (descanso + gesto) que substitui o idle/walk enquanto fala: andando, as mãos gesticulam
  // igual ao idle, sem somar o balanço do passo (que girava o braço de forma tosca).
  updateGestures(dt) {
    const bones = this.model.userData.bones;
    const talking = this.expression === 'talk';
    const tmp = this.gestureTmp;
    for (const g of this.gesture) {
      g.timer -= dt;
      if (g.timer <= 0) {
        const dominant = g.sx < 0; // mão direita gesticula mais
        const active = talking && Math.random() < (dominant ? 0.75 : 0.45);
        g.tgt = active
          ? {
              s: -(0.2 + Math.random() * 0.5),    // ombro: braço para a frente
              e: -(0.5 + Math.random() * 0.5),    // cotovelo: antebraço sobe (além do descanso)
              o: 0.06 + Math.random() * 0.16,     // abre um pouco para o lado
              t: 0.3 + Math.random() * 0.5,       // gira o antebraço (palma para cima)
              w: 1,
            }
          : talking
            ? { s: -0.12, e: -0.35, o: 0.04, t: 0.1, w: 1 } // entre gestos: braço levemente erguido
            : { ...g.tgt, w: 0 };                 // sem fala: volta ao idle/walk
        g.timer = talking ? (active ? 0.6 + Math.random() * 0.8 : 0.4 + Math.random() * 0.6) : 0.3;
      }
      const k = Math.min(1, dt * 5);
      for (const key of ['s', 'e', 'o', 't', 'w']) g.cur[key] += (g.tgt[key] - g.cur[key]) * k;
      const w = g.cur.w;
      if (w < 0.001) continue;
      const shName = g.sx > 0 ? 'shoulderL' : 'shoulderR', elName = g.sx > 0 ? 'elbowL' : 'elbowR';
      const sh = bones[shName], el = bones[elName];
      if (!sh || !el) continue;
      tmp.rotation.set(...REST[shName].r);
      tmp.rotateX(g.cur.s);
      tmp.rotateZ(g.sx * g.cur.o);
      sh.quaternion.slerp(tmp.quaternion, w);
      tmp.rotation.set(...REST[elName].r);
      tmp.rotateX(g.cur.e);
      tmp.rotateY(g.sx * g.cur.t);
      el.quaternion.slerp(tmp.quaternion, w);
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
