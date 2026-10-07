// Modelo procedural do personagem (estilo vinyl toy) reconstruído a partir do model sheet.
// Convenção: Y para cima, frente em +Z, esquerda do personagem em +X. Chão em y = 0.
// Unidade: altura total ≈ 2.0 — a cabeça ocupa ~metade da altura.
// Superfícies orgânicas (pele, cabelo, barba, roupa, mãos, tênis) são campos SDF com
// união suave, poligonizados por Surface Nets. Camisa e calça são SkinnedMesh.
import * as THREE from 'three';
import { smin, ellipsoid, sphere, roundCone, torus, roundBox, union, subtract, intersect, custom, transform, polygonize, surfaceZ } from './sdf.js';

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smoothstep = THREE.MathUtils.smoothstep;
function smaxSoft(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

const PALETTE = {
  skin: 0xe8a37e,
  skinShade: 0xd48a6a,
  nose: 0xf08378,
  blush: 0xf2737a,
  lip: 0xd9877a,
  hair: 0xf2efe8,
  shirt: 0xd6161e,
  star: 0xffffff,
  pants: 0x1d275a,
  shoe: 0xf6f6f4,
  sole: 0xd5d8de,
  eye: 0x141414,
  mouth: 0x5a2420,
  tongue: 0x9a4f47,
};

function vinyl(color, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.55, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.5, ...opts,
  });
}

// ---------- esqueleto (pose de bind: posição local + rotação local de cada osso) ----------
// Os ombros já nascem abertos (rot Z) para os braços ficarem afastados do corpo.
const ARM_SPREAD = 0.34;     // braço levemente aberto a partir do ombro
const BONES = [
  ['hips', null, [0, 0.52, 0]],
  ['spine', 'hips', [0, 0, 0]],
  ['head', 'spine', [0, 0.5, 0]],
  ['shoulderL', 'spine', [0.33, 0.41, 0], [0, 0, ARM_SPREAD]],
  ['elbowL', 'shoulderL', [0, -0.25, 0], [-0.38, 0.15, -0.1]], // bind = pose de descanso (sem deformação no idle)
  ['shoulderR', 'spine', [-0.33, 0.41, 0], [0, 0, -ARM_SPREAD]],
  ['elbowR', 'shoulderR', [0, -0.25, 0], [-0.38, -0.15, 0.1]],
  ['legL', 'hips', [0.16, -0.02, 0]],
  ['footL', 'legL', [0, -0.34, 0]],
  ['legR', 'hips', [-0.16, -0.02, 0]],
  ['footR', 'legR', [0, -0.34, 0]],
];

function buildSkeleton() {
  const bones = {};
  for (const [name, parent, pos, rot] of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...pos);
    if (rot) b.rotation.set(...rot);
    bones[name] = b;
    if (parent) bones[parent].add(b);
  }
  const list = BONES.map(([n]) => bones[n]);
  return { bones, list, index: Object.fromEntries(BONES.map(([n], i) => [n, i])) };
}

// matriz de mundo (bind) de um osso — usada para levar campos locais ao espaço do personagem
const boneMatrix = (bones, name) => bones[name].matrixWorld.clone();

// pesos por "softmin" das distâncias de cada grupo do campo
function softWeights(groups, tau) {
  return (x, y, z) => {
    const ds = groups.map(([, node]) => node.eval(x, y, z));
    const m = Math.min(...ds);
    return groups.map(([bone], i) => [bone, Math.exp(-(ds[i] - m) / tau)]);
  };
}

// ================= CABEÇA (coordenadas locais do osso "head", y=1.02 no mundo) =================
const NOSE_C = [0, 0.385, 0.415];
const MOUTH_Y = 0.222;               // linha da boca (local da cabeça)
// região de pele em volta da boca: abaixo do bigode até logo abaixo do lábio inferior
const MOUTH_PATCH = ellipsoid([0, MOUTH_Y - 0.018, 0.418], [0.11, 0.05, 0.045]); // rebaixo bem raso
const MOUTH_PATCH_COLOR = ellipsoid([0, MOUTH_Y - 0.014, 0.37], [0.118, 0.055, 0.09]);

