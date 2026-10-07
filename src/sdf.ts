// Signed distance field (SDF) modeling + Surface Nets polygonization.
// Shapes are joined with "smooth union", which gives the molded-vinyl look
// (hair, beard, hands and clothes as single continuous surfaces).
import * as THREE from 'three';

export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export const smax = (a: number, b: number, k: number): number => -smin(-a, -b, k);

export type Vec3 = [number, number, number];
/** Rotation given as a quaternion or as Euler angles [x, y, z]. */
export type Rotation = THREE.Quaternion | number[] | null | undefined;
/** Distance post-processing: receives the base distance and the sample point. */
export type DistanceFn = (d: number, x: number, y: number, z: number) => number;

// ---------- nodes ----------
export abstract class Node {
  // bounding sphere (center + radius)
  cx = 0; cy = 0; cz = 0; br = 0;
  abstract eval(x: number, y: number, z: number): number;
  // lower bound of the distance (skips evaluations far from the surface)
  lb(x: number, y: number, z: number): number { return Math.hypot(x - this.cx, y - this.cy, z - this.cz) - this.br; }
}

function rotInv(rot: Rotation): number[] | null {
  if (!rot) return null;
  const m = new THREE.Matrix4();
  if (rot instanceof THREE.Quaternion) m.makeRotationFromQuaternion(rot);
  else m.makeRotationFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0));
  const e = m.invert().elements;
  return e;
}

type LocalFn = (x: number, y: number, z: number) => number;

class Prim extends Node {
  m: number[] | null;
  f: LocalFn;
  constructor(c: number[], br: number, rot: Rotation, f: LocalFn) {
    super();
    [this.cx, this.cy, this.cz] = c;
    this.br = br;
    this.m = rotInv(rot);
    this.f = f;
  }
  eval(x: number, y: number, z: number): number {
    let dx = x - this.cx, dy = y - this.cy, dz = z - this.cz;
    const m = this.m;
    if (m) {
      const lx = m[0] * dx + m[4] * dy + m[8] * dz;
      const ly = m[1] * dx + m[5] * dy + m[9] * dz;
      const lz = m[2] * dx + m[6] * dy + m[10] * dz;
      dx = lx; dy = ly; dz = lz;
    }
    return this.f(dx, dy, dz);
  }
}

export function ellipsoid(c: number[], r: number[], rot?: Rotation): Node {
  const [rx, ry, rz] = r;
  return new Prim(c, Math.max(rx, ry, rz), rot, (x, y, z) => {
    const k0 = Math.hypot(x / rx, y / ry, z / rz);
    const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
    return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  });
}

export function sphere(c: number[], r: number): Node {
  return new Prim(c, r, null, (x, y, z) => Math.hypot(x, y, z) - r);
}

// rounded cone between two points (radius r1 at a, r2 at b) — IQ
export function roundCone(a: number[], b: number[], r1: number, r2 = r1): Node {
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const br = Math.sqrt(l2) / 2 + Math.max(r1, r2);
  return new Prim(c, br, null, (x, y, z) => {
    // coordinates relative to "a"
    const px = x + c[0] - a[0], py = y + c[1] - a[1], pz = z + c[2] - a[2];
    const yv = px * ba[0] + py * ba[1] + pz * ba[2];
    const z2 = yv - l2;
    const qx = px * l2 - ba[0] * yv, qy = py * l2 - ba[1] * yv, qz = pz * l2 - ba[2] * yv;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yv * yv * l2;
    const zz = z2 * z2 * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z2) * a2 * zz > k) return Math.sqrt(x2 + zz) * il2 - r2;
    if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1;
  });
}

// torus around the local Y axis
export function torus(c: number[], R: number, r: number, rot?: Rotation, sz = 1): Node {
  return new Prim(c, R + r, rot, (x, y, z) => {
    const q = Math.hypot(x, z * sz) - R;
    return Math.hypot(q, y) - r;
  });
}

