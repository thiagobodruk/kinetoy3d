// Model serialization: a built character (object tree, geometry, skeleton) packed into one
// binary blob and back. Used to build models off the main thread (Web Worker) and to bake
// them at build time. Materials aren't stored, only their names: the page creates them.
//
// Format: 'KTM1' · u32 header length · JSON header · (padding) · buffers (4-byte aligned)
import * as THREE from 'three';

type ArrayKind = 'f32' | 'u8' | 'u16' | 'u32' | 'i16' | 'f64';
const ARRAYS = { f32: Float32Array, u8: Uint8Array, u16: Uint16Array, u32: Uint32Array, i16: Int16Array, f64: Float64Array };
type TypedArray = InstanceType<(typeof ARRAYS)[ArrayKind]>;
const kindOf = (a: ArrayLike<number>): ArrayKind => {
  for (const [k, C] of Object.entries(ARRAYS)) if (a instanceof C) return k as ArrayKind;
  throw new Error('Unsupported attribute array');
};

interface BufferRef {
  kind: ArrayKind;
  buffer: number;
  /** stored as differences from the value `delta` items before (see compactModel) */
  delta?: number;
}
interface AttributeData extends BufferRef {
  itemSize: number;
  normalized: boolean;
  /** the same item repeated `count` times (stored once; see compactModel) */
  constant?: number[];
  count?: number;
  /** quantized: value = min + q · step (per component) */
  quant?: { min: number[]; step: number[] };
}
interface GeometryData {
  attributes: Record<string, AttributeData>;
  morph: Record<string, AttributeData[]>;
  index?: BufferRef;
  groups: { start: number; count: number; materialIndex?: number }[];
}
interface NodeData {
  type: 'Object3D' | 'Group' | 'Bone' | 'Mesh' | 'SkinnedMesh';
  name: string;
  parent: number;
  /** position, quaternion, scale (exact doubles) */
  t: number[];
  userData?: Record<string, unknown>;
  geometry?: number;
  material?: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
  visible?: boolean;
  bindMatrix?: number[];
}
export interface ModelData {
  nodes: NodeData[];
  geometries: GeometryData[];
  /** skeleton shared by the skinned meshes: bone node indices + inverse bind matrices */
  skeleton?: { bones: number[]; inverses: number[] };
  buffers: TypedArray[];
}

/** Flattens an object tree (depth-first, parents before children). */
export function serializeModel(root: THREE.Object3D): ModelData {
  const nodes: NodeData[] = [], geometries: GeometryData[] = [], buffers: TypedArray[] = [];
  const nodeIndex = new Map<THREE.Object3D, number>(), geoIndex = new Map<THREE.BufferGeometry, number>();
  let skeleton: THREE.Skeleton | undefined;
  const buf = (array: ArrayLike<number>): BufferRef => {
    buffers.push(array as TypedArray);
    return { kind: kindOf(array), buffer: buffers.length - 1 };
  };
  const attr = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): AttributeData => {
    if (!(a instanceof THREE.BufferAttribute)) throw new Error('Interleaved attributes are not supported');
    return { ...buf(a.array), itemSize: a.itemSize, normalized: a.normalized };
  };
  const geometry = (g: THREE.BufferGeometry): number => {
    let i = geoIndex.get(g);
    if (i !== undefined) return i;
    const data: GeometryData = { attributes: {}, morph: {}, groups: g.groups.map((x) => ({ ...x })) };
    for (const [name, a] of Object.entries(g.attributes)) data.attributes[name] = attr(a);
    for (const [name, list] of Object.entries(g.morphAttributes)) data.morph[name] = list.map(attr);
    if (g.index) data.index = buf(g.index.array);
    geometries.push(data);
    geoIndex.set(g, i = geometries.length - 1);
    return i;
  };
  root.traverse((o) => {
    const n: NodeData = {
      type: o instanceof THREE.SkinnedMesh ? 'SkinnedMesh' : o instanceof THREE.Mesh ? 'Mesh' : o instanceof THREE.Bone ? 'Bone'
        : o instanceof THREE.Group ? 'Group' : 'Object3D',
      name: o.name,
      parent: o === root ? -1 : nodeIndex.get(o.parent!)!,
      t: [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()],
    };
    if (Object.keys(o.userData).length) n.userData = structuredClone(o.userData);
    if (o.castShadow) n.castShadow = true;
    if (o.receiveShadow) n.receiveShadow = true;
    if (!o.visible) n.visible = false;
    if (o instanceof THREE.Mesh) {
      n.geometry = geometry(o.geometry);
      n.material = (o.material as THREE.Material).name;
    }
    if (o instanceof THREE.SkinnedMesh) {
      if (skeleton && skeleton !== o.skeleton) throw new Error('Only one skeleton per model is supported');
      skeleton = o.skeleton;
      n.bindMatrix = o.bindMatrix.toArray();
    }
    nodes.push(n);
    nodeIndex.set(o, nodes.length - 1);
  });
  const data: ModelData = { nodes, geometries, buffers };
  if (skeleton) {
    data.skeleton = {
      bones: skeleton.bones.map((b) => nodeIndex.get(b)!),
      inverses: skeleton.boneInverses.flatMap((m) => m.toArray()),
    };
  }
  return data;
}

