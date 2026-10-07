// Squid: the first procedural character (vinyl toy style), rebuilt from the model sheet.
// Convention: Y up, front along +Z, character's left along +X. Ground at y = 0.
// Unit: total height ≈ 2.0 — the head takes ~half of it.
// Organic surfaces (skin, hair, beard, clothes, hands, sneakers) are SDF fields with
// smooth union, polygonized with Surface Nets. Shirt and pants are SkinnedMeshes.
import * as THREE from 'three';
import { HUMANOID_BONES, type BoneName, type Bones, type Rig } from '../rig/rig';
import { ellipsoid, roundCone, torus, roundBox, union, subtract, intersect, custom, transform, polygonize, surfaceZ, field, type Node, type Rotation } from '../sdf';
import { defineCharacter, parseColor, type ColorValue } from './registry';

const smoothstep = THREE.MathUtils.smoothstep;
function smaxSoft(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/** Colors of every part; a variation overrides some of them. */
export const BASE_PALETTE = {
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
export type Palette = { [K in keyof typeof BASE_PALETTE]: number };

function vinyl(color: THREE.ColorRepresentation, opts: THREE.MeshPhysicalMaterialParameters = {}) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.55, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.5, ...opts,
  });
}

// ---------- skeleton (bind pose: local position + local rotation of each bone) ----------
// Shoulders start spread (rot Z) so the arms stay away from the body.
const ARM_SPREAD = 0.34;     // arm slightly spread from the shoulder
// knuckle joint (elbow-local): the fingers bend together around it (closed fist)
const FINGER_PIVOT_Y = -0.222;
// bend axis near the palm face: the fingers close over the palm without entering the wrist
const FINGER_PIVOT_IN = 0.042;
// second finger joint (mid-finger), relative to the first: the tip curls in an arc to the palm
const FINGER_TIP_DY = -0.036, FINGER_AXIS_IN = 0.01;
// thumb base (elbow-local; positive x = toward the palm)
const THUMB_PIVOT = [0.023, -0.147, 0.05] as const;
const BONES = [
  ['hips', null, [0, 0.52, 0]],
  ['spine', 'hips', [0, 0, 0]],
  ['head', 'spine', [0, 0.5, 0]],
  ['shoulderL', 'spine', [0.33, 0.41, 0], [0, 0, ARM_SPREAD]],
  ['elbowL', 'shoulderL', [0, -0.25, 0], [-0.38, 0.15, -0.1]], // bind = rest pose (no deformation while idle)
  ['fingersL', 'elbowL', [-FINGER_PIVOT_IN, FINGER_PIVOT_Y, 0]],
  ['fingerTipsL', 'fingersL', [FINGER_PIVOT_IN - FINGER_AXIS_IN, FINGER_TIP_DY, 0]],
  ['thumbL', 'elbowL', [-THUMB_PIVOT[0], THUMB_PIVOT[1], THUMB_PIVOT[2]]],
  ['shoulderR', 'spine', [-0.33, 0.41, 0], [0, 0, -ARM_SPREAD]],
  ['elbowR', 'shoulderR', [0, -0.25, 0], [-0.38, -0.15, 0.1]],
  ['fingersR', 'elbowR', [FINGER_PIVOT_IN, FINGER_PIVOT_Y, 0]],
  ['fingerTipsR', 'fingersR', [FINGER_AXIS_IN - FINGER_PIVOT_IN, FINGER_TIP_DY, 0]],
  ['thumbR', 'elbowR', THUMB_PIVOT],
  ['legL', 'hips', [0.16, -0.02, 0]],
  ['kneeL', 'legL', [0, -0.17, 0]],   // knee halfway down the leg (y ≈ 0.33)
  ['footL', 'kneeL', [0, -0.17, 0]],
  ['legR', 'hips', [-0.16, -0.02, 0]],
  ['kneeR', 'legR', [0, -0.17, 0]],
  ['footR', 'kneeR', [0, -0.17, 0]],
] as const satisfies readonly (readonly [BoneName, BoneName | null, ...unknown[]])[];

type BoneIndex = Record<BoneName, number>;

function buildSkeleton() {
  const bones = {} as Bones;
  for (const def of BONES) {
    const [name, parent, pos] = def;
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(pos[0], pos[1], pos[2]);
    const rot = def.length > 3 ? def[3] : null;
    if (rot) b.rotation.set(rot[0], rot[1], rot[2]);
    bones[name] = b;
    if (parent) bones[parent].add(b);
  }
  const list = BONES.map(([n]) => bones[n]);
  const index = Object.fromEntries(BONES.map(([n], i) => [n, i])) as BoneIndex;
  return { bones, list, index };
}

// world (bind) matrix of a bone — used to bring local fields into character space
const boneMatrix = (bones: Bones, name: BoneName) => bones[name].matrixWorld.clone();

// weights from a "softmin" of the distances to each field group
type WeightFn = (x: number, y: number, z: number) => [number, number][];
function softWeights(groups: [number, Node][], tau: number): WeightFn {
  return (x, y, z) => {
    const ds = groups.map(([, node]) => node.eval(x, y, z));
    const m = Math.min(...ds);
    return groups.map(([bone], i): [number, number] => [bone, Math.exp(-(ds[i] - m) / tau)]);
  };
}