function headSkinField() {
  const parts = [
    ellipsoid([0, 0.46, 0.02], [0.355, 0.36, 0.35]),
    ellipsoid([0.19, 0.35, 0.16], [0.16, 0.13, 0.15]),
    ellipsoid([-0.19, 0.35, 0.16], [0.16, 0.13, 0.15]),
    ellipsoid([0, 0.28, 0.05], [0.29, 0.17, 0.27]),
    roundCone([0, -0.06, -0.03], [0, 0.2, 0], 0.13, 0.15), // pescoço
  ];
  let skin = union(parts, 0.09);
  // orelhas com concha
  for (const sx of [-1, 1]) {
    // orelha um pouco mais à frente e com a face voltada para a frente (EAR_YAW): visível de frente
    const EAR_YAW = 0.72;
    const rot = [0, -sx * EAR_YAW, 0];
    const ec = [sx * 0.385, 0.38, -0.05];
    const n = [sx * Math.cos(EAR_YAW), 0, Math.sin(EAR_YAW)]; // normal da face da orelha
    let ear = ellipsoid(ec, [0.036, 0.09, 0.064], rot);
    ear = subtract(ear, ellipsoid([ec[0] + n[0] * 0.03, 0.374, ec[2] + n[2] * 0.03], [0.016, 0.05, 0.034], rot), 0.018);
    skin = union([skin, ear], 0.03);
  }
  // nariz bulboso (mesma pele, cor separada por vértice)
  skin = union([skin, ellipsoid(NOSE_C, [0.105, 0.095, 0.1])], 0.025);
  return skin;
}

function headSkinColor() {
  const skin = new THREE.Color(PALETTE.skin), nose = new THREE.Color(PALETTE.nose),
    blush = new THREE.Color(PALETTE.blush), shade = new THREE.Color(PALETTE.skinShade);
  return (x, y, z, out) => {
    out.copy(skin);
    // blush nas bochechas
    for (const sx of [-1, 1]) {
      const d = Math.hypot(x - sx * 0.235, (y - 0.35) * 1.15, (z - 0.3) * 0.6);
      out.lerp(blush, (1 - smoothstep(d, 0.025, 0.1)) * 0.55);
    }
    // interior das orelhas
    if (Math.abs(x) > 0.36 && y > 0.29 && y < 0.47 && z < 0.03 && z > -0.13) out.lerp(shade, 0.45 * smoothstep(Math.abs(x), 0.37, 0.4));
    // nariz
    const dn = Math.hypot((x - NOSE_C[0]) / 0.105, (y - NOSE_C[1]) / 0.095, (z - NOSE_C[2]) / 0.1);
    out.lerp(nose, 1 - smoothstep(dn, 0.92, 1.12));
  };
}

