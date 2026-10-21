/** Pure visual mathematics. No game random streams, clocks, DOM, or saved geometry. */
export type CircleMotif = 'tesseract' | 'triangles' | 'voronoi';
export interface CircleState { motif?: CircleMotif; topic: string; upgrades: ReadonlyArray<{ id: string; rank: number; visualOnly?: boolean }> }
export interface CircleDNA {
  motifs: Record<CircleMotif, number>;
  knowledge: number; rings: number; symmetry: number; detail: number; eccentricity: number; offset: number;
  rotation: number; warp: number; recursion: number; energy: number;
  siteCount: number; triangleCount: number; triangleCorners: number[]; triangleInsets: number[];
  planes: number[]; sites: Point[];
}
export interface Point { x: number; y: number }
export type Quality = 'low' | 'medium' | 'high';
export const CIRCLE = {
  transition: 1.7, geometryHz: 10, fps: 30, maxHistory: 24, trailLifetime: 0.85,
  background: 0.76, idleSpeed: 0.075, distortion: 0.12, pixelScale: 2,
  maxTriangles: 20, minSites: 8, maxSites: 37,
  lineWidth: 0.65, ringSpacing: 0.115, ringRadius: 0.28,
  gold: ['#59401a', '#ac7425', '#e5b94f', '#ffe39a', '#fff7d1'],
  quality: {
    low: { resolution: 240, sites: 19, recursion: 1, trails: 6 },
    medium: { resolution: 320, sites: 27, recursion: 2, trails: 9 },
    high: { resolution: 420, sites: 37, recursion: 2, trails: 12 },
  },
} as const;
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
export const unit = (seed: number, index: number) => {
  let x = (seed + Math.imul(index + 1, 0x9e3779b9)) | 0;
  x = Math.imul(x ^ x >>> 16, 0x21f0aaad); x = Math.imul(x ^ x >>> 15, 0x735a2d97);
  return ((x ^ x >>> 15) >>> 0) / 4294967296;
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Stable site identities: upgrades move existing sites; never reseed them.
 * Contributions are canonicalized by ID, bounded, additive and reversible. */
export function formation(state: CircleState): CircleDNA {
  const seed = hash('towerdefense:circle:v1'), identity = hash(state.topic);
  const d: CircleDNA = {
    motifs: { tesseract: 0, triangles: 0, voronoi: 0 },
    knowledge: 0, rings: 2, symmetry: 4,
    detail: 0, eccentricity: 0.04 + unit(identity, 3) * 0.12,
    offset: unit(identity, 4) * Math.PI * 2, rotation: 0.65 + unit(identity, 5) * 0.6,
    warp: 0.15, recursion: 0, energy: 0,
    siteCount: CIRCLE.minSites,
    triangleCount: 4,
    triangleCorners: Array.from({ length: 3 }, (_, i) => 0.85 + unit(identity, 22 + i) * 0.15),
    triangleInsets: Array.from({ length: 3 }, (_, i) => 0.1 + unit(identity, 25 + i) * 0.07),
    planes: Array.from({ length: 6 }, (_, i) => 0.3 + unit(identity, i + 6) * 0.7),
    sites: Array.from({ length: 37 }, (_, i) => {
      const a = i * 2.3999632297 + unit(seed, i) * 0.25;
      const r = 0.12 + Math.sqrt((i + 0.5) / 37) * 0.69;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    }),
  };
  d.motifs[state.motif ?? 'tesseract'] = 1;
  // Merge duplicates to keep the public interpreter independent of input order.
  const ranks = new Map<string, number>(), learned = new Map<string, number>();
  for (const u of state.upgrades) if (Number.isFinite(u.rank) && u.rank > 0) {
    const rank = clamp(u.rank, 0, 1000);
    ranks.set(u.id, Math.max(ranks.get(u.id) ?? 0, rank));
    if (!u.visualOnly) learned.set(u.id, Math.max(learned.get(u.id) ?? 0, rank));
  }
  for (const [id, rank] of [...ranks].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const h = hash(id), strength = Math.log2(1 + rank) * 0.15;
    const delta = (i: number) => (unit(h, i) * 2 - 1) * strength;
    for (let i = 0; i < 3; i++) {
      d.triangleCorners[i] += delta(32 + i) * 0.7;
      d.triangleInsets[i] += delta(35 + i) * 0.25;
    }
    d.eccentricity += delta(3) * 0.15; d.offset += delta(4); d.rotation += delta(5);
    d.warp += delta(6);
    d.planes.forEach((_, i) => d.planes[i] += delta(i + 10));
    d.sites.forEach((p, i) => {
      p.x += delta(40 + i * 2) * 0.32; p.y += delta(41 + i * 2) * 0.32;
    });
  }
  // Completed ranks add complexity; path identity only changes shape. The
  // bounded curve keeps early purchases visible and leaves room for deep trees.
  d.knowledge = [...learned].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).reduce((n, [, rank]) => n + rank, 0);
  const growth = d.knowledge / (d.knowledge + 6);
  d.rings = 2 + growth * 5; d.symmetry = 4 + growth * 8;
  d.detail = d.recursion = d.energy = growth;
  d.siteCount = CIRCLE.minSites + Math.round(growth * (CIRCLE.maxSites - CIRCLE.minSites));
  d.triangleCount = 4 + Math.round(growth * (CIRCLE.maxTriangles - 4));
  d.triangleCorners = d.triangleCorners.map(v => clamp(v, 0.62, 1));
  d.triangleInsets = d.triangleInsets.map(v => clamp(v, 0.065, 0.24));
  d.detail = clamp(d.detail, 0, 1); d.eccentricity = clamp(d.eccentricity, 0, 0.25);
  d.rotation = clamp(d.rotation, 0.2, 2); d.warp = clamp(d.warp, 0.05, 0.9);
  d.recursion = clamp(d.recursion, 0, 1); d.energy = clamp(d.energy, 0, 1);
  for (const p of d.sites) {
    // Topic displacement is independent of purchases as well.
    const a = d.offset * 0.3, x = p.x;
    p.x = x * Math.cos(a) - p.y * Math.sin(a); p.y = x * Math.sin(a) + p.y * Math.cos(a);
    const r = Math.hypot(p.x, p.y); if (r > 0.88) { p.x *= 0.88 / r; p.y *= 0.88 / r; }
  }
  return d;
}
const scalars = ['knowledge', 'rings', 'symmetry', 'detail', 'eccentricity', 'offset', 'rotation', 'warp', 'recursion', 'energy', 'siteCount', 'triangleCount'] as const;
export function mix(a: CircleDNA, b: CircleDNA, t: number): CircleDNA {
  const d = { ...a, motifs: {
    tesseract: a.motifs.tesseract + (b.motifs.tesseract - a.motifs.tesseract) * t,
    triangles: a.motifs.triangles + (b.motifs.triangles - a.motifs.triangles) * t,
    voronoi: a.motifs.voronoi + (b.motifs.voronoi - a.motifs.voronoi) * t,
  }, triangleCorners: a.triangleCorners.map((x, i) => x + (b.triangleCorners[i] - x) * t),
    triangleInsets: a.triangleInsets.map((x, i) => x + (b.triangleInsets[i] - x) * t),
    planes: a.planes.map((x, i) => x + (b.planes[i] - x) * t),
    sites: a.sites.map((p, i) => ({ x: p.x + (b.sites[i].x - p.x) * t, y: p.y + (b.sites[i].y - p.y) * t })) };
  for (const k of scalars) d[k] = a[k] + (b[k] - a[k]) * t;
  return d;
}
export class CircleTransition {
  private from: CircleDNA; target: CircleDNA; current: CircleDNA;
  private age = CIRCLE.transition as number;
  constructor(dna: CircleDNA) { this.from = this.target = this.current = dna; }
  retarget(dna: CircleDNA) { this.from = this.current; this.target = dna; this.age = 0; }
  get active() { return this.age < CIRCLE.transition; }
  get pulse() { return this.active ? Math.sin(Math.PI * this.age / CIRCLE.transition) : 0; }
  step(dt: number, reduced = false) {
    this.age = reduced ? CIRCLE.transition : Math.min(CIRCLE.transition, this.age + Math.max(0, dt));
    const t = this.age / CIRCLE.transition, eased = t * t * (3 - 2 * t);
    this.current = t === 1 ? this.target : mix(this.from, this.target, eased);
    return this.current;
  }
}
/** Convex half-plane clipping produces real Voronoi cells. */
export function clip(poly: Point[], nx: number, ny: number, limit: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = a.x * nx + a.y * ny - limit, db = b.x * nx + b.y * ny - limit;
    if (da <= 1e-9) out.push(a);
    if ((da < 0) !== (db < 0)) {
      const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}
export function boundary(radius = 0.86, sides = 48): Point[] {
  return Array.from({ length: sides }, (_, i) => ({ x: Math.cos(i * Math.PI * 2 / sides) * radius, y: Math.sin(i * Math.PI * 2 / sides) * radius }));
}
export function voronoi(sites: Point[], bound = boundary(), weights: number[] = []): Point[][] {
  return sites.map((s, i) => {
    let cell = bound;
    for (let j = 0; j < sites.length && cell.length; j++) if (j !== i) {
      const b = sites[j], nx = b.x - s.x, ny = b.y - s.y;
      cell = clip(cell, nx, ny, (b.x * b.x + b.y * b.y - s.x * s.x - s.y * s.y + (weights[i] ?? 0) - (weights[j] ?? 0)) / 2);
    }
    return cell;
  });
}
export const TESSERACT_EDGES: [number, number][] = Array.from({ length: 16 }, (_, i) =>
  [1, 2, 4, 8].filter(bit => !(i & bit)).map(bit => [i, i | bit] as [number, number])).flat();
const PLANES = [[0, 3], [1, 2], [1, 3], [0, 2], [2, 3], [0, 1]];
/** 4D plane rotations, perspective 4D→3D, then perspective 3D→2D.
 * Distances exceed maximum rotated radii, so projection cannot diverge. */
export function tesseract(time: number, dna: CircleDNA, angles?: ReadonlyArray<number>): Point[] {
  return Array.from({ length: 16 }, (_, i) => {
    const v: number[] = [0, 1, 2, 3].map(k => i & 1 << k ? 0.62 : -0.62);
    PLANES.forEach(([a, b], k) => {
      const theta = (angles?.[k] ?? time * dna.planes[k] * 0.28) + dna.offset * (k % 2 ? 0.3 : 0.5);
      const x = v[a], y = v[b], c = Math.cos(theta), s = Math.sin(theta);
      v[a] = x * c - y * s; v[b] = x * s + y * c;
    });
    const w = 2.8 / (2.8 - v[3]), z = v[2] * w, scale = w * 3.8 / (3.8 - z) * 0.34;
    return { x: v[0] * scale, y: v[1] * scale };
  });
}

/** Every child vertex lies on a parent edge: genuinely inscribed triangles,
 * with a bounded, slow change in the edge fraction creating a living spiral. */
export function nestedTriangles(dna: CircleDNA, time = 0): Point[][] {
  let triangle = Array.from({ length: 3 }, (_, i) => {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 3;
    return { x: Math.cos(a) * 0.9 * dna.triangleCorners[i], y: Math.sin(a) * 0.9 * dna.triangleCorners[i] };
  });
  const layers = [triangle];
  for (let depth = 1; depth < Math.ceil(dna.triangleCount); depth++) {
    triangle = triangle.map((p, i) => {
      const fraction = dna.triangleInsets[i] + Math.sin(time * 0.16 + depth * 0.35 + dna.offset + i * 0.4) * 0.018;
      const next = triangle[(i + 1) % 3];
      return { x: p.x + (next.x - p.x) * fraction, y: p.y + (next.y - p.y) * fraction };
    });
    layers.push(triangle);
  }
  return layers;
}

/** A fractional site count grows/shrinks one cell at a time. The new site's
 * power weight starts at the first contact with the existing tessellation,
 * so it is born at zero area instead of abruptly bisecting a neighbour.
 * Existing site identities persist through purchases and reversals. */
export function growingVoronoi(dna: CircleDNA, cap = CIRCLE.maxSites as number) {
  const count = CIRCLE.minSites + (dna.siteCount - CIRCLE.minSites) * (cap - CIRCLE.minSites) / (CIRCLE.maxSites - CIRCLE.minSites);
  const whole = Math.floor(count), fraction = count - whole;
  const sites = dna.sites.slice(0, whole), bound = boundary();
  const cells = voronoi(sites, bound);
  if (fraction < 1e-8 || whole >= cap) return { sites, cells, count };
  const newcomer = dna.sites[whole];
  let birthWeight = Infinity;
  cells.forEach((cell, i) => {
    const owner = sites[i];
    for (const p of cell) {
      const diff = (p.x-newcomer.x)**2 + (p.y-newcomer.y)**2 - (p.x-owner.x)**2 - (p.y-owner.y)**2;
      birthWeight = Math.min(birthWeight, diff);
    }
  });
  sites.push(newcomer);
  const weights = sites.map(() => 0);
  weights[whole] = Math.min(0, birthWeight) * (1 - fraction);
  return { sites, cells: voronoi(sites, bound, weights), count };
}