// ================= HEAD (local coordinates of the "head" bone, y=1.02 in world) =================
const NOSE_C = [0, 0.385, 0.415];
const MOUTH_Y = 0.222;               // mouth line (head-local)
// skin area around the mouth: from below the mustache to just under the lower lip
const MOUTH_PATCH = ellipsoid([0, MOUTH_Y - 0.018, 0.418], [0.11, 0.05, 0.045]); // very shallow recess
const MOUTH_PATCH_COLOR = ellipsoid([0, MOUTH_Y - 0.014, 0.37], [0.118, 0.055, 0.09]);

function headSkinField() {
  const parts = [
    ellipsoid([0, 0.46, 0.02], [0.355, 0.36, 0.35]),
    ellipsoid([0.19, 0.35, 0.16], [0.16, 0.13, 0.15]),
    ellipsoid([-0.19, 0.35, 0.16], [0.16, 0.13, 0.15]),
    ellipsoid([0, 0.28, 0.05], [0.29, 0.17, 0.27]),
    roundCone([0, -0.06, -0.03], [0, 0.2, 0], 0.13, 0.15), // neck
  ];
  let skin = union(parts, 0.09);
  // ears with a concha
  for (const sx of [-1, 1]) {
    // ear slightly forward and facing forward (EAR_YAW): visible from the front
    const EAR_YAW = 0.72;
    const rot: Rotation = [0, -sx * EAR_YAW, 0];
    const ec = [sx * 0.385, 0.38, -0.05];
    const n = [sx * Math.cos(EAR_YAW), 0, Math.sin(EAR_YAW)]; // ear face normal
    let ear = ellipsoid(ec, [0.036, 0.09, 0.064], rot);
    ear = subtract(ear, ellipsoid([ec[0] + n[0] * 0.03, 0.374, ec[2] + n[2] * 0.03], [0.016, 0.05, 0.034], rot), 0.018);
    skin = union([skin, ear], 0.03);
  }
  // bulbous nose (same skin, separate per-vertex color)
  skin = union([skin, ellipsoid(NOSE_C, [0.105, 0.095, 0.1])], 0.025);
  return skin;
}

function headSkinColor(PALETTE: Palette) {
  const skin = new THREE.Color(PALETTE.skin), nose = new THREE.Color(PALETTE.nose),
    blush = new THREE.Color(PALETTE.blush), shade = new THREE.Color(PALETTE.skinShade);
  return (x: number, y: number, z: number, out: THREE.Color) => {
    out.copy(skin);
    // cheek blush
    for (const sx of [-1, 1]) {
      const d = Math.hypot(x - sx * 0.235, (y - 0.35) * 1.15, (z - 0.3) * 0.6);
      out.lerp(blush, (1 - smoothstep(d, 0.025, 0.1)) * 0.55);
    }
    // inner ears
    if (Math.abs(x) > 0.36 && y > 0.29 && y < 0.47 && z < 0.03 && z > -0.13) out.lerp(shade, 0.45 * smoothstep(Math.abs(x), 0.37, 0.4));
    // nose
    const dn = Math.hypot((x - NOSE_C[0]) / 0.105, (y - NOSE_C[1]) / 0.095, (z - NOSE_C[2]) / 0.1);
    out.lerp(nose, 1 - smoothstep(dn, 0.92, 1.12));
  };
}

function hairField() {
  const items: Node[] = [];

  // Main skull core (solid base covering all the skin so there are no holes)
  items.push(ellipsoid([0, 0.57, -0.04], [0.335, 0.24, 0.31])); // Main (wraps the head)
  items.push(ellipsoid([0, 0.46, -0.10], [0.30, 0.20, 0.23])); // Lower nape
  items.push(ellipsoid([0, 0.66, 0.02], [0.26, 0.15, 0.24])); // Top (narrower: lower upper corners)

  const addTuft = (x: number, y: number, z: number, rx: number, ry = rx, rz = rx, rot: Rotation = null) => {
    items.push(ellipsoid([x, y, z], [rx, ry, rz], rot));
  };

  // 1. Hairline (delicate central tuft + subtler sides next to the receding temples)
  // rounded central tip (soft U) to match the receding temples
  addTuft(0, 0.722, 0.188, 0.118, 0.09, 0.095, [-0.2, 0, 0]);
  // lobe at the tip: U-shaped lower edge of the tuft (no flat stretch)
  addTuft(0, 0.698, 0.245, 0.068, 0.058, 0.052, [-0.35, 0, 0]);
  for (const sx of [-1, 1]) {
    // slightly wider temple sides for a better connection;
    // lower, subtler upper forehead corners
    addTuft(sx * 0.25, 0.63, 0.06, 0.08, 0.058, 0.09, [-0.2, sx * -0.3, 0]);
  }

  // 2. Compact top (one smooth continuous piece, avoiding lumps and holes)
  addTuft(0, 0.77, 0.02, 0.18, 0.08, 0.16);
  addTuft(0, 0.75, -0.09, 0.16, 0.08, 0.14);

  // 3. Fluffy continuous sides (wrapping the head and ears)
  for (const sx of [-1, 1]) {
    addTuft(sx * 0.29, 0.55, 0.0, 0.09, 0.075, 0.10);
    addTuft(sx * 0.29, 0.48, -0.06, 0.09, 0.08, 0.10);
    addTuft(sx * 0.25, 0.40, -0.12, 0.085, 0.075, 0.095);
  }

  // 4. Back and nape (smooth continuous cloud mass, not sticking out too far back)
  addTuft(-0.12, 0.64, -0.17, 0.115, 0.08, 0.10);
  addTuft(0, 0.66, -0.18, 0.13, 0.085, 0.10);
  addTuft(0.12, 0.64, -0.17, 0.115, 0.08, 0.10);

  addTuft(-0.14, 0.52, -0.22, 0.12, 0.085, 0.10);
  addTuft(0, 0.53, -0.23, 0.13, 0.085, 0.10);
  addTuft(0.14, 0.52, -0.22, 0.12, 0.085, 0.10);

  // Nape: one smooth mass ending a bit below the ears with a rounded edge
  addTuft(0, 0.36, -0.165, 0.255, 0.125, 0.165);
  addTuft(0, 0.46, -0.19, 0.265, 0.11, 0.15); // smooth bridge between the nape and the upper tufts (no groove)

  // Smooth union k = 0.060 fully fuses into one soft continuous surface
  let hair = union(items, 0.060);

  // Light, clean receding temples
  const templeCutouts = union([
    ellipsoid([-0.178, 0.742, 0.16], [0.056, 0.072, 0.065]),
    ellipsoid([0.178, 0.742, 0.16], [0.056, 0.072, 0.065]),
  ], 0.02);

  hair = subtract(hair, templeCutouts, 0.075); // wide blend: fully rounded tuft outline, no corners

  return hair;
}