function hairField() {
  const items = [];

  // Core principal do crânio (Base sólida que cobre toda a pele para não ter buracos)
  items.push(ellipsoid([0, 0.57, -0.04], [0.335, 0.24, 0.31])); // Principal (envolve a cabeça)
  items.push(ellipsoid([0, 0.46, -0.10], [0.30, 0.20, 0.23])); // Nuca inferior
  items.push(ellipsoid([0, 0.66, 0.02], [0.26, 0.15, 0.24])); // Topo (mais estreito: quinas superiores mais baixas)

  const addTuft = (x, y, z, rx, ry = rx, rz = rx, rot = null) => {
    items.push(ellipsoid([x, y, z], [rx, ry, rz], rot));
  };

  // 1. Linha da testa (tufo central delicado + laterais ajustadas mais sutis ao lado das entradas)
  // ponta central arredondada (U suave) para harmonizar com as entradas
  addTuft(0, 0.722, 0.188, 0.118, 0.09, 0.095, [-0.2, 0, 0]);
  // lóbulo na ponta: borda inferior do tufo em U (sem trecho reto/achatado)
  addTuft(0, 0.698, 0.245, 0.068, 0.058, 0.052, [-0.35, 0, 0]);
  for (const sx of [-1, 1]) {
    // Laterais das entradas um pouco mais largas para conectar melhor
    // cantos superiores da testa mais baixos e discretos
    addTuft(sx * 0.25, 0.63, 0.06, 0.08, 0.058, 0.09, [-0.2, sx * -0.3, 0]);
  }

  // 2. Topo compacto (peça contínua e suave para evitar bolotas e furos)
  addTuft(0, 0.77, 0.02, 0.18, 0.08, 0.16);
  addTuft(0, 0.75, -0.09, 0.16, 0.08, 0.14);

  // 3. Laterais fofas contínuas (contornando a cabeça e orelhas)
  for (const sx of [-1, 1]) {
    addTuft(sx * 0.29, 0.55, 0.0, 0.09, 0.075, 0.10);
    addTuft(sx * 0.29, 0.48, -0.06, 0.09, 0.08, 0.10);
    addTuft(sx * 0.25, 0.40, -0.12, 0.085, 0.075, 0.095);
  }

  // 4. Costas e Nuca (massa de nuvem contínua e suave, sem projeção excessiva para trás)
  addTuft(-0.12, 0.64, -0.17, 0.115, 0.08, 0.10);
  addTuft(0, 0.66, -0.18, 0.13, 0.085, 0.10);
  addTuft(0.12, 0.64, -0.17, 0.115, 0.08, 0.10);

  addTuft(-0.14, 0.52, -0.22, 0.12, 0.085, 0.10);
  addTuft(0, 0.53, -0.23, 0.13, 0.085, 0.10);
  addTuft(0.14, 0.52, -0.22, 0.12, 0.085, 0.10);

  // Nuca: massa única e lisa, terminando um pouco abaixo das orelhas com borda arredondada
  addTuft(0, 0.36, -0.165, 0.255, 0.125, 0.165);
  addTuft(0, 0.46, -0.19, 0.265, 0.11, 0.15); // ponte lisa entre a nuca e os tufos de cima (sem sulco)

  // Smooth union k = 0.060 funde totalmente em uma superfície macia e contínua
  let hair = union(items, 0.060);

  // Entradas leves limpas e marcadas nas têmporas
  const templeCutouts = union([
    ellipsoid([-0.178, 0.742, 0.16], [0.056, 0.072, 0.065]),
    ellipsoid([0.178, 0.742, 0.16], [0.056, 0.072, 0.065]),
  ], 0.02);

  hair = subtract(hair, templeCutouts, 0.075); // concordância larga: contorno do tufo 100% arredondado, sem quinas

  return hair;
}

function beardField() {
  const items = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const a = (t - 0.5) * Math.PI * 0.92;
    const x = Math.sin(a) * 0.29, y = 0.12 + (1 - Math.cos(a)) * 0.18, z = 0.04 + Math.cos(a) * 0.23;
    const taper = 1 - 0.35 * Math.abs(t - 0.5) * 2; // pontas mais finas: não invadem a orelha
    items.push(ellipsoid([x, y, z], [0.12, 0.125, 0.11 * taper]));
  }
  items.push(ellipsoid([0, 0.12, 0.17], [0.21, 0.15, 0.18]));
  // queixo levemente marcado: a barba afina para baixo e termina num ponto suave
  items.push(ellipsoid([0, 0.02, 0.19], [0.1, 0.075, 0.1]));
  for (const sx of [-1, 1]) {
    items.push(ellipsoid([sx * 0.15, 0.225, 0.255], [0.11, 0.09, 0.09]));
    // costeleta passando à frente da orelha até o cabelo
    items.push(roundCone([sx * 0.3, 0.29, 0.085], [sx * 0.31, 0.565, 0.025], 0.065, 0.05)); // sobe até entrar sob o cabelo
  }
  let beard = union(items, 0.07);
  // bigode: dois lóbulos caídos + ponte sob o nariz
  const stache = union([
    ellipsoid([0.085, 0.288, 0.37], [0.115, 0.052, 0.068], [0, 0.35, -0.32]),
    ellipsoid([-0.085, 0.288, 0.37], [0.115, 0.052, 0.068], [0, -0.35, 0.32]),
    ellipsoid([0, 0.3, 0.385], [0.05, 0.04, 0.05]),
  ], 0.03);
  // área de pele em volta da boca (model sheet): rebaixo raso na barba, pintado com a cor da pele
  // preenche a faixa entre o bigode e a boca (sem buraco atrás do bigode)
  beard = union([beard, ellipsoid([0, MOUTH_Y + 0.022, 0.335], [0.1, 0.035, 0.04])], 0.03);
  beard = subtract(beard, MOUTH_PATCH, 0.02);
  return { field: union([beard, stache], 0.018), stache, base: beard };
}

