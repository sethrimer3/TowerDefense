/** A living upgrade tree: nodes on branches that hold their shape loosely.
 * Each node sits on a spring to its place in a tidy tree (the root at the
 * bottom, branches growing up), joined to its parent by another, and nodes
 * push apart when crowded, so a dragged node pulls its branch along and
 * everything eases back when let go. Nodes that leave the tree (a branch
 * cut off by a choice) shrivel and drop away; new ones sprout from their
 * parent. Drag a node to pull it, drag the background to pan, the wheel to
 * zoom; a tap picks a node and shows its card.
 *
 * Presentation only, with no game imports: the page hands it `GraphNode`s
 * (`set`) and hears back which node was picked (`onPick`). */
import { stream } from "../random.ts";

const rand = stream("effects");

/** One node as drawn. */
export type GraphNode = {
  id: string;
  parent?: string;
  /** owned: had; next: can be bought now; locked: further along. */
  state: "owned" | "next" | "locked";
  /** The node's face (an icon), as HTML. */
  face: string;
  /** A short tag under it (a price, or a numeral). */
  tag?: string;
  /** A path's colours (`hue-*` class), if any. */
  hue?: string;
};

type Body = {
  n: GraphNode;
  el: HTMLElement;
  edge?: SVGPathElement;
  x: number; y: number; vx: number; vy: number;
  hx: number; hy: number;
  /** Seconds since it began to wither, or -1 while alive. */
  dying: number;
  spin: number;
};

/** Pixels between neighbouring leaves, and between generations. */
const GAP_X = 66, GAP_Y = 74;
/** How long a cut branch takes to shrivel and fall away (s). */
const WITHER = 1.1;

export class UpgradeGraph {
  readonly el: HTMLElement;
  private readonly view: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly layer: HTMLElement;
  private bodies = new Map<string, Body>();
  private picked = "";
  private raf = 0;
  private last = 0;
  /** The view's pan (px) and zoom, eased toward the fit. */
  private pan = { x: 0, y: 0, s: 1 };
  private fit = { x: 0, y: 0, s: 1 };
  private steered = false;
  private drag: { id: string; pointer: number; x0: number; y0: number; moved: boolean; pan?: { x: number; y: number } } | null = null;
  private pinch = new Map<number, { x: number; y: number }>();

  constructor(
    host: HTMLElement,
    private readonly opts: { reduceMotion: () => boolean; onPick: (id: string) => void; paint: (el: HTMLElement) => void },
  ) {
    this.el = host;
    host.classList.add("ug");
    host.innerHTML = `<div class="ug-view"><svg class="ug-edges" xmlns="http://www.w3.org/2000/svg"></svg><div class="ug-nodes"></div></div>`;
    this.view = host.querySelector(".ug-view")!;
    this.svg = host.querySelector("svg")!;
    this.layer = host.querySelector(".ug-nodes")!;
    host.addEventListener("pointerdown", this.down);
    host.addEventListener("pointermove", this.move);
    host.addEventListener("pointerup", this.up);
    host.addEventListener("pointercancel", this.up);
    host.addEventListener("wheel", this.wheel, { passive: false });
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.el.removeEventListener("pointerdown", this.down);
    this.el.removeEventListener("pointermove", this.move);
    this.el.removeEventListener("pointerup", this.up);
    this.el.removeEventListener("pointercancel", this.up);
    this.el.removeEventListener("wheel", this.wheel);
    this.el.innerHTML = "";
  }

  /** The tree as it is now: new nodes sprout, gone ones wither. */
  set(nodes: GraphNode[], picked: string) {
    const homes = layout(nodes), still = this.opts.reduceMotion();
    const live = new Set(nodes.map((n) => n.id));
    for (const [id, b] of this.bodies) {
      if (live.has(id) || b.dying >= 0) continue;
      if (still) this.drop(id);
      else {
        b.dying = 0;
        b.spin = (rand() - 0.5) * 120;
        b.el.classList.add("withering");
        b.edge?.classList.add("withering");
      }
    }
    for (const n of nodes) {
      const [hx, hy] = homes.get(n.id)!;
      let b = this.bodies.get(n.id);
      if (!b || b.dying >= 0) {
        if (b) this.drop(n.id);
        const from = n.parent ? this.bodies.get(n.parent) : undefined;
        const el = document.createElement("button");
        el.type = "button";
        el.className = "ug-node";
        el.dataset.node = n.id;
        const edge = n.parent ? (document.createElementNS("http://www.w3.org/2000/svg", "path") as SVGPathElement) : undefined;
        if (edge) this.svg.prepend(edge);
        this.layer.append(el);
        b = { n, el, edge, x: still || !from ? hx : from.x, y: still || !from ? hy : from.y, vx: 0, vy: 0, hx, hy, dying: -1, spin: 0 };
        if (!still && from) {
          el.classList.add("sprouting");
          edge?.classList.add("sprouting");
        }
        this.bodies.set(n.id, b);
      }
      const changed = b.n.state !== n.state || b.n.face !== n.face || b.n.tag !== n.tag || !b.el.innerHTML;
      b.n = n;
      b.hx = hx;
      b.hy = hy;
      if (changed) {
        b.el.innerHTML = `${n.face}${n.tag ? `<small>${n.tag}</small>` : ""}`;
        this.opts.paint(b.el);
      }
      b.el.className = `ug-node ${n.state}${n.hue ? ` ${n.hue}` : ""}${b.el.classList.contains("sprouting") ? " sprouting" : ""}`;
      b.el.setAttribute("aria-pressed", String(n.id === picked));
      if (b.edge) b.edge.setAttribute("class", `ug-edge ${n.state}${n.hue ? ` ${n.hue}` : ""}${b.edge.classList.contains("sprouting") ? " sprouting" : ""}`);
    }
    this.pick(picked);
    this.refit(!this.steered);
    if (still) this.snap();
  }