/** Rebuilds the object tree. `material(name)` provides the material for each mesh. */
export function deserializeModel(data: ModelData, material: (name: string) => THREE.Material): THREE.Object3D {
  const B = data.buffers;
  // undoes the delta coding (integer arrays wrap around, like the encoder)
  const decoded = (ref: BufferRef) => {
    const src = B[ref.buffer];
    if (!ref.delta) return src;
    const out = src.slice(), d = ref.delta;
    for (let i = d; i < out.length; i++) out[i] += out[i - d];
    return out;
  };
  const attr = (a: AttributeData) => {
    if (a.constant) {
      const array = new ARRAYS[a.kind](a.count! * a.itemSize);
      for (let i = 0; i < array.length; i++) array[i] = a.constant[i % a.itemSize];
      return new THREE.BufferAttribute(array, a.itemSize, a.normalized);
    }
    const array = decoded(a);
    if (a.quant) {
      const { min, step } = a.quant, n = a.itemSize, f = new Float32Array(array.length);
      for (let i = 0; i < f.length; i++) f[i] = min[i % n] + array[i] * step[i % n];
      return new THREE.BufferAttribute(f, n, false);
    }
    return new THREE.BufferAttribute(array, a.itemSize, a.normalized);
  };
  const geometries = data.geometries.map((g) => {
    const geo = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(g.attributes)) geo.setAttribute(name, attr(a));
    for (const [name, list] of Object.entries(g.morph)) geo.morphAttributes[name] = list.map(attr);
    if (g.index) geo.setIndex(new THREE.BufferAttribute(decoded(g.index), 1));
    for (const gr of g.groups) geo.addGroup(gr.start, gr.count, gr.materialIndex);
    return geo;
  });
  const objects: THREE.Object3D[] = [];
  const skinned: [THREE.SkinnedMesh, number[]][] = [];
  for (const n of data.nodes) {
    let o: THREE.Object3D;
    if (n.type === 'Mesh' || n.type === 'SkinnedMesh') {
      const geo = geometries[n.geometry!], mat = material(n.material!);
      const mesh = n.type === 'SkinnedMesh' ? new THREE.SkinnedMesh(geo, mat) : new THREE.Mesh(geo, mat);
      if (Object.keys(geo.morphAttributes).length) mesh.updateMorphTargets();
      if (mesh instanceof THREE.SkinnedMesh) skinned.push([mesh, n.bindMatrix!]);
      o = mesh;
    } else o = n.type === 'Bone' ? new THREE.Bone() : n.type === 'Group' ? new THREE.Group() : new THREE.Object3D();
    o.name = n.name;
    o.position.fromArray(n.t, 0); o.quaternion.fromArray(n.t, 3); o.scale.fromArray(n.t, 7);
    if (n.userData) o.userData = n.userData;
    o.castShadow = !!n.castShadow;
    o.receiveShadow = !!n.receiveShadow;
    if (n.visible === false) o.visible = false;
    if (n.parent >= 0) objects[n.parent].add(o);
    objects.push(o);
  }
  const root = objects[0];
  if (data.skeleton) {
    const s = data.skeleton;
    const inverses = s.bones.map((_, i) => new THREE.Matrix4().fromArray(s.inverses, i * 16));
    const skeleton = new THREE.Skeleton(s.bones.map((i) => objects[i] as THREE.Bone), inverses);
    root.updateMatrixWorld(true);
    for (const [mesh, bind] of skinned) mesh.bind(skeleton, new THREE.Matrix4().fromArray(bind));
  }
  return root;
}

/**
 * Smaller model for download (baked files): attributes that repeat one value (e.g. skin
 * weights of a mesh bound to a single bone) are stored once, and normals, colors and skin
 * weights become normalized 16-bit integers (error < 0.00003). Positions stay exact.
 */