// sobrancelha de um lado (sx = +1 esquerda do personagem, −1 direita)
function browField(sx) {
  // tubo contínuo e liso: muitos segmentos curtos com raio variando suavemente (sem degraus/rugas)
  const N = 24;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = sx * (0.09 + 0.13 * t);
    const y = 0.57 + 0.024 * Math.sin(Math.PI * t * 0.9) - 0.026 * t;
    // apoio na superfície aproximada do crânio
    const dx = x / 0.36, dy = (y - 0.46) / 0.36;
    const z = 0.02 + 0.35 * Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)) + 0.01;
    pts.push([x, y, z]);
  }
  const radius = (t) => 0.024 - 0.006 * t * t; // afina suavemente para a ponta externa
  const items = [];
  for (let i = 0; i < N; i++) items.push(roundCone(pts[i], pts[i + 1], radius(i / N), radius((i + 1) / N)));
  return union(items, 0.006);
}

// ---------- boca (sem lábios, como no model sheet) ----------
// Uma abertura delimitada sobre a pele sob o bigode. Três formas com a mesma topologia:
// base = neutro (linha fina de sorriso), morph 0 = sorriso (D aberto com dentes), morph 1 = fala (oval aberto).
const MOUTH_SHAPES = {
  // raise: o meio da borda superior SOBE um pouco (lábio de cima não desce junto com o queixo)
  neutral: { w: 0.15, lift: 0.012, raise: 0, depth: 0.007, teeth: 0, tongue: 0 },
  smile: { w: 0.178, lift: 0.024, raise: 0, depth: 0.044, teeth: 0.34, tongue: 0.18 },
  open: { w: 0.14, lift: 0.012, raise: 0.006, depth: 0.09, teeth: 0.2, tongue: 0.32 },
};
function buildMouth(mats, surfaceField) {
  const NU = 28, NV = 8;
  // vMin..vMax: faixa da abertura coberta pela camada (0 = borda de cima, 1 = borda de baixo)
  const layer = (shape, part) => {
    const pos = [];
    for (let j = 0; j <= NV; j++) {
      for (let i = 0; i <= NU; i++) {
        const t = (i / NU) * 2 - 1;
        const x = t * shape.w / 2;
        const yTop = MOUTH_Y + 0.004 + shape.lift * t * t + shape.raise * (1 - t * t);
        const depth = shape.depth * Math.pow(Math.max(0, 1 - t * t), 0.7);
        let v = j / NV;
        if (part === 'teeth') v *= shape.teeth;
        if (part === 'tongue') v = 0.92 - shape.tongue + v * shape.tongue; // não encosta na borda
        const y = yTop - depth * v;
        const lift = part === 'interior' ? 0.0015 : 0.0025; // camadas por cima do interior escuro
        pos.push(x, y, surfaceZ(surfaceField, x, y, 0.6, 0.15) + lift);
      }
    }
    return new Float32Array(pos);
  };
  const index = [];
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  const make = (part, mat) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(layer(MOUTH_SHAPES.neutral, part), 3));
    geo.setIndex(index);
    geo.morphAttributes.position = [
      new THREE.BufferAttribute(layer(MOUTH_SHAPES.smile, part), 3),
      new THREE.BufferAttribute(layer(MOUTH_SHAPES.open, part), 3),
    ];
    // normais da forma aberta: na neutra, dentes/língua ficam colapsados (área zero → normais nulas)
    const ref = new THREE.BufferGeometry();
    ref.setAttribute('position', geo.morphAttributes.position[1]);
    ref.setIndex(index);
    ref.computeVertexNormals();
    geo.setAttribute('normal', ref.getAttribute('normal'));
    const m = new THREE.Mesh(geo, mat);
    m.name = 'mouth_' + part;
    m.updateMorphTargets();
    return m;
  };
  return [make('interior', mats.mouth), make('teeth', mats.teeth), make('tongue', mats.tongue)];
}