export function roundBox(c: number[], half: number[], rad: number, rot?: Rotation): Node {
  const [hx, hy, hz] = half;
  return new Prim(c, Math.hypot(hx, hy, hz) + rad, rot, (x, y, z) => {
    const qx = Math.abs(x) - hx, qy = Math.abs(y) - hy, qz = Math.abs(z) - hz;
    const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
    return out + Math.min(Math.max(qx, qy, qz), 0) - rad;
  });
}

class Union extends Node {
  items: Node[];
  k: number;
  constructor(items: Node[], k: number) {
    super();
    this.items = items;
    this.k = k;
    // approximate bounding sphere
    let cx = 0, cy = 0, cz = 0;
    items.forEach((i) => { cx += i.cx; cy += i.cy; cz += i.cz; });
    cx /= items.length; cy /= items.length; cz /= items.length;
    let br = 0;
    items.forEach((i) => { br = Math.max(br, Math.hypot(i.cx - cx, i.cy - cy, i.cz - cz) + i.br); });
    Object.assign(this, { cx, cy, cz, br });
  }
  eval(x: number, y: number, z: number): number {
    let d = 1e9;
    const k = this.k;
    for (const it of this.items) {
      if (it.lb(x, y, z) > d + k) continue;
      d = smin(d, it.eval(x, y, z), k);
    }
    return d;
  }
}
export const union = (items: (Node | Node[])[], k = 0): Node => new Union(items.flat(), k);

class Op extends Node {
  base: Node;
  fn: DistanceFn;
  constructor(base: Node, fn: DistanceFn) { super(); this.base = base; this.fn = fn; Object.assign(this, { cx: base.cx, cy: base.cy, cz: base.cz, br: base.br }); }
  eval(x: number, y: number, z: number): number { return this.fn(this.base.eval(x, y, z), x, y, z); }
}
// smooth subtraction: a − b
export const subtract = (a: Node, b: Node, k = 0): Node => new Op(a, (d, x, y, z) => smax(d, -b.eval(x, y, z), k));
export const intersect = (a: Node, b: Node, k = 0): Node => new Op(a, (d, x, y, z) => smax(d, b.eval(x, y, z), k));
export const custom = (a: Node, fn: DistanceFn): Node => new Op(a, fn);

// ---------- polygonization (Surface Nets) ----------
export interface PolygonizeOptions {
  min: number[];
  max: number[];
  cell: number;
  /** per-vertex color callback (writes into `out`) */
  color?: (x: number, y: number, z: number, out: THREE.Color) => void;
  /** per-vertex skin weights: [[boneIndex, weight], …] */
  weights?: (x: number, y: number, z: number) => [number, number][];
  project?: number;
  smooth?: number;
}