// `withHair`: the sideburns run up to the hairline; without hair they stop at the ear
function beardField(withHair = true) {
  const items: Node[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const a = (t - 0.5) * Math.PI * 0.92;
    const x = Math.sin(a) * 0.29, y = 0.12 + (1 - Math.cos(a)) * 0.18, z = 0.04 + Math.cos(a) * 0.23;
    const taper = 1 - 0.35 * Math.abs(t - 0.5) * 2; // thinner tips: they don't run into the ear
    items.push(ellipsoid([x, y, z], [0.12, 0.125, 0.11 * taper]));
  }
  items.push(ellipsoid([0, 0.12, 0.17], [0.21, 0.15, 0.18]));
  // slightly defined chin: the beard narrows downward and ends in a soft point
  items.push(ellipsoid([0, 0.02, 0.19], [0.1, 0.075, 0.1]));
  for (const sx of [-1, 1]) {
    items.push(ellipsoid([sx * 0.15, 0.225, 0.255], [0.11, 0.09, 0.09]));
    // sideburn running in front of the ear up to the hair
    items.push(withHair
      ? roundCone([sx * 0.3, 0.29, 0.085], [sx * 0.31, 0.565, 0.025], 0.065, 0.05) // rises until it tucks under the hair
      : roundCone([sx * 0.3, 0.29, 0.085], [sx * 0.31, 0.43, 0.05], 0.065, 0.052));
  }
  let beard = union(items, 0.07);
  // mustache: two drooping lobes + a bridge under the nose
  const stache = union([
    ellipsoid([0.085, 0.288, 0.37], [0.115, 0.052, 0.068], [0, 0.35, -0.32]),
    ellipsoid([-0.085, 0.288, 0.37], [0.115, 0.052, 0.068], [0, -0.35, 0.32]),
    ellipsoid([0, 0.3, 0.385], [0.05, 0.04, 0.05]),
  ], 0.03);
  // skin area around the mouth (model sheet): shallow recess in the beard, painted skin color;
  // fills the strip between the mustache and the mouth (no hole behind the mustache)
  beard = union([beard, ellipsoid([0, MOUTH_Y + 0.022, 0.335], [0.1, 0.035, 0.04])], 0.03);
  beard = subtract(beard, MOUTH_PATCH, 0.02);
  return { field: union([beard, stache], 0.018), stache, base: beard };
}

// eyebrow for one side (sx = +1 character's left, −1 right)
function browField(sx: number) {
  // smooth continuous tube: many short segments with a smoothly varying radius (no steps/wrinkles)
  const N = 24;
  const pts: number[][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = sx * (0.09 + 0.13 * t);
    const y = 0.57 + 0.024 * Math.sin(Math.PI * t * 0.9) - 0.026 * t;
    // rests on the approximate skull surface
    const dx = x / 0.36, dy = (y - 0.46) / 0.36;
    const z = 0.02 + 0.35 * Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)) + 0.01;
    pts.push([x, y, z]);
  }
  const radius = (t: number) => 0.024 - 0.006 * t * t; // tapers smoothly toward the outer tip
  const items: Node[] = [];
  for (let i = 0; i < N; i++) items.push(roundCone(pts[i], pts[i + 1], radius(i / N), radius((i + 1) / N)));
  return union(items, 0.006);
}