function buildHead(mats, headBone) {
  const g = new THREE.Group();
  g.name = 'headGeo';

  const skinGeo = polygonize(headSkinField(), { min: [-0.48, -0.08, -0.4], max: [0.48, 0.84, 0.55], cell: 0.0095, color: headSkinColor() });
  const skin = new THREE.Mesh(skinGeo, mats.skinVC);
  skin.name = 'headSkin';
  g.add(skin);

  const hair = new THREE.Mesh(polygonize(hairField(), { min: [-0.5, -0.02, -0.56], max: [0.5, 1.02, 0.4], cell: 0.011 }), mats.hair);
  hair.name = 'hairMesh';
  g.add(hair);

  const beardParts = beardField();
  const hairC = new THREE.Color(PALETTE.hair), skinC = new THREE.Color(PALETTE.skin);
  const beardGeo = polygonize(beardParts.field, {
    min: [-0.46, -0.08, -0.15], max: [0.46, 0.6, 0.5], cell: 0.0075,
    color: (x, y, z, out) => {
      // pele dentro da região da boca, exceto onde o bigode cobre
      const inPatch = 1 - smoothstep(MOUTH_PATCH_COLOR.eval(x, y, z), -0.014, 0.01); // borda suave (> 1 célula)
      const onStache = 1 - smoothstep(beardParts.stache.eval(x, y, z), 0.002, 0.014);
      out.copy(hairC).lerp(skinC, inPatch * (1 - onStache));
    },
  });
  const beard = new THREE.Mesh(beardGeo, mats.beardVC);
  beard.name = 'beardMesh';
  g.add(beard);

  // sobrancelhas: uma malha por lado, com pivô na extremidade interna (para arquear na fala)
  const brows = [1, -1].map((sx) => {
    const geo = polygonize(browField(sx), { min: sx > 0 ? [0.04, 0.5, 0.2] : [-0.27, 0.5, 0.2], max: sx > 0 ? [0.27, 0.64, 0.42] : [-0.04, 0.64, 0.42], cell: 0.003 }); // normais pelo gradiente do SDF: superfície lisa
    const pivot = new THREE.Vector3(sx * 0.09, 0.57, 0.36);
    geo.translate(-pivot.x, -pivot.y, -pivot.z);
    const m = new THREE.Mesh(geo, mats.hair);
    m.position.copy(pivot);
    m.name = sx > 0 ? 'browL' : 'browR';
    m.userData.side = sx;
    g.add(m);
    return m;
  });

  const mouthMeshes = buildMouth(mats, beardParts.base);
  mouthMeshes.forEach((m) => g.add(m));

  // olhos pequenos, pretos e brilhantes
  const eyes = [];
  for (const sx of [-1, 1]) {
    const x = sx * 0.152, y = 0.465;
    const dx = x / 0.355, dy = (y - 0.46) / 0.36;
    const z = 0.02 + 0.35 * Math.sqrt(1 - dx * dx - dy * dy) - 0.006;
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.lookAt(new THREE.Vector3(x * 2.0, y, 2));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), mats.eye);
    eye.scale.set(0.03, 0.041, 0.018);
    pivot.add(eye);
    const spec = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mats.white);
    spec.scale.set(0.008, 0.008, 0.004);
    spec.position.set(0.01 * sx, 0.015, 0.016);
    pivot.add(spec);
    pivot.name = sx > 0 ? 'eyeL' : 'eyeR';
    g.add(pivot);
    eyes.push(pivot);
  }

  headBone.add(g);
  return { eyes, mouthMeshes, brows };
}

// ================= CORPO (coordenadas do personagem) =================
function torsoField() {
  // camisa polo em forma de barril/pera (model sheet): ombros caídos e estreitos, alargando até a
  // barriga, que avança à frente do peito no perfil. Barra reta com borda arredondada.
  let t = union([
    ellipsoid([0, 0.62, 0.025], [0.325, 0.22, 0.29]),
    ellipsoid([0, 0.53, 0.015], [0.32, 0.1, 0.28]), // barra reta e larga
    ellipsoid([0, 0.78, 0.0], [0.3, 0.2, 0.24]), // peito/costas menos profundos (sem saliência)
    // linha dos ombros: um único bastão arredondado de ombro a ombro → topo liso, sem deltoides marcados
    roundCone([-0.26, 0.9, -0.01], [0.26, 0.9, -0.01], 0.105),
    // base do pescoço: a camiseta sobe em volta do pescoço (nuca coberta nas costas)
    ellipsoid([0, 0.955, -0.03], [0.19, 0.075, 0.16]),
  ], 0.13);
  t = custom(t, (d, x, y) => smaxSoft(d, 0.49 - y, 0.035));
  return t;
}