  /** Marks `id` as the picked node. */
  pick(id: string) {
    this.picked = id;
    for (const [nid, b] of this.bodies) b.el.classList.toggle("picked", nid === id);
  }

  /** Fits the whole tree in view (eased unless `now`). */
  refit(now = false) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of this.bodies.values()) {
      if (b.dying >= 0) continue;
      x0 = Math.min(x0, b.hx); x1 = Math.max(x1, b.hx);
      y0 = Math.min(y0, b.hy); y1 = Math.max(y1, b.hy);
    }
    if (x0 > x1) return;
    const w = this.el.clientWidth || 300, h = this.el.clientHeight || 300, pad = 46;
    const s = Math.min(1.25, (w - pad * 2) / Math.max(1, x1 - x0), (h - pad * 2) / Math.max(1, y1 - y0));
    this.fit = { s, x: w / 2 - ((x0 + x1) / 2) * s, y: h / 2 - ((y0 + y1) / 2) * s };
    if (now) {
      this.pan = { ...this.fit };
      this.steered = false;
    }
  }

  private drop(id: string) {
    const b = this.bodies.get(id);
    if (!b) return;
    b.el.remove();
    b.edge?.remove();
    this.bodies.delete(id);
  }

  private snap() {
    for (const b of this.bodies.values()) {
      b.x = b.hx;
      b.y = b.hy;
      b.el.classList.remove("sprouting");
      b.edge?.classList.remove("sprouting");
    }
    this.pan = { ...this.fit };
    this.draw();
  }

  private tick = (t: number) => {
    if (!this.raf) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(1 / 30, this.last ? (t - this.last) / 1000 : 0);
    this.last = t;
    if (!this.el.isConnected || this.el.offsetParent === null) return;
    if (this.opts.reduceMotion()) {
      for (const [id, b] of this.bodies) if (b.dying >= 0) this.drop(id);
      for (const b of this.bodies.values()) if (!(this.drag?.id === b.n.id && this.drag.moved)) { b.x = b.hx; b.y = b.hy; }
    } else this.step(dt);
    if (!this.steered) {
      const k = Math.min(1, dt * 6);
      this.pan.x += (this.fit.x - this.pan.x) * k;
      this.pan.y += (this.fit.y - this.pan.y) * k;
      this.pan.s += (this.fit.s - this.pan.s) * k;
    }
    this.draw();
  };

  /** Springs home and along each branch, crowding apart, damping. */
  private step(dt: number) {
    if (!dt) return;
    const live = [...this.bodies.values()].filter((b) => b.dying < 0);
    for (const b of live) {
      let ax = (b.hx - b.x) * 9, ay = (b.hy - b.y) * 9;
      const p = b.n.parent ? this.bodies.get(b.n.parent) : undefined;
      if (p) {
        // Keep the branch's length and lean to its parent.
        const rx = b.hx - p.hx, ry = b.hy - p.hy;
        ax += (p.x + rx - b.x) * 16;
        ay += (p.y + ry - b.y) * 16;
      }
      for (const o of live) {
        if (o === b) continue;
        const dx = b.x - o.x, dy = b.y - o.y, d2 = dx * dx + dy * dy;
        if (d2 > 2500 || d2 < 0.01) continue;
        const d = Math.sqrt(d2), f = (50 - d) * 30;
        ax += (dx / d) * f;
        ay += (dy / d) * f;
      }
      b.vx = (b.vx + ax * dt) * Math.exp(-7 * dt);
      b.vy = (b.vy + ay * dt) * Math.exp(-7 * dt);
    }
    for (const b of live) {
      if (this.drag?.id === b.n.id && this.drag.moved) { b.vx = b.vy = 0; continue; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    for (const [id, b] of this.bodies) {
      if (b.dying < 0) continue;
      b.dying += dt;
      b.vy += 420 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.dying >= WITHER) this.drop(id);
    }
    for (const b of live) {
      if (b.el.classList.contains("sprouting") && Math.abs(b.x - b.hx) + Math.abs(b.y - b.hy) < 6) {
        b.el.classList.remove("sprouting");
        b.edge?.classList.remove("sprouting");
      }
    }
  }

  private draw() {
    const { x: px, y: py, s } = this.pan;
    this.view.style.transform = `translate(${px}px, ${py}px) scale(${s})`;
    for (const b of this.bodies.values()) {
      const w = b.dying >= 0 ? Math.min(1, b.dying / WITHER) : 0;
      b.el.style.transform = `translate(${b.x}px, ${b.y}px) translate(-50%, -50%)${w ? ` rotate(${b.spin * w}deg) scale(${1 - 0.75 * w})` : ""}`;
      const p = b.n.parent ? this.bodies.get(b.n.parent) : undefined;
      if (b.edge && p) {
        // A branch: a slight curve, sagging more as it withers.
        const mx = (p.x + b.x) / 2 + (b.y - p.y) * 0.08, my = (p.y + b.y) / 2 + 6 + w * 30;
        b.edge.setAttribute("d", `M${p.x.toFixed(1)},${p.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`);
      } else if (b.edge) b.edge.setAttribute("d", "");
    }
  }

  // ── Pointers ──────────────────────────────────────────────────────────
  private local(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.pan.x) / this.pan.s, y: (e.clientY - r.top - this.pan.y) / this.pan.s };
  }

  private down = (e: PointerEvent) => {
    if ((e.target as Element).closest("[data-ug-ignore]")) return;
    this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch.size > 1) {
      this.drag = null;
      return;
    }
    const node = (e.target as Element).closest<HTMLElement>(".ug-node");
    const id = node?.dataset.node ?? "";
    this.drag = { id, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, ...(id ? {} : { pan: { x: this.pan.x, y: this.pan.y } }) };
    this.el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  private move = (e: PointerEvent) => {
    const prev = this.pinch.get(e.pointerId);
    if (prev && this.pinch.size === 2) {
      // Two fingers: zoom about their middle.
      const [a, b] = [...this.pinch.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [c, d] = [...this.pinch.values()];
      const after = Math.hypot(c.x - d.x, c.y - d.y);
      if (before > 0) this.zoom(after / before, (c.x + d.x) / 2, (c.y + d.y) / 2);
      return;
    }
    if (prev) this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = this.drag;
    if (!g || g.pointer !== e.pointerId) return;
    if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 5) g.moved = true;
    if (!g.moved) return;
    if (g.pan) {
      this.steered = true;
      this.pan.x = g.pan.x + e.clientX - g.x0;
      this.pan.y = g.pan.y + e.clientY - g.y0;
      if (this.opts.reduceMotion()) this.draw();
      return;
    }
    const b = this.bodies.get(g.id);
    if (!b) return;
    const p = this.local(e);
    b.x = p.x;
    b.y = p.y;
    b.el.classList.add("dragged");
    if (this.opts.reduceMotion()) this.draw();
  };

  private up = (e: PointerEvent) => {
    this.pinch.delete(e.pointerId);
    const g = this.drag;
    if (!g || g.pointer !== e.pointerId) return;
    this.drag = null;
    const b = this.bodies.get(g.id);
    b?.el.classList.remove("dragged");
    if (e.type === "pointerup" && !g.moved && g.id) this.opts.onPick(g.id);
    if (this.opts.reduceMotion()) this.snap();
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  };

  private zoom(f: number, cx: number, cy: number) {
    const r = this.el.getBoundingClientRect(), s = Math.max(0.35, Math.min(2.5, this.pan.s * f));
    const k = s / this.pan.s, x = cx - r.left, y = cy - r.top;
    this.pan = { s, x: x - (x - this.pan.x) * k, y: y - (y - this.pan.y) * k };
    this.steered = true;
    if (this.opts.reduceMotion()) this.draw();
  }
}

/** Each node's place in a tidy tree: leaves side by side, each parent over
 * the middle of its children, the root at the bottom. */
export function layout(nodes: readonly { id: string; parent?: string }[]): Map<string, [number, number]> {
  const kids = new Map<string, string[]>(), at = new Map<string, [number, number]>();
  const ids = new Set(nodes.map((n) => n.id));
  const roots: string[] = [];
  for (const n of nodes) {
    if (n.parent && ids.has(n.parent)) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n.id]);
    else roots.push(n.id);
  }
  let leaf = 0;
  const place = (id: string, depth: number): number => {
    const ks = kids.get(id) ?? [];
    const x = ks.length ? ks.map((k) => place(k, depth + 1)).reduce((a, b) => a + b, 0) / ks.length : leaf++ * GAP_X;
    at.set(id, [x, -depth * GAP_Y]);
    return x;
  };
  for (const r of roots) place(r, 0);
  // Centred on the first root.
  const [ox] = at.get(roots[0]) ?? [0, 0];
  for (const [id, [x, y]] of at) at.set(id, [x - ox, y]);
  return at;
}