// ---------- mouth (no lips, as in the model sheet) ----------
// An opening drawn on the skin under the mustache. All shapes share the same topology:
// base = neutral (thin smile line), morph 0 = smile (open D with teeth), morph 1 = talk (open oval),
// morph 2 = sad (short line with drooping corners), morph 3 = "O" (😯).
interface MouthShape { w: number; lift: number; raise: number; depth: number; teeth: number; tongue: number }
type MouthPart = 'interior' | 'teeth' | 'tongue';
const MOUTH_SHAPES: Record<string, MouthShape> = {
  // raise: the middle of the upper edge goes UP a little (the upper lip doesn't drop with the jaw)
  neutral: { w: 0.15, lift: 0.012, raise: 0, depth: 0.007, teeth: 0, tongue: 0 },
  smile: { w: 0.178, lift: 0.01, raise: 0.006, depth: 0.05, teeth: 0.34, tongue: 0.18 }, // nearly straight upper edge: "D"-shaped opening
  open: { w: 0.14, lift: 0.012, raise: 0.006, depth: 0.09, teeth: 0.2, tongue: 0.32 },
  sad: { w: 0.13, lift: -0.02, raise: 0.003, depth: 0.008, teeth: 0, tongue: 0 },
  // surprise "O" (😯): small round opening, arched upper edge
  o: { w: 0.075, lift: 0, raise: 0.014, depth: 0.05, teeth: 0, tongue: 0.12 },
};
function buildMouth(mats: Materials, surfaceField: Node) {
  const NU = 28, NV = 8;
  // v: position across the opening (0 = upper edge, 1 = lower edge)
  const layer = (shape: MouthShape, part: MouthPart) => {
    const pos: number[] = [];
    for (let j = 0; j <= NV; j++) {
      for (let i = 0; i <= NU; i++) {
        const t = (i / NU) * 2 - 1;
        const x = t * shape.w / 2;
        const yTop = MOUTH_Y + 0.004 + shape.lift * t * t + shape.raise * (1 - t * t);
        const depth = shape.depth * Math.pow(Math.max(0, 1 - t * t), 0.7);
        let v = j / NV;
        if (part === 'teeth') v *= shape.teeth;
        if (part === 'tongue') v = 0.92 - shape.tongue + v * shape.tongue; // doesn't touch the edge
        const y = yTop - depth * v;
        const lift = part === 'interior' ? 0.0015 : 0.0025; // layers on top of the dark interior
        pos.push(x, y, surfaceZ(surfaceField, x, y, 0.6, 0.15) + lift);
      }
    }
    return new Float32Array(pos);
  };
  const index: number[] = [];
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  const make = (part: MouthPart, mat: THREE.Material) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(layer(MOUTH_SHAPES.neutral, part), 3));
    geo.setIndex(index);
    geo.morphAttributes.position = [
      new THREE.BufferAttribute(layer(MOUTH_SHAPES.smile, part), 3),
      new THREE.BufferAttribute(layer(MOUTH_SHAPES.open, part), 3),
      new THREE.BufferAttribute(layer(MOUTH_SHAPES.sad, part), 3),
      new THREE.BufferAttribute(layer(MOUTH_SHAPES.o, part), 3),
    ];
    // normals from the open shape: in neutral, teeth/tongue are collapsed (zero area → null normals)
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

// beard + mustache (one mesh): hair color with a skin-colored patch around the mouth
function buildBeard(mats: Materials, beardParts: ReturnType<typeof beardField>, PALETTE: Palette) {
  const hairC = new THREE.Color(PALETTE.hair), skinC = new THREE.Color(PALETTE.skin);
  const beardGeo = polygonize(beardParts.field, {
    min: [-0.46, -0.08, -0.15], max: [0.46, 0.6, 0.5], cell: 0.0075,
    color: (x, y, z, out) => {
      // skin inside the mouth area, except where the mustache covers it
      const inPatch = 1 - smoothstep(MOUTH_PATCH_COLOR.eval(x, y, z), -0.014, 0.01); // soft edge (> 1 cell)
      const onStache = 1 - smoothstep(beardParts.stache.eval(x, y, z), 0.002, 0.014);
      out.copy(hairC).lerp(skinC, inPatch * (1 - onStache));
    },
  });
  const beard = new THREE.Mesh(beardGeo, mats.beardVC);
  beard.name = 'beardMesh';
  return beard;
}