// manga curta afinada com borda extra na ponta simulando manga dobrada (model sheet)
function sleeveLocal() {
  // manga lisa de uma peça: abre levemente até a ponta, borda arredondada (sem degrau/sino)
  const sl = roundCone([0, 0.0, 0], [0, -0.17, 0], 0.07, 0.084);
  return custom(sl, (d, x, y) => smaxSoft(d, -0.16 - y, 0.022));
}

function pelvisField() { return ellipsoid([0, 0.5, -0.005], [0.29, 0.125, 0.245]); }
function legField(sx) {
  const x = sx * 0.16;
  return union([
    roundCone([x, 0.47, 0], [x, 0.22, 0.005], 0.128, 0.12),
    torus([x, 0.2, 0.005], 0.11, 0.024),
  ], 0.02);
}

// antebraço + mão (espaço local do cotovelo). inward = direção da palma (para o corpo).
// Dedos são formas próprias, encostadas e fundidas com raio pequeno: a separação aparece
// como vales suaves (toy de vinil), não como cortes.
function handLocal(sx) {
  const inward = -sx;
    const palm = ellipsoid([inward * 0.004, -0.262, 0.0], [0.046, 0.068, 0.064]);
  // dedos curtos e roliços, cada um uma peça contínua (sem relevo de falanges):
  // nascem de dentro da palma e afinam suavemente até a ponta arredondada
  const fingers = [];
  const zs = [0.0435, 0.0145, -0.0145, -0.0435];
  const lens = [0.046, 0.054, 0.051, 0.042];
  zs.forEach((z, i) => {
    const base = [inward * 0.004, -0.285, z];
    const tip = [inward * 0.016, -0.305 - lens[i], z * 1.03];
    fingers.push(roundCone(base, tip, 0.0232, 0.0212));
  });
  // polegar destacado: nasce na lateral da palma e se afasta para frente/baixo, com vão até os dedos
  const thumb = union([
    roundCone([inward * 0.018, -0.228, 0.042], [inward * 0.026, -0.258, 0.068], 0.025, 0.024),
    roundCone([inward * 0.026, -0.258, 0.068], [inward * 0.032, -0.286, 0.082], 0.024, 0.022),
  ], 0.008);
  const hand = union([union([palm, union(fingers, 0.0015)], 0.02), thumb], 0.01); // vales nítidos entre os dedos
  // mão ~15% maior, escalada a partir do punho (y = −0.2)
  const S = 1.15;
  const scaled = custom(hand, () => 0);
  scaled.eval = (x, y, z) => hand.eval(x / S, (y + 0.2) / S - 0.2, z / S) * S;
  scaled.cy = (hand.cy + 0.2) * S - 0.2; scaled.br = hand.br * S;
  // mão sobe 0.09 junto com o antebraço mais curto
  const up = custom(scaled, () => 0);
  up.eval = (x, y, z) => scaled.eval(x, y - 0.09, z);
  up.cy = scaled.cy + 0.09;
  return up;
}

// tubo de raio variável ao longo de uma polilinha (pontos no mundo): braço contínuo,
// sem esferas nas juntas → nada de calombo no cotovelo. radius(u), u ∈ [0,1] no comprimento total.
function tube(pts, radius, k = 0.015) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...ab);
    segs.push({ a, ab, len, s0: total });
    total += len;
  }
  const segNode = (sg) => {
    const c = [sg.a[0] + sg.ab[0] / 2, sg.a[1] + sg.ab[1] / 2, sg.a[2] + sg.ab[2] / 2];
    return {
      cx: c[0], cy: c[1], cz: c[2], br: sg.len / 2 + 0.08,
      lb(x, y, z) { return Math.hypot(x - this.cx, y - this.cy, z - this.cz) - this.br; },
      eval(x, y, z) {
        const px = x - sg.a[0], py = y - sg.a[1], pz = z - sg.a[2];
        const t = Math.min(1, Math.max(0, (px * sg.ab[0] + py * sg.ab[1] + pz * sg.ab[2]) / (sg.len * sg.len)));
        return Math.hypot(px - sg.ab[0] * t, py - sg.ab[1] * t, pz - sg.ab[2] * t) - radius((sg.s0 + t * sg.len) / total);
      },
    };
  };
  const nodes = segs.map(segNode);
  return { nodes, all: union(nodes, k) };
}