export function compactModel(data: ModelData): ModelData {
  const buffers = [...data.buffers];
  const compactAttr = (name: string, a: AttributeData): AttributeData => {
    const src = buffers[a.buffer] as Float32Array;
    const n = a.itemSize, count = src.length / n;
    let constant = count > 0;
    for (let i = n; constant && i < src.length; i++) if (src[i] !== src[i % n]) constant = false;
    if (constant) return { ...a, constant: Array.from(src.subarray(0, n)), count, buffer: -1 };
    if (a.kind !== 'f32' || a.normalized) return a;
    if (name === 'position') {
      // 16-bit positions inside the mesh's bounding box
      const min = Array(n).fill(Infinity), max = Array(n).fill(-Infinity);
      for (let i = 0; i < src.length; i++) { min[i % n] = Math.min(min[i % n], src[i]); max[i % n] = Math.max(max[i % n], src[i]); }
      const step = min.map((m, c) => (max[c] - m) / 65535 || 1);
      const q = new Uint16Array(src.length);
      for (let i = 0; i < src.length; i++) q[i] = Math.round((src[i] - min[i % n]) / step[i % n]);
      buffers.push(delta(q, n));
      return { ...a, kind: 'u16', buffer: buffers.length - 1, delta: n, quant: { min, step } };
    }
    // signed for directions, unsigned for 0..1 values
    const signed = name === 'normal';
    if (!signed && name !== 'color' && name !== 'skinWeight') return a;
    const q = signed ? new Int16Array(src.length) : new Uint16Array(src.length);
    const scale = signed ? 32767 : 65535;
    for (let i = 0; i < src.length; i++) q[i] = Math.round(Math.max(signed ? -1 : 0, Math.min(1, src[i])) * scale);
    buffers.push(delta(q, n));
    return { ...a, kind: signed ? 'i16' : 'u16', normalized: true, buffer: buffers.length - 1, delta: n };
  };
  // neighboring vertices are close: storing differences makes the data compress much better
  const delta = <T extends Int16Array | Uint16Array | Uint32Array>(src: T, d: number): T => {
    const out = src.slice() as T;
    for (let i = out.length - 1; i >= d; i--) out[i] = src[i] - src[i - d];
    return out;
  };
  const deltaIndex = (ref: BufferRef): BufferRef => {
    const src = buffers[ref.buffer];
    if (!(src instanceof Uint16Array || src instanceof Uint32Array)) return ref;
    buffers.push(delta(src, 1));
    return { ...ref, buffer: buffers.length - 1, delta: 1 };
  };
  const geometries = data.geometries.map((g) => ({
    ...g,
    attributes: Object.fromEntries(Object.entries(g.attributes).map(([k, a]) => [k, compactAttr(k, a)])),
    index: g.index && deltaIndex(g.index),
  }));
  // keep only the buffers still referenced
  const used = new Map<number, number>(), out: TypedArray[] = [];
  const remap = (i: number) => { if (i < 0) return i; if (!used.has(i)) { used.set(i, out.length); out.push(buffers[i]); } return used.get(i)!; };
  for (const g of geometries) {
    for (const a of Object.values(g.attributes)) a.buffer = remap(a.buffer);
    for (const list of Object.values(g.morph)) for (const a of list) a.buffer = remap(a.buffer);
    if (g.index) g.index = { ...g.index, buffer: remap(g.index.buffer) };
  }
  return { ...data, geometries, buffers: out };
}

const MAGIC = 0x314d544b; // 'KTM1'

/** Packs model data into one ArrayBuffer (transferable, or written to a file). */
export function packModel(data: ModelData): ArrayBuffer {
  const offsets: number[] = [];
  let size = 0;
  for (const b of data.buffers) { offsets.push(size); size += Math.ceil(b.byteLength / 8) * 8; }
  const header = new TextEncoder().encode(JSON.stringify({ ...data, buffers: data.buffers.map((b, i) => ({ kind: kindOf(b), offset: offsets[i], length: b.length })) }));
  const start = Math.ceil((8 + header.length) / 8) * 8;
  const out = new ArrayBuffer(start + size);
  const view = new DataView(out);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, header.length, true);
  new Uint8Array(out, 8, header.length).set(header);
  data.buffers.forEach((b, i) => new Uint8Array(out, start + offsets[i], b.byteLength).set(new Uint8Array(b.buffer, b.byteOffset, b.byteLength)));
  return out;
}

export function unpackModel(buffer: ArrayBuffer): ModelData {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('Not a KineToy model file');
  const length = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, length)));
  const start = Math.ceil((8 + length) / 8) * 8;
  header.buffers = header.buffers.map((b: { kind: ArrayKind; offset: number; length: number }) => new ARRAYS[b.kind](buffer, start + b.offset, b.length));
  return header;
}