export function polygonize(node: Node, { min, max, cell, color, weights, project = 2, smooth = 0 }: PolygonizeOptions): THREE.BufferGeometry {
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const vals = new Float32Array(nx * ny * nz);
  const idx = (i: number, j: number, k: number) => i + nx * (j + ny * k);

  // skip blocks far from the surface (the center value already decides the sign)
  const B = 4;
  const bnx = Math.ceil(nx / B), bny = Math.ceil(ny / B), bnz = Math.ceil(nz / B);
  const bval = new Float32Array(bnx * bny * bnz);
  const bRad = B * cell * 0.9 * 1.5 + cell;
  for (let bk = 0; bk < bnz; bk++) for (let bj = 0; bj < bny; bj++) for (let bi = 0; bi < bnx; bi++) {
    bval[bi + bnx * (bj + bny * bk)] = node.eval(
      min[0] + (bi * B + B / 2) * cell, min[1] + (bj * B + B / 2) * cell, min[2] + (bk * B + B / 2) * cell);
  }
  for (let k = 0; k < nz; k++) {
    const z = min[2] + k * cell;
    for (let j = 0; j < ny; j++) {
      const y = min[1] + j * cell;
      for (let i = 0; i < nx; i++) {
        const bv = bval[((i / B) | 0) + bnx * (((j / B) | 0) + bny * ((k / B) | 0))];
        vals[idx(i, j, k)] = Math.abs(bv) > bRad ? bv : node.eval(min[0] + i * cell, y, z);
      }
    }
  }

  // one vertex per crossing cell
  const cnx = nx - 1, cny = ny - 1, cnz = nz - 1;
  const cellVert = new Int32Array(cnx * cny * cnz).fill(-1);
  const pos: number[] = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < cnz; k++) for (let j = 0; j < cny; j++) for (let i = 0; i < cnx; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      cv[c] = vals[idx(i + corner[c][0], j + corner[c][1], k + corner[c][2])];
      if (cv[c] < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t;
      sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t;
      sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t;
      n++;
    }
    cellVert[i + cnx * (j + cny * k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / n) * cell, min[1] + (j + sy / n) * cell, min[2] + (k + sz / n) * cell);
  }

  // quads on grid edges with a sign change
  const index: number[] = [];
  const cvi = (i: number, j: number, k: number) => cellVert[i + cnx * (j + cny * k)];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) index.push(a, c, b, a, d, c);
    else index.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v0 = vals[idx(i, j, k)];
    const in0 = v0 < 0;
    if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1) {
      const in1 = vals[idx(i + 1, j, k)] < 0;
      if (in0 !== in1) quad(cvi(i, j - 1, k - 1), cvi(i, j, k - 1), cvi(i, j, k), cvi(i, j - 1, k), !in0);
    }
    if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1) {
      const in1 = vals[idx(i, j + 1, k)] < 0;
      if (in0 !== in1) quad(cvi(i - 1, j, k - 1), cvi(i - 1, j, k), cvi(i, j, k), cvi(i, j, k - 1), !in0);
    }
    if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1) {
      const in1 = vals[idx(i, j, k + 1)] < 0;
      if (in0 !== in1) quad(cvi(i - 1, j - 1, k), cvi(i, j - 1, k), cvi(i, j, k), cvi(i - 1, j, k), !in0);
    }
  }

  // project vertices onto the surface and compute normals from the gradient
  const h = cell * 0.25;
  const vcount = pos.length / 3;
  const P = new Float32Array(pos);
  const N = new Float32Array(pos.length);
  const grad = (x: number, y: number, z: number, out: number[]) => {
    out[0] = node.eval(x + h, y, z) - node.eval(x - h, y, z);
    out[1] = node.eval(x, y + h, z) - node.eval(x, y - h, z);
    out[2] = node.eval(x, y, z + h) - node.eval(x, y, z - h);
    const l = Math.hypot(out[0], out[1], out[2]) || 1;
    out[0] /= l; out[1] /= l; out[2] /= l;
  };
  const g = [0, 0, 0];
  for (let v = 0; v < vcount; v++) {
    const x0 = P[v * 3], y0 = P[v * 3 + 1], z0 = P[v * 3 + 2];
    let x = x0, y = y0, z = z0;
    for (let it = 0; it < project; it++) {
      const d = node.eval(x, y, z);
      grad(x, y, z, g);
      const s = THREE.MathUtils.clamp(d, -cell, cell);
      x -= g[0] * s; y -= g[1] * s; z -= g[2] * s;
    }
    // at creases (unstable gradient) the projection can slide along the surface and create spikes:
    // clamp the total displacement to a fraction of a cell
    const mv = Math.hypot(x - x0, y - y0, z - z0), lim = cell * 0.5;
    if (mv > lim) { const f = lim / mv; x = x0 + (x - x0) * f; y = y0 + (y - y0) * f; z = z0 + (z - z0) * f; }
    grad(x, y, z, g);
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    N[v * 3] = g[0]; N[v * 3 + 1] = g[1]; N[v * 3 + 2] = g[2];
  }

  if (smooth > 0) taubinSmooth(P, index, vcount, smooth);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setIndex(index);
  if (smooth > 0) geo.computeVertexNormals();

  if (color) {
    const C = new Float32Array(pos.length);
    const out = new THREE.Color();
    for (let v = 0; v < vcount; v++) {
      color(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], out);
      C[v * 3] = out.r; C[v * 3 + 1] = out.g; C[v * 3 + 2] = out.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  }
  if (weights) {
    const SI = new Uint16Array(vcount * 4), SW = new Float32Array(vcount * 4);
    for (let v = 0; v < vcount; v++) {
      const ws = weights(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); // [[boneIndex, w], ...]
      ws.sort((a, b) => b[1] - a[1]);
      let sum = 0;
      for (let q = 0; q < Math.min(4, ws.length); q++) sum += ws[q][1];
      for (let q = 0; q < Math.min(4, ws.length); q++) { SI[v * 4 + q] = ws[q][0]; SW[v * 4 + q] = ws[q][1] / sum; }
    }
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  }
  return geo;
}