function shoeField() {
  let upper = union([
    ellipsoid([0, 0.095, 0.03], [0.135, 0.085, 0.19]),
    ellipsoid([0, 0.078, 0.12], [0.125, 0.07, 0.115]),
    torus([0, 0.16, -0.02], 0.098, 0.03),
    ellipsoid([0, 0.15, 0.06], [0.075, 0.035, 0.08], [-0.4, 0, 0]),
  ], 0.04);
  upper = custom(upper, (d, x, y) => Math.max(d, 0.035 - y));
  // sola acompanhando o contorno do cabedal
  const sole = intersect(
    union([ellipsoid([0, 0.04, 0.025], [0.138, 0.07, 0.2]), ellipsoid([0, 0.04, 0.12], [0.128, 0.07, 0.118])], 0.04),
    roundBox([0, 0.025, 0.04], [0.3, 0.022, 0.4], 0.0));
  return { upper, sole };
}

// ================= FÁBRICA =================
export function createCharacterModel() {
  const mats = {
    skin: vinyl(PALETTE.skin),
    skinVC: vinyl(0xffffff, { vertexColors: true }),
    hair: vinyl(PALETTE.hair, { roughness: 0.78, clearcoat: 0.05 }),
    beardVC: vinyl(0xffffff, { roughness: 0.75, clearcoat: 0.08, vertexColors: true }),
    shirt: vinyl(PALETTE.shirt, { roughness: 0.72, clearcoat: 0.08 }),
    star: vinyl(PALETTE.star),
    pants: vinyl(PALETTE.pants, { roughness: 0.68 }),
    shoe: vinyl(PALETTE.shoe, { roughness: 0.6 }),
    sole: vinyl(PALETTE.sole),
    eye: vinyl(PALETTE.eye, { roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
    white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    mouth: vinyl(PALETTE.mouth, { roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    tongue: vinyl(PALETTE.tongue, { roughness: 0.85, clearcoat: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    lip: vinyl(PALETTE.lip),
    teeth: vinyl(0xf7f4ee, { roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };

  const root = new THREE.Group();
  root.name = 'Personagem';
  const { bones, list, index } = buildSkeleton();
  root.add(bones.hips);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);

  // ---- camisa (SkinnedMesh: tronco → spine, mangas → ombros) ----
  const torso = torsoField();
  const slL = transform(sleeveLocal(), boneMatrix(bones, 'shoulderL'));
  const slR = transform(sleeveLocal(), boneMatrix(bones, 'shoulderR'));
  // junção firme manga/tronco + vinco na cava (onde os dois campos se igualam):
  // a manga aparece como peça costurada, não fundida ao corpo
  // união levemente suave + vinco de perfil gaussiano (sem quinas vivas → sem serrilhado)
  const SEAM_W = 0.03, SEAM_DEPTH = 0.0025, SEAM_K = 0.075;
  const shirtField = custom(torso, (dT, x, y, z) => {
    const dS = smin(slL.eval(x, y, z), slR.eval(x, y, z), 0);
    const u = (dT - dS) / SEAM_W;
    // parte de baixo da manga (junto ao tronco) mais destacada; topo do ombro continua suave
    const top = smoothstep(y, 0.8, 0.94);
    const k = 0.012 + (SEAM_K - 0.012) * top;
    const depth = 0.008 + (SEAM_DEPTH - 0.008) * top;
    return smin(dT, dS, k) + depth * Math.exp(-u * u);
  });
  const shirtGeo = polygonize(shirtField, {
    min: [-0.58, 0.44, -0.38], max: [0.58, 1.1, 0.4], cell: 0.0075, smooth: 6,
    weights: softWeights([[index.spine, torso], [index.shoulderL, slL], [index.shoulderR, slR]], 0.012),
  });
  const shirt = new THREE.SkinnedMesh(shirtGeo, mats.shirt);
  shirt.name = 'shirtMesh';
  root.add(shirt);
  shirt.bind(skeleton);

  // estrela no peito esquerdo, apoiada na superfície do tronco
  {
    const sx = 0, sy = 0.79; // centro do peito, entre as pontas da gola
    const z = surfaceZ(torso, sx, sy, 0.5, 0);
    const e = 0.002;
    const n = new THREE.Vector3(
      torso.eval(sx + e, sy, z) - torso.eval(sx - e, sy, z),
      torso.eval(sx, sy + e, z) - torso.eval(sx, sy - e, z),
      torso.eval(sx, sy, z + e) - torso.eval(sx, sy, z - e)).normalize();
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.056 : 0.025;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.004, bevelSegments: 2 });
    const star = new THREE.Mesh(geo, mats.star);
    star.name = 'star';
    star.position.set(sx, sy - 0.52, z - 0.004);
    star.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    bones.spine.add(star);
  }

  // ---- calça (SkinnedMesh: pélvis → hips, pernas → legs) ----
  const pelvis = pelvisField(), lgL = legField(1), lgR = legField(-1);
  const pantsGeo = polygonize(union([pelvis, lgL, lgR], 0.05), {
    min: [-0.36, 0.14, -0.3], max: [0.36, 0.66, 0.3], cell: 0.009,
    weights: softWeights([[index.hips, pelvis], [index.legL, lgL], [index.legR, lgR]], 0.02),
  });
  const pants = new THREE.SkinnedMesh(pantsGeo, mats.pants);
  pants.name = 'pantsMesh';
  root.add(pants);
  pants.bind(skeleton);

  // ---- braços + mãos: uma malha só por braço (SkinnedMesh ombro → cotovelo), sem emenda no cotovelo ----
  for (const sx of [1, -1]) {
    const sh = sx > 0 ? 'shoulderL' : 'shoulderR', el = sx > 0 ? 'elbowL' : 'elbowR';
    const mS = boneMatrix(bones, sh), mE = boneMatrix(bones, el);
    const at = (m, p) => new THREE.Vector3(...p).applyMatrix4(m).toArray();
    // ombro → cotovelo → punho (dentro da palma): quase cilíndrico, afinando de leve,
    // com um volume discreto no antebraço
    const { nodes: [segU, segF], all: tubeArm } = tube(
      [at(mS, [0, -0.08, 0]), at(mS, [0, -0.25, 0]), at(mE, [0, -0.15, 0])],
      (u) => 0.066 - 0.017 * Math.pow(u, 1.4) + 0.0025 * Math.exp(-(((u - 0.68) / 0.14) ** 2)));
    const hand = transform(handLocal(sx), mE);
    const upper = segU, fore = union([segF, hand], 0.02);
    const arm = union([tubeArm, hand], 0.02);
    const x0 = sx > 0 ? 0.2 : -0.75, x1 = sx > 0 ? 0.75 : -0.2;
    const geo = polygonize(arm, {
      min: [x0, 0.25, -0.2], max: [x1, 1.3, 0.25], cell: 0.0032, smooth: 8,
      weights: softWeights([[index[sh], upper], [index[el], fore]], 0.06),
    });
    const m = new THREE.SkinnedMesh(geo, mats.skin);
    m.name = sx > 0 ? 'armMeshL' : 'armMeshR';
    root.add(m);
    m.bind(skeleton);
  }

  // ---- tênis (rígidos nos pés; tornozelo em y = 0.16) ----
  for (const sx of [1, -1]) {
    const bone = bones[sx > 0 ? 'footL' : 'footR'];
    const { upper, sole } = shoeField();
    const box = { min: [-0.18, -0.01, -0.22], max: [0.18, 0.22, 0.3], cell: 0.0065 };
    for (const [field, mat, n] of [[upper, mats.shoe, 'shoeUpper'], [sole, mats.sole, 'shoeSole']]) {
      const g = polygonize(field, box);
      g.translate(0, -0.16, 0.04);
      const m = new THREE.Mesh(g, mat);
      m.name = n + (sx > 0 ? 'L' : 'R');
      bone.add(m);
    }
  }

  const { eyes, mouthMeshes, brows } = buildHead(mats, bones.head);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // pele dos braços: sem auto-sombra (evita a linha de sombra nas junções cotovelo/punho)
  root.traverse((o) => { if (/^(upperArm|armMesh)/.test(o.name)) o.receiveShadow = false; });
  root.userData.bones = bones;
  root.userData.skeleton = skeleton;
  root.userData.eyes = eyes;
  root.userData.mouthMeshes = mouthMeshes;
  root.userData.brows = brows;
  return root;
}