function buildHead(mats: Materials, headBone: THREE.Bone, PALETTE: Palette, parts: SquidParts) {
  const g = new THREE.Group();
  g.name = 'headGeo';

  const skinGeo = polygonize(headSkinField(), { min: [-0.48, -0.08, -0.4], max: [0.48, 0.84, 0.55], cell: 0.0095, color: headSkinColor(PALETTE) });
  const skin = new THREE.Mesh(skinGeo, mats.skinVC);
  skin.name = 'headSkin';
  g.add(skin);

  if (parts.hair === 'classic') {
    const hair = new THREE.Mesh(polygonize(hairField(), { min: [-0.5, -0.02, -0.56], max: [0.5, 1.02, 0.4], cell: 0.011 }), mats.hair);
    hair.name = 'hairMesh';
    g.add(hair);
  }

  // facial hair; the mouth is drawn on whatever surface surrounds it
  const beardParts = beardField(parts.hair !== 'bald');
  let mouthSurface: Node = headSkinField();
  if (parts.facialHair === 'beard') {
    g.add(buildBeard(mats, beardParts, PALETTE));
    mouthSurface = beardParts.base;
  } else if (parts.facialHair === 'mustache') {
    const stache = new THREE.Mesh(polygonize(beardParts.stache, { min: [-0.24, 0.2, 0.26], max: [0.24, 0.38, 0.48], cell: 0.0075 }), mats.hair);
    stache.name = 'mustacheMesh';
    g.add(stache);
  }

  // eyebrows: one mesh per side, pivoting at the inner end (to arch while talking)
  const brows = [1, -1].map((sx) => {
    const geo = polygonize(browField(sx), { min: sx > 0 ? [0.04, 0.5, 0.2] : [-0.27, 0.5, 0.2], max: sx > 0 ? [0.27, 0.64, 0.42] : [-0.04, 0.64, 0.42], cell: 0.003 }); // normals from the SDF gradient: smooth surface
    const pivot = new THREE.Vector3(sx * 0.09, 0.57, 0.36);
    geo.translate(-pivot.x, -pivot.y, -pivot.z);
    const m = new THREE.Mesh(geo, mats.hair);
    m.position.copy(pivot);
    m.name = sx > 0 ? 'browL' : 'browR';
    m.userData.side = sx;
    g.add(m);
    return m;
  });

  const mouthMeshes = buildMouth(mats, mouthSurface);
  mouthMeshes.forEach((m) => g.add(m));

  // small, black, glossy eyes
  const eyes: THREE.Group[] = [];
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

// ================= BODY (character coordinates) =================
function torsoField() {
  // barrel/pear-shaped shirt (model sheet): narrow sloping shoulders widening down to the
  // belly, which sticks out past the chest in profile. Straight hem with a rounded edge.
  let t = union([
    ellipsoid([0, 0.62, 0.025], [0.325, 0.22, 0.29]),
    ellipsoid([0, 0.53, 0.015], [0.32, 0.1, 0.28]), // straight, wide hem
    ellipsoid([0, 0.78, 0.0], [0.3, 0.2, 0.24]), // shallower chest/back (no bulge)
    // shoulder line: a single rounded bar from shoulder to shoulder → smooth top, no visible deltoids
    roundCone([-0.26, 0.9, -0.01], [0.26, 0.9, -0.01], 0.105),
    // neck base: the shirt rises around the neck (nape covered at the back)
    ellipsoid([0, 0.955, -0.03], [0.19, 0.075, 0.16]),
  ], 0.13);
  t = custom(t, (d, x, y) => smaxSoft(d, 0.49 - y, 0.035));
  return t;
}



// short sleeve (model sheet)
function sleeveLocal() {
  // smooth one-piece sleeve: flares slightly toward the end, rounded edge (no step/bell)
  const sl = roundCone([0, 0.0, 0], [0, -0.17, 0], 0.07, 0.084);
  return custom(sl, (d, x, y) => smaxSoft(d, -0.16 - y, 0.022));
}

function pelvisField() { return ellipsoid([0, 0.5, -0.005], [0.29, 0.125, 0.245]); }
function legField(sx: number) {
  const x = sx * 0.16;
  return union([
    roundCone([x, 0.47, 0], [x, 0.22, 0.005], 0.128, 0.12),
    torus([x, 0.2, 0.005], 0.11, 0.024),
  ], 0.02);
}

// forearm + hand (elbow-local space). inward = palm direction (toward the body).
// Fingers are their own shapes, touching and fused with a small radius: the separation shows
// as soft valleys (vinyl toy), not cuts.
function handLocal(sx: number) {
  const inward = -sx;
    const palm = ellipsoid([inward * 0.004, -0.262, 0.0], [0.046, 0.068, 0.064]);
  // short chubby fingers, each one continuous piece (no knuckle relief):
  // they grow from inside the palm and taper smoothly to a rounded tip
  const fingers: Node[] = [];
  const zs = [0.0435, 0.0145, -0.0145, -0.0435];
  const lens = [0.046, 0.054, 0.051, 0.042];
  zs.forEach((z, i) => {
    const base = [inward * 0.004, -0.285, z];
    const tip = [inward * 0.016, -0.305 - lens[i], z * 1.03];
    fingers.push(roundCone(base, tip, 0.0232, 0.0212));
  });
  // thumb: separate rigid piece (its own mesh attached to the thumb bone), short and chubby like the
  // other fingers; its base sinks into the palm to hide the joint when it rotates
  const thumb = roundCone([inward * 0.014, -0.226, 0.038], [inward * 0.029, -0.27, 0.072], 0.0245, 0.0225);
  const fingersU = union(fingers, 0.0015);
  const hand = union([palm, fingersU], 0.02); // crisp valleys between the fingers
  // hand ~15% larger, scaled from the wrist (y = −0.2), and raised 0.09 along with the shorter forearm
  const S = 1.15, LIFT = 0.09;
  const place = (n: Node) => {
    const o = custom(n, () => 0);
    o.eval = (x, y, z) => n.eval(x / S, (y - LIFT + 0.2) / S - 0.2, z / S) * S;
    o.cy = (n.cy + 0.2) * S - 0.2 + LIFT; o.br = n.br * S;
    return o;
  };
  // weight-only fields: fingers (the part leaving the palm, below the knuckle) × rest of the hand
  const TIP_Y = FINGER_PIVOT_Y + FINGER_TIP_DY;
  const fingerW = custom(place(fingersU), (d, x, y) => Math.max(d, y - FINGER_PIVOT_Y, TIP_Y - y));
  const fingerTipW = custom(place(fingersU), (d, x, y) => Math.max(d, y - TIP_Y));
  return { hand: place(hand), fingerW, fingerTipW, thumb: place(thumb), palmW: place(palm) };
}


// variable-radius tube along a polyline (world points): a continuous arm,
// no spheres at the joints → no elbow bump. radius(u), u ∈ [0,1] over the total length.
interface TubeSegment { a: number[]; ab: number[]; len: number; s0: number }
function tube(pts: number[][], radius: (u: number) => number, k = 0.015) {
  const segs: TubeSegment[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...ab);
    segs.push({ a, ab, len, s0: total });
    total += len;
  }
  const segNode = (sg: TubeSegment) => {
    const c = [sg.a[0] + sg.ab[0] / 2, sg.a[1] + sg.ab[1] / 2, sg.a[2] + sg.ab[2] / 2];
    return field(c, sg.len / 2 + 0.08, (x, y, z) => {
      const px = x - sg.a[0], py = y - sg.a[1], pz = z - sg.a[2];
      const t = Math.min(1, Math.max(0, (px * sg.ab[0] + py * sg.ab[1] + pz * sg.ab[2]) / (sg.len * sg.len)));
      return Math.hypot(px - sg.ab[0] * t, py - sg.ab[1] * t, pz - sg.ab[2] * t) - radius((sg.s0 + t * sg.len) / total);
    });
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
  // sole following the outline of the upper
  const sole = intersect(
    union([ellipsoid([0, 0.04, 0.025], [0.138, 0.07, 0.2]), ellipsoid([0, 0.04, 0.12], [0.128, 0.07, 0.118])], 0.04),
    roundBox([0, 0.025, 0.04], [0.3, 0.022, 0.4], 0.0));
  return { upper, sole };
}

// ================= FACTORY =================
function createMaterials(PALETTE: Palette) {
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
  for (const [key, m] of Object.entries(mats)) m.name = key; // meshes refer to materials by key
  return mats;
}
type MaterialKey = keyof ReturnType<typeof createMaterials>;
type Materials = Record<MaterialKey, THREE.Material>;
const MATERIAL_KEYS = Object.keys(createMaterials(BASE_PALETTE)) as MaterialKey[];

/** Interchangeable parts, one option per slot. */
export interface SquidParts {
  hair: 'classic' | 'bald';
  facialHair: 'beard' | 'mustache' | 'none';
  /** chest print */
  decal: 'star' | 'none';
}
export const DEFAULT_PARTS: SquidParts = { hair: 'classic', facialHair: 'beard', decal: 'star' };
/** Every option of every slot (for validation and tools). */
export const PART_OPTIONS: { [K in keyof SquidParts]: SquidParts[K][] } = {
  hair: ['classic', 'bald'],
  facialHair: ['beard', 'mustache', 'none'],
  decal: ['star', 'none'],
};

export interface SquidOptions {
  /** Color overrides: '#rrggbb' strings or hex numbers, e.g. { shirt: '#2b6cd6' }. */
  palette?: Partial<Record<keyof Palette, ColorValue>>;
  parts?: Partial<SquidParts>;
}

function resolve({ palette = {}, parts = {} }: SquidOptions) {
  const P = { ...BASE_PALETTE } as Palette;
  for (const [key, value] of Object.entries(palette)) {
    if (!(key in BASE_PALETTE)) throw new Error(`Unknown Squid palette color "${key}" (known: ${Object.keys(BASE_PALETTE).join(', ')})`);
    P[key as keyof Palette] = parseColor(value!);
  }
  const S = { ...DEFAULT_PARTS, ...parts };
  for (const [slot, value] of Object.entries(S)) {
    const options = PART_OPTIONS[slot as keyof SquidParts] as string[] | undefined;
    if (!options) throw new Error(`Unknown Squid part slot "${slot}" (known: ${Object.keys(PART_OPTIONS).join(', ')})`);
    if (!options.includes(value)) throw new Error(`Unknown Squid ${slot} "${value}" (options: ${options.join(', ')})`);
  }
  return { PALETTE: P, parts: S };
}

/** Real materials for these options. */
export function squidMaterials(options: SquidOptions = {}) { return createMaterials(resolve(options).PALETTE); }

/**
 * Builds the model: geometry, skeleton and hierarchy. Pure (no DOM, no GPU), so it can run in
 * a Web Worker or in Node. Meshes carry placeholder materials named after the material keys.
 */
export function buildSquid(options: SquidOptions = {}): THREE.Group {
  const { PALETTE, parts } = resolve(options);
  const mats = Object.fromEntries(MATERIAL_KEYS.map((k) => [k, new THREE.MeshBasicMaterial({ name: k })])) as unknown as Materials;

  const root = new THREE.Group();
  root.name = 'Squid';
  const { bones, list, index } = buildSkeleton();
  root.add(bones.hips);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);

  // ---- shirt: torso (SkinnedMesh → spine); sleeves are separate pieces, built with the arms ----
  // Like an articulated vinyl toy: the sleeve cap is a sphere centered on the shoulder itself,
  // so rotating the arm stretches neither the torso nor the sleeve.
  // The shirt gets a short sleeve "stub" on each shoulder, fused with a wide radius: the torso
  // flares in a smooth curve into the sleeve (no crease). The stub sits inside the sleeve's
  // spherical cap, so it stays hidden when the arm rotates.
  const sleeveStub = custom(roundCone([0, 0, 0], [0, -0.17, 0], 0.066, 0.08), (d, x, y) => smaxSoft(d, -0.06 - y, 0.02));
  const torso = union([torsoField(),
    transform(sleeveStub, boneMatrix(bones, 'shoulderL')),
    transform(sleeveStub, boneMatrix(bones, 'shoulderR'))], 0.06);
  const shirtGeo = polygonize(torso, {
    min: [-0.58, 0.44, -0.38], max: [0.58, 1.1, 0.4], cell: 0.0075, smooth: 6,
    weights: () => [[index.spine, 1]],
  });
  const shirt = new THREE.SkinnedMesh(shirtGeo, mats.shirt);
  shirt.name = 'shirtMesh';
  root.add(shirt);
  shirt.bind(skeleton);


  // star on the chest, resting on the torso surface
  if (parts.decal === 'star') {
    const sx = 0, sy = 0.86; // chest center, at sleeve height
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

  // ---- pants (SkinnedMesh: pelvis → hips, thighs → legs, shins → knees) ----
  const pelvis = pelvisField(), lgL = legField(1), lgR = legField(-1);
  // weight-only fields: thigh above the knee (y 0.33), shin below
  const thigh = (sx: number) => roundCone([sx * 0.16, 0.47, 0], [sx * 0.16, 0.34, 0.003], 0.125);
  const shin = (sx: number) => roundCone([sx * 0.16, 0.32, 0.003], [sx * 0.16, 0.2, 0.005], 0.12);
  const pantsGeo = polygonize(union([pelvis, lgL, lgR], 0.05), {
    min: [-0.36, 0.14, -0.3], max: [0.36, 0.66, 0.3], cell: 0.009,
    weights: (() => {
      const legs = softWeights([[index.legL, thigh(1)], [index.kneeL, shin(1)], [index.legR, thigh(-1)], [index.kneeR, shin(-1)]], 0.03);
      const hipLeg = softWeights([[index.hips, pelvis], [-1, lgL], [-2, lgR]], 0.02);
      // pelvis × leg; the "leg" part is split between thigh and shin
      return (x: number, y: number, z: number): [number, number][] => {
        const hw = hipLeg(x, y, z), lw = legs(x, y, z);
        const sumH = hw.reduce((a, [, w]) => a + w, 0), sumL = lw.reduce((a, [, w]) => a + w, 0);
        const wh = hw[0][1] / sumH, wl = 1 - wh;
        return [[index.hips, wh], ...lw.map(([b, w]): [number, number] => [b, (wl * w) / sumL])];
      };
    })(),
  });
  const pants = new THREE.SkinnedMesh(pantsGeo, mats.pants);
  pants.name = 'pantsMesh';
  root.add(pants);
  pants.bind(skeleton);

  // ---- arms + hands: one mesh per arm (SkinnedMesh shoulder → elbow), no seam at the elbow ----
  for (const sx of [1, -1]) {
    const sh = sx > 0 ? 'shoulderL' : 'shoulderR', el = sx > 0 ? 'elbowL' : 'elbowR';
    const mS = boneMatrix(bones, sh), mE = boneMatrix(bones, el);
    const at = (m: THREE.Matrix4, p: number[]) => new THREE.Vector3(...p).applyMatrix4(m).toArray();
    // shoulder → elbow → wrist (inside the palm): nearly cylindrical, tapering slightly,
    // with a subtle forearm volume
    const { nodes: [, segF], all: tubeArm } = tube(
      [at(mS, [0, -0.11, 0]), at(mS, [0, -0.25, 0]), at(mE, [0, -0.15, 0])],
      (u: number) => 0.066 - 0.017 * Math.pow(u, 1.4) + 0.0025 * Math.exp(-(((u - 0.68) / 0.14) ** 2)));
    const H = handLocal(sx);
    const hand = transform(H.hand, mE);
    const fg = sx > 0 ? 'fingersL' : 'fingersR', ft = sx > 0 ? 'fingerTipsL' : 'fingerTipsR', th = sx > 0 ? 'thumbL' : 'thumbR';
    const fore = union([segF, transform(H.palmW, mE)], 0.02), fingersW = transform(H.fingerW, mE), fingerTipW = transform(H.fingerTipW, mE);
    // top of the arm cut well inside the sleeve (local y −0.12; the sleeve reaches −0.16):
    // when the arm swings, no skin shows through
    const iS = mS.clone().invert().elements;
    // fingers: same shoulder/elbow split, and the elbow part is shared
    // between hand, fingers and fingertips
    const handSplit = softWeights([[index[el], fore], [index[fg], fingersW], [index[ft], fingerTipW]], 0.006);
    const armW = (x: number, y: number, z: number): [number, number][] => {
      const wh = handSplit(x, y, z), sh2 = wh.reduce((a, [, w]) => a + w, 0);
      // shoulder × elbow by position along the arm: a long symmetric transition around the
      // elbow (local y −0.25) starting at the sleeve hem → the arm leaves the center of the
      // (rigid) sleeve and the bend stays smooth, with no bump
      const ly = iS[1] * x + iS[5] * y + iS[9] * z + iS[13];
      const we = smoothstep(-ly, 0.165, 0.335);
      return [[index[sh], 1 - we], ...wh.map(([b, w]): [number, number] => [b, (we * w) / sh2])];
    };
    const arm = custom(union([tubeArm, hand], 0.02), (d, x, y, z) =>
      Math.max(d, iS[1] * x + iS[5] * y + iS[9] * z + iS[13] + 0.12));
    const x0 = sx > 0 ? 0.2 : -0.75, x1 = sx > 0 ? 0.75 : -0.2;
    const geo = polygonize(arm, {
      min: [x0, 0.25, -0.2], max: [x1, 1.3, 0.25], cell: 0.0032, smooth: 8,
      weights: armW,
    });
    const m = new THREE.SkinnedMesh(geo, mats.skin);
    m.name = sx > 0 ? 'armMeshL' : 'armMeshR';
    root.add(m);
    m.bind(skeleton);
    // rigid thumb on the thumb bone (bone-local coordinates = elbow-local minus the base)
    const tp = bones[th].position;
    const thumbLocal = custom(H.thumb, () => 0);
    thumbLocal.eval = (x, y, z) => H.thumb.eval(x + tp.x, y + tp.y, z + tp.z);
    const thumbMesh = new THREE.Mesh(
      polygonize(thumbLocal, { min: [-0.07, -0.1, -0.06], max: [0.07, 0.04, 0.09], cell: 0.0022, smooth: 2 }), mats.skin);
    thumbMesh.name = sx > 0 ? 'thumbMeshL' : 'thumbMeshR';
    bones[th].add(thumbMesh);
    // sleeve: rigid piece on the shoulder (doesn't deform in any pose).
    // It carries a small patch of torso around the shoulder, fused with a small radius:
    // at the seam the sleeve grows out of the shirt in a curve (no crease), and the patch, close to the pivot, barely moves
    const pv = new THREE.Vector3().setFromMatrixPosition(mS);
    const torsoNear = custom(torso, (d, x, y, z) => smaxSoft(d, Math.hypot(x - pv.x, y - pv.y, z - pv.z) - 0.1, 0.03));
    const sleeveGeo = polygonize(union([transform(sleeveLocal(), mS), torsoNear], 0.035), {
      min: [sx > 0 ? 0.18 : -0.56, 0.62, -0.16], max: [sx > 0 ? 0.56 : -0.18, 1.08, 0.16], cell: 0.004, smooth: 4,
      weights: () => [[index[sh], 1]],
    });
    const sleeve = new THREE.SkinnedMesh(sleeveGeo, mats.shirt);
    sleeve.name = sx > 0 ? 'sleeveL' : 'sleeveR';
    root.add(sleeve);
    sleeve.bind(skeleton);
  }

  // ---- sneakers (rigid on the feet; ankle at y = 0.16) ----
  for (const sx of [1, -1]) {
    const bone = bones[sx > 0 ? 'footL' : 'footR'];
    const { upper, sole } = shoeField();
    const box = { min: [-0.18, -0.01, -0.22], max: [0.18, 0.22, 0.3], cell: 0.0065 };
    for (const [shape, mat, n] of [[upper, mats.shoe, 'shoeUpper'], [sole, mats.sole, 'shoeSole']] as const) {
      const g = polygonize(shape, box);
      g.translate(0, -0.16, 0.04);
      const m = new THREE.Mesh(g, mat);
      m.name = n + (sx > 0 ? 'L' : 'R');
      bone.add(m);
    }
  }

  buildHead(mats, bones.head, PALETTE, parts);

  root.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  // arm skin: no self-shadowing (avoids shadow lines at the elbow/wrist joints)
  root.traverse((o) => { if (/^(upperArm|armMesh)/.test(o.name)) o.receiveShadow = false; });
  return root;
}

/** Finds the rig parts in a built (or deserialized) Squid. */
export function squidRig(root: THREE.Object3D): Rig {
  const find = <T extends THREE.Object3D>(name: string) => root.getObjectByName(name) as T | undefined;
  const bones = Object.fromEntries(HUMANOID_BONES.map((n) => [n, find<THREE.Bone>(n)])) as Bones;
  const some = <T extends THREE.Object3D>(names: string[]) => names.map((n) => find<T>(n)).filter((o): o is T => !!o);
  return {
    bones,
    face: {
      eyes: some(['eyeR', 'eyeL']),
      mouth: some<THREE.Mesh>(['mouth_interior', 'mouth_teeth', 'mouth_tongue']),
      brows: some<THREE.Mesh>(['browL', 'browR']),
    },
    fingers: true,
  };
}

defineCharacter<SquidOptions>({
  name: 'squid', build: buildSquid, materials: squidMaterials, rig: squidRig,
  accent: (o) => `#${resolve(o).PALETTE.shirt.toString(16).padStart(6, '0')}`,
  ui: { label: 'Squid', icon: 'user' },
});