// Taubin smoothing (λ/μ): removes grid stair-steps without shrinking the volume
function taubinSmooth(P: Float32Array, index: number[], vcount: number, iterations: number, lambda = 0.5, mu = -0.53) {
  const nbr = Array.from({ length: vcount }, () => new Set<number>());
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    nbr[a].add(b); nbr[a].add(c); nbr[b].add(a); nbr[b].add(c); nbr[c].add(a); nbr[c].add(b);
  }
  const lists = nbr.map((s) => [...s]);
  const tmp = new Float32Array(P.length);
  const pass = (f: number) => {
    for (let v = 0; v < vcount; v++) {
      const l = lists[v];
      if (!l.length) { tmp[v * 3] = P[v * 3]; tmp[v * 3 + 1] = P[v * 3 + 1]; tmp[v * 3 + 2] = P[v * 3 + 2]; continue; }
      let ax = 0, ay = 0, az = 0;
      for (const n of l) { ax += P[n * 3]; ay += P[n * 3 + 1]; az += P[n * 3 + 2]; }
      ax /= l.length; ay /= l.length; az /= l.length;
      tmp[v * 3] = P[v * 3] + f * (ax - P[v * 3]);
      tmp[v * 3 + 1] = P[v * 3 + 1] + f * (ay - P[v * 3 + 1]);
      tmp[v * 3 + 2] = P[v * 3 + 2] + f * (az - P[v * 3 + 2]);
    }
    P.set(tmp);
  };
  for (let i = 0; i < iterations; i++) { pass(lambda); pass(mu); }
}

// find the surface along +Z (outside in), handy for placing decals
export function surfaceZ(node: Node, x: number, y: number, zFrom = 1, zTo = -1): number {
  let a = zFrom, b = zTo;
  if (node.eval(x, y, a) < 0) return a;
  // march until inside
  const step = 0.01;
  let z = a;
  while (z > b && node.eval(x, y, z) > 0) z -= step;
  let lo = z, hi = z + step;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (node.eval(x, y, m) > 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}

// apply a rigid transform (Matrix4) to a node: evaluates in the node's local space
class Xform extends Node {
  base: Node;
  inv: number[];
  constructor(base: Node, matrix: THREE.Matrix4) {
    super();
    this.base = base;
    this.inv = matrix.clone().invert().elements;
    const c = new THREE.Vector3(base.cx, base.cy, base.cz).applyMatrix4(matrix);
    Object.assign(this, { cx: c.x, cy: c.y, cz: c.z, br: base.br });
  }
  eval(x: number, y: number, z: number): number {
    const e = this.inv;
    return this.base.eval(
      e[0] * x + e[4] * y + e[8] * z + e[12],
      e[1] * x + e[5] * y + e[9] * z + e[13],
      e[2] * x + e[6] * y + e[10] * z + e[14]);
  }
}
// node with a world-space distance function and an explicit bounding sphere
class FnNode extends Node {
  f: LocalFn;
  constructor(c: number[], br: number, f: LocalFn) {
    super();
    [this.cx, this.cy, this.cz] = c;
    this.br = br;
    this.f = f;
  }
  eval(x: number, y: number, z: number): number { return this.f(x, y, z); }
}
export const field = (c: number[], br: number, f: LocalFn): Node => new FnNode(c, br, f);

export const transform = (node: Node, matrix: THREE.Matrix4): Node => new Xform(node, matrix);
