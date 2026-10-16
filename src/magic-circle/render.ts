import { CIRCLE, CircleTransition, formation, hash, growingVoronoi, nestedTriangles, tesseract, TESSERACT_EDGES, unit, voronoi, type CircleDNA, type CircleState, type Point, type Quality } from './formation.ts';

/** Positions along a fixed polar graph (four rings, 24 junctions each).
 * History stores graph coordinates, so trails stay attached during deformation. */
interface Trace { a: number; b: number; u: number }
interface Agent { a: number; b: number; u: number; speed: number; hops: number; age: number; life: number; history: Trace[] }
const TAU = Math.PI * 2, SECTORS = 24;
function node(id: number, d: CircleDNA, time: number): Point {
  const ring = Math.floor(id / SECTORS), sector = id % SECTORS;
  const a = sector * TAU / SECTORS + d.offset + time * CIRCLE.idleSpeed * (ring % 2 ? -1 : 1);
  const r = 0.34 + ring * 0.19 + Math.sin(a * 3 + d.offset) * d.eccentricity * 0.08;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r * (1 - d.eccentricity) };
}
function location(t: Trace, d: CircleDNA, time: number): Point {
  const a = node(t.a, d, time), b = node(t.b, d, time);
  // Ring edges follow the visible circular arc; radial edges are straight.
  if (Math.floor(t.a / SECTORS) === Math.floor(t.b / SECTORS)) {
    const start = Math.atan2(a.y / (1 - d.eccentricity), a.x);
    const dir = (t.b - t.a + SECTORS) % SECTORS === 1 ? 1 : -1;
    const angle = start + dir * TAU / SECTORS * t.u;
    const r = 0.34 + Math.floor(t.a / SECTORS) * 0.19 + Math.sin(angle * 3 + d.offset) * d.eccentricity * 0.08;
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r * (1 - d.eccentricity) };
  }
  return { x: a.x + (b.x - a.x) * t.u, y: a.y + (b.y - a.y) * t.u };
}
export class CircleTrails {
  readonly agents: Agent[];
  constructor(count: number) {
    this.agents = Array.from({ length: count }, (_, i) => {
      const a = (i * 29) % 96;
      return { a, b: this.next(a, i, 0), u: 0, speed: 1.2 + unit(71, i) * 2, hops: 0, age: 0, life: 5 + unit(72, i) * 7, history: [] };
    });
  }
  private next(a: number, index: number, hops: number) {
    const ring = Math.floor(a / SECTORS), sector = a % SECTORS;
    const choice = unit(index + 418, hops);
    if (choice < 0.25 && ring < 3) return a + SECTORS;
    if (choice < 0.5 && ring > 0) return a - SECTORS;
    return ring * SECTORS + (sector + (index % 2 ? 1 : SECTORS - 1)) % SECTORS;
  }
  step(dt: number, pulse: number) {
    this.agents.forEach((a, i) => {
      a.age += dt;
      if (a.age >= a.life) {
        a.age = 0; a.history.length = 0;
        a.speed = 1.2 + unit(71 + i, a.hops) * 2;
      }
      a.u += dt * a.speed * (1 + pulse * 2.5);
      while (a.u >= 1) { a.u -= 1; a.a = a.b; a.b = this.next(a.a, i, ++a.hops); }
      if (a.history.length >= CIRCLE.maxHistory) a.history.shift();
      a.history.push({ a: a.a, b: a.b, u: a.u });
    });
  }
}
function polygon(path: Path2D, points: Point[], scale = 1, cx = 0, cy = 0) {
  if (!points.length) return;
  path.moveTo(cx + points[0].x * scale, cy + points[0].y * scale);
  for (let i = 1; i < points.length; i++) path.lineTo(cx + points[i].x * scale, cy + points[i].y * scale);
  path.closePath();
}
/** Canvas owner has no RAF, timers, global listeners or observers. UI owners
 * attach the same canvas after DOM replacement and call frame only in view. */
export class MagicCircle {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private transition: CircleTransition | null = null;
  private signature = '';
  private cells = new Path2D();
  private previousCells = new Path2D();
  private lastGeometry = -Infinity;
  private geometryDirty = true;
  private clock = 0;
  private orbitClock = 0;
  private angles = Array<number>(6).fill(0);
  private last = -1;
  private rendered = -Infinity;
  private still = false;
  private dirty = true;
  private trails: CircleTrails;
  private currentQuality: Quality;
  private frameCost = 0;
  private slowFrames = 0;
  private qualityPinned: boolean;
  constructor(quality?: Quality) {
    this.qualityPinned = !!quality;
    this.currentQuality = quality ?? (window.innerWidth < 600 ? 'low' : 'medium');
    this.trails = new CircleTrails(CIRCLE.quality[this.currentQuality].trails);
    this.canvas.className = 'magic-circle'; this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.dataset.quality = this.currentQuality;
  }
  get quality() { return this.currentQuality; }
  setQuality(q: Quality) {
    if (q === this.currentQuality) return;
    this.currentQuality = q; this.canvas.dataset.quality = q;
    this.trails = new CircleTrails(CIRCLE.quality[q].trails);
    this.geometryDirty = this.dirty = true;
  }
  attach(host: HTMLElement) { if (this.canvas.parentElement !== host) host.prepend(this.canvas); }
  set(state: CircleState) {
    const dna = formation(state), key = JSON.stringify(dna);
    if (key === this.signature) return;
    this.signature = key;
    if (!this.transition) this.transition = new CircleTransition(dna); else this.transition.retarget(dna);
    this.geometryDirty = this.dirty = true;
    this.canvas.dataset.formation = hash(key).toString(16);
    this.canvas.dataset.motif = state.motif ?? 'tesseract';
  }
  /** Timed purchases can stir the artifact without prematurely granting a rank. */
  energize() {
    if (!this.transition) return;
    this.transition.retarget(this.transition.target);
    this.dirty = true;
  }
  destroy() { this.canvas.remove(); this.transition = null; this.signature = ''; }
  frame(now: number, reduced: boolean) {
    if (!this.transition || !this.canvas.isConnected || document.hidden) { this.last = -1; return; }
    const elapsed = this.last < 0 || now - this.last > 250 ? 0 : Math.max(0, (now - this.last) / 1000);
    this.last = now;
    const box = this.canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const size = Math.max(120, Math.min(CIRCLE.quality[this.quality].resolution, Math.ceil(Math.min(box.width, box.height) / CIRCLE.pixelScale)));
    const resized = this.canvas.width !== size;
    if (resized) { this.canvas.width = this.canvas.height = size; this.dirty = true; }
    if (this.still !== reduced) { this.dirty = true; this.still = reduced; }
    // Update animation every visible frame; paint at most 30 Hz. Pauses don't
    // fast-forward particles or launch a purchase burst when returning.
    if (!reduced) this.clock += elapsed;
    const active = this.transition.active;
    const dna = this.transition.step(elapsed, reduced);
    if (reduced && active) this.geometryDirty = true;
    if (!reduced) {
      // Integrate angular velocity: multiplying a changed rate by total age
      // would cause a huge rotation jump after a long idle session.
      this.orbitClock += elapsed * dna.rotation;
      for (let k = 0; k < this.angles.length; k++) this.angles[k] += elapsed * dna.planes[k] * 0.28;
    }
    if (reduced && !this.dirty && !active) return;
    if (!reduced && now - this.rendered < 1000 / CIRCLE.fps && !this.dirty) return;
    const started = performance.now();
    const drawDt = Math.min(CIRCLE.trailLifetime / CIRCLE.maxHistory, (now - this.rendered) / 1000 || 0);
    this.rendered = now;
    if (this.geometryDirty || (active && this.clock - this.lastGeometry >= 1 / CIRCLE.geometryHz)) {
      this.previousCells = this.cells; this.cells = this.geometry(dna);
      this.lastGeometry = this.clock; this.geometryDirty = false;
    }
    if (!reduced) this.trails.step(drawDt, this.transition.pulse);
    this.paint(dna, reduced ? 0 : this.clock, reduced ? 0 : this.transition.pulse, reduced);
    // Settle to the exact target, including when the last tick crossed 1.7s.
    if (active && !this.transition.active) this.geometryDirty = this.dirty = true;
    else this.dirty = false;
    this.frameCost = performance.now() - started;
    if (!this.qualityPinned && this.frameCost > 12) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 12 && this.quality !== 'low') { this.setQuality('low'); this.slowFrames = 0; }
  }
  private geometry(d: CircleDNA) {
    const quality = CIRCLE.quality[this.quality], path = new Path2D();
    if (d.motifs.voronoi <= 0) return path;
    const { sites, cells } = growingVoronoi(d, quality.sites);
    this.canvas.dataset.cells = String(cells.filter(cell => cell.length >= 3).length);
    cells.forEach((cell, i) => {
      polygon(path, cell);
      if (i % 3 !== 0 || cell.length < 3) return;
      // Recursive Voronoi diagrams clipped INSIDE parent polygons.
      let cx = 0, cy = 0;
      for (const p of cell) { cx += p.x / cell.length; cy += p.y / cell.length; }
      const inset = cell.map(p => ({ x: cx + (p.x - cx) * 0.68, y: cy + (p.y - cy) * 0.68 }));
      polygon(path, inset);
      if (quality.recursion > 1) {
        const local = inset.filter((_, j) => j % 2 === 0).map(p => ({ x: (p.x + cx) / 2, y: (p.y + cy) / 2 }));
        local.push({ x: cx, y: cy });
        for (const child of voronoi(local, inset)) polygon(path, child);
      }
      const r = Math.min(...cell.map(p => Math.hypot(p.x - cx, p.y - cy))) * (0.22 + d.recursion * 0.25);
      path.moveTo(cx + r, cy); path.arc(cx, cy, r, 0, TAU);
      path.moveTo(cx + r * 0.65, cy); path.arc(cx, cy, r * 0.65, 0, TAU);
    });
    return path;
  }
  private paint(d: CircleDNA, time: number, pulse: number, reduced: boolean) {
    const c = this.ctx, size = this.canvas.width, r = size * 0.455, gold = CIRCLE.gold;
    const orbitTime = reduced ? 0 : this.orbitClock;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, size, size);
    c.fillStyle = `rgba(3,4,6,${CIRCLE.background})`;
    c.beginPath(); c.arc(size / 2, size / 2, r * 1.08, 0, TAU); c.fill();
    c.translate(size / 2, size / 2); c.scale(r, r); c.lineWidth = CIRCLE.lineWidth / r;
    const line = (a: Point, b: Point) => { c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); };
    // Cached cellular layers dissolve across topology changes at 10 Hz.
    const blend = reduced ? 1 : Math.min(1, (this.clock - this.lastGeometry) * CIRCLE.geometryHz);
    c.save(); c.rotate(time * 0.012); c.strokeStyle = gold[1];
    c.globalAlpha = (1 - blend) * 0.7 * d.motifs.voronoi; c.stroke(this.previousCells);
    c.globalAlpha = blend * 0.7 * d.motifs.voronoi; c.stroke(this.cells); c.restore();
    if (d.motifs.triangles > 0) {
      c.save(); c.rotate(d.offset + orbitTime * 0.025);
      const triangles = nestedTriangles(d, time), count = d.triangleCount;
      this.canvas.dataset.triangles = String(count);
      triangles.forEach((points, i) => {
        if (count <= i) return;
        c.globalAlpha = d.motifs.triangles * Math.min(1, Math.max(0, count - i)) * (0.8 + pulse * 0.2);
        c.strokeStyle = gold[i % 3 === 0 ? 3 : 2]; c.lineWidth = (i % 3 === 0 ? 1 : 0.7) / r;
        const path = new Path2D(); polygon(path, points); c.stroke(path);
        c.fillStyle = gold[4];
        for (const p of points) c.fillRect(p.x - 0.004, p.y - 0.004, 0.008, 0.008);
      });
      c.restore();
    }
    // Fractional ring/symmetry changes crossfade rather than popping counts.
    for (let i = 0; i < 7; i++) {
      const alpha = Math.min(1, Math.max(0, d.rings - i)); if (!alpha) continue;
      c.save(); c.globalAlpha = alpha * (0.65 + pulse * 0.3); c.strokeStyle = gold[i % 2 ? 2 : 1];
      c.rotate(d.offset + orbitTime * CIRCLE.idleSpeed * (i % 2 ? -1 : 1));
      c.scale(1, 1 - d.eccentricity);
      const radius = CIRCLE.ringRadius + i * CIRCLE.ringSpacing + pulse * 0.025 * Math.sin(i);
      c.beginPath(); c.arc(0, 0, radius, 0, TAU); c.arc(0, 0, radius + 0.012, 0, TAU); c.stroke();
      const n = 48 + i * 8;
      c.beginPath();
      for (let j = 0; j < n; j++) {
        const a = j / n * TAU, len = j % 4 === 0 ? 0.035 : 0.014;
        line({ x: Math.cos(a) * radius, y: Math.sin(a) * radius }, { x: Math.cos(a) * (radius + len), y: Math.sin(a) * (radius + len) });
      }
      c.stroke(); c.restore();
    }
    for (const symmetry of [Math.floor(d.symmetry), Math.floor(d.symmetry) + 1]) {
      c.save(); c.globalAlpha = (symmetry === Math.floor(d.symmetry) ? 1 - d.symmetry % 1 : d.symmetry % 1) * 0.75 * (1 - d.motifs.triangles * 0.8);
      c.strokeStyle = gold[2]; c.rotate(d.offset - time * 0.025); c.beginPath();
      for (let i = 0; i < symmetry; i++) {
        const a = i * TAU / symmetry, b = (i + 2) * TAU / symmetry;
        const point = { x: Math.cos(a) * 0.77, y: Math.sin(a) * 0.77 };
        line(point, { x: Math.cos(b) * 0.77, y: Math.sin(b) * 0.77 });
        const rr = 0.05 + d.detail * 0.035;
        c.moveTo(point.x + rr, point.y); c.arc(point.x, point.y, rr, 0, TAU);
        c.moveTo(point.x + rr * 0.7, point.y); c.arc(point.x, point.y, rr * 0.7, 0, TAU);
      }
      c.stroke(); c.restore();
    }
    // A stable junction graph gives lights real paths and branching choices.
    c.strokeStyle = gold[0]; c.globalAlpha = 0.65; c.beginPath();
    for (let i = 0; i < 96; i++) {
      const p = node(i, d, orbitTime);
      if (i < 72) line(p, node(i + 24, d, orbitTime));
      if (i % 3 === 0) { c.moveTo(p.x + 0.011, p.y); c.arc(p.x, p.y, 0.011, 0, TAU); }
    }
    c.stroke();
    c.strokeStyle = gold[1]; c.globalAlpha = 0.8; c.beginPath();
    for (let ring = 0; ring < 4; ring++) {
      const first = node(ring * SECTORS, d, orbitTime); c.moveTo(first.x, first.y);
      for (let i = 0; i < SECTORS; i++) for (let j = 1; j <= 4; j++) {
        const p = location({ a: ring * SECTORS + i, b: ring * SECTORS + (i + 1) % SECTORS, u: j / 4 }, d, orbitTime);
        c.lineTo(p.x, p.y);
      }
      c.closePath();
    }
    c.stroke();
    // Projected 4D wireframe, warped only by a bounded radial envelope.
    if (d.motifs.tesseract > 0) {
    const vertices = tesseract(0, { ...d, offset: d.offset + pulse * 0.8 }, reduced ? undefined : this.angles);
    const warp = 1 + Math.sin(time * 0.3) * d.warp * CIRCLE.distortion + pulse * 0.18;
    c.save(); c.scale(warp, warp); c.globalAlpha = 0.8 * d.motifs.tesseract; c.strokeStyle = gold[2]; c.lineWidth = 0.9 / r;
    c.beginPath(); for (const [a, b] of TESSERACT_EDGES) line(vertices[a], vertices[b]); c.stroke();
    c.fillStyle = gold[4];
    for (const p of vertices) c.fillRect(p.x - 0.004, p.y - 0.004, 0.008, 0.008);
    c.restore();
    }
    if (!reduced) for (const [index, agent] of this.trails.agents.entries()) {
      const activity = Math.min(1, Math.max(0, this.trails.agents.length * (0.55 + d.energy * 0.35 + pulse * 0.5) - index));
      const fade = activity * Math.min(1, agent.age / 0.4, (agent.life - agent.age) / 0.5);
      if (fade <= 0) continue;
      c.lineWidth = 1 / r;
      for (let i = 1; i < agent.history.length; i++) {
        c.globalAlpha = (i / agent.history.length) ** 2 * (0.45 + pulse * 0.5) * fade;
        c.strokeStyle = gold[3]; c.beginPath();
        line(location(agent.history[i - 1], d, orbitTime), location(agent.history[i], d, orbitTime)); c.stroke();
      }
      const p = location(agent, d, orbitTime);
      c.globalAlpha = fade; c.fillStyle = gold[4]; c.fillRect(p.x - 0.005, p.y - 0.005, 0.01, 0.01);
    }
    // Quiet static highlights also make reduced-motion formations complete.
    c.globalAlpha = 0.9 * d.motifs.voronoi; c.fillStyle = gold[3];
    for (let i = 0; i < d.sites.length; i += 3) { const p = d.sites[i]; c.fillRect(p.x, p.y, 0.007, 0.007); }
    c.globalAlpha = 1;
    this.canvas.dataset.trails = String(this.trails.agents.length);
  }
}
