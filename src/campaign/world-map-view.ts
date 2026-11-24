/** The Ambush world map on the page: the painted sheet in a scroller, the levels as buttons on
 * their plinths with names and stars, the zone names, and the dotted way drawing itself to each
 * newly opened level before its marker pops up. Lays out along the window's longer side. */
import { AMBUSH_LEVELS, type AmbushProgress } from "./levels.ts";
import { iconImg } from "./ambush-icons.ts";
import { dots, mapZones, pathShown, visibleLevels, worldLayout, type Axis, type WorldLayout } from "./world-map.ts";
import { COMPASS, MARKER_DISC, markerSprite, paintDot, paintWorld, type Rect } from "./world-map-art.ts";
import { t } from "../i18n/index.ts";

const DOT_GAP = 6,
  DOT_SKIP = 9,
  DRAW_MS = 900,
  POP_MS = 320;

const image = (px: Uint32Array, w: number, h: number) => new ImageData(new Uint8ClampedArray(px.buffer as ArrayBuffer), w, h);

let painted: { key: string; px: Uint32Array } | undefined;

export type MapOptions = { reduceMotion: () => boolean; open: (index: number) => void; seen: () => void };

export class WorldMapView {
  private observer?: ResizeObserver;
  private key = "";
  private raf = 0;
  private timer = 0;
  private layout?: WorldLayout;
  private scale = 2;
  private panned = false;
  constructor(
    private scroller: HTMLElement,
    private progress: AmbushProgress,
    private options: MapOptions,
  ) {
    this.observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.build()) : undefined;
    this.observer?.observe(scroller);
    this.wire();
    this.build();
  }
  destroy() {
    this.observer?.disconnect();
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
  }
  private build() {
    const cw = this.scroller.clientWidth,
      ch = this.scroller.clientHeight;
    if (!cw || !ch) return;
    const axis: Axis = cw > ch * 1.05 ? "x" : "y",
      cross = axis === "y" ? cw : ch,
      scale = Math.max(2, Math.floor(cross / 190)),
      across = Math.floor(cross / scale),
      key = `${axis}:${scale}:${across}`;
    if (key === this.key) return;
    const first = !this.key;
    this.key = key;
    this.scale = scale;
    this.scroller.dataset.axis = axis;
    const zones = mapZones(),
      layout = (this.layout = worldLayout(zones, axis, across, axis === "y" ? 190 : 175)),
      progress = this.progress,
      shown = new Set(visibleLevels(progress)),
      seen = Math.max(1, progress.seen ?? shown.size - 1),
      fresh = this.options.reduceMotion() ? [] : [...shown].filter((i) => i >= seen && i > 0).sort((a, b) => a - b);
    const sheet = document.createElement("div");
    sheet.className = "ambush-map-sheet";
    sheet.style.width = `${layout.w * scale}px`;
    sheet.style.height = `${layout.h * scale}px`;
    sheet.style.setProperty("--map-scale", String(scale));
    sheet.innerHTML = `<canvas class="ambush-map-ground" width="${layout.w}" height="${layout.h}"></canvas><canvas class="ambush-map-path" width="${layout.w}" height="${layout.h}"></canvas>${layout.zones
      .map((zone, k) => {
        const stars = zone.levels.reduce((n, i) => n + (progress.stars[AMBUSH_LEVELS[i].id] ?? 0), 0),
          reached = zone.levels.some((i) => shown.has(i));
        return `<div class="ambush-map-zone${reached ? "" : " unreached"}" data-zone="${k}" style="--area-color:${zone.color};--area-dark:${zone.dark}"><strong>${zone.name}</strong><small>${iconImg("star", Math.max(1, Math.round(scale * 0.45)))} ${stars}/${zone.levels.length * 3}</small></div>`;
      })
      .join("")}${layout.nodes
      .map((node) => {
        const level = AMBUSH_LEVELS[node.level],
          stars = progress.stars[level.id] ?? 0;
        return `<button class="ambush-map-node" data-level="${node.level}" aria-label="${level.name}, ${t("ambush.stars", { stars, total: 3 })}"><canvas class="ambush-map-marker"></canvas><span class="ambush-map-label"><span class="ambush-map-name">${level.name}</span>${stars ? `<span class="ambush-map-stars">${[1, 2, 3].map((n) => iconImg(n <= stars ? "star" : "slot", Math.max(2, Math.round(scale * 0.7)))).join("")}</span>` : ""}</span></button>`;
      })
      .join("")}`;
    this.scroller.replaceChildren(sheet);
    // Measure the labels, keep the land under them bare, and place each zone's name clear of its levels.
    const nodeEls = Array.from(sheet.querySelectorAll<HTMLButtonElement>(".ambush-map-node")),
      clear: Rect[] = [];
    layout.nodes.forEach((node, k) => {
      const el = nodeEls[k],
        marker = el.querySelector("canvas")!,
        sprite = markerSprite((progress.stars[AMBUSH_LEVELS[node.level].id] ?? 0) > 0 ? "won" : "next", layout.zones[node.zone].color);
      marker.width = sprite.w;
      marker.height = sprite.h;
      marker.style.width = `${sprite.w * scale}px`;
      marker.style.height = `${sprite.h * scale}px`;
      marker.getContext("2d")?.putImageData(image(sprite.px, sprite.w, sprite.h), 0, 0);
      el.style.left = `${node.x * scale}px`;
      el.style.top = `${(node.y - MARKER_DISC.y) * scale}px`;
      const label = el.querySelector<HTMLElement>(".ambush-map-label")!,
        lw = label.offsetWidth / scale,
        lh = label.offsetHeight / scale;
      clear.push({ x: node.x - lw / 2, y: node.y + (sprite.h - MARKER_DISC.y), w: lw, h: lh });
      if (!shown.has(node.level)) el.hidden = true;
      else if (fresh.includes(node.level)) el.classList.add("ambush-map-waiting");
      el.classList.toggle("ambush-map-next", !(progress.stars[AMBUSH_LEVELS[node.level].id] ?? 0));
    });
    const nodeRects = layout.nodes.map((n) => ({ x: n.x - 10, y: n.y - MARKER_DISC.y, w: 20, h: 24 })).concat(clear);
    sheet.querySelectorAll<HTMLElement>(".ambush-map-zone").forEach((el, k) => {
      const zone = layout.zones[k],
        w = el.offsetWidth / scale,
        h = el.offsetHeight / scale,
        spot = this.zoneSpot(layout, k, w, h, nodeRects);
      el.style.left = `${spot.x * scale}px`;
      el.style.top = `${spot.y * scale}px`;
      clear.push({ x: spot.x, y: spot.y, w, h });
      nodeRects.push({ x: spot.x, y: spot.y, w, h });
      void zone;
    });
    // A compass rose in the first zone, wherever its levels leave room.
    const compass = this.zoneSpot(layout, 0, COMPASS, COMPASS, nodeRects);
    clear.push({ ...compass, w: COMPASS, h: COMPASS });
    const ground = sheet.querySelector<HTMLCanvasElement>(".ambush-map-ground")!,
      paintKey = `${key}|${layout.zones.map((z) => z.area)}|${JSON.stringify(clear)}|${compass.x},${compass.y}`;
    // Painting takes a moment, so coming back from a battle reuses the last sheet.
    if (painted?.key !== paintKey) {
      const px = new Uint32Array(layout.w * layout.h);
      paintWorld(layout, px, clear, compass);
      painted = { key: paintKey, px };
    }
    const px = painted.px;
    ground.getContext("2d")?.putImageData(image(px, layout.w, layout.h), 0, 0);
    // The way: every shown stretch at once, then each new one drawn in turn and its level popping up.
    const path = sheet.querySelector<HTMLCanvasElement>(".ambush-map-path")!,
      ink = new Uint32Array(layout.w * layout.h),
      put = () => path.getContext("2d")?.putImageData(image(ink, layout.w, layout.h), 0, 0);
    const stretches = layout.paths.map((p) => dots(p, DOT_GAP, DOT_SKIP));
    stretches.forEach((d, i) => {
      if (pathShown(progress, i) && !fresh.includes(i + 1)) for (const p of d) paintDot(ink, layout.w, layout.h, p);
    });
    put();
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
    if (first) this.focus(fresh[0] ?? Math.max(...shown));
    if (fresh.length) {
      const queue = fresh.slice();
      const next = () => {
        const level = queue.shift();
        if (level === undefined) return this.options.seen();
        const d = stretches[level - 1] ?? [],
          start = performance.now();
        let drawn = 0;
        this.focus(level, true);
        const tick = (now: number) => {
          const want = Math.min(d.length, Math.ceil(((now - start) / DRAW_MS) * d.length));
          for (; drawn < want; drawn++) paintDot(ink, layout.w, layout.h, d[drawn]);
          put();
          if (drawn < d.length) this.raf = requestAnimationFrame(tick);
          else {
            const el = nodeEls[layout.nodes.findIndex((n) => n.level === level)];
            el?.classList.remove("ambush-map-waiting");
            el?.classList.add("ambush-map-pop");
            this.timer = window.setTimeout(next, POP_MS);
          }
        };
        this.raf = requestAnimationFrame(tick);
      };
      this.timer = window.setTimeout(next, 250);
    } else if (first) this.options.seen();
  }
  /** Where a zone's name sits: inside the zone, as far from its levels and their labels as it can. */
  private zoneSpot(layout: WorldLayout, k: number, w: number, h: number, avoid: Rect[]) {
    const zone = layout.zones[k];
    let best = { x: 0, y: 0 },
      score = -Infinity;
    for (let a = 0.12; a <= 0.88; a += 0.04)
      for (const c of [0.24, 0.5, 0.76]) {
        const along = zone.from + layout.zoneLen * a,
          cross = layout.across * c,
          cx = layout.axis === "y" ? cross : along,
          cy = layout.axis === "y" ? layout.length - 1 - along : cross;
        const r = { x: Math.round(Math.max(10, Math.min(layout.w - w - 10, cx - w / 2))), y: Math.round(Math.max(10, Math.min(layout.h - h - 10, cy - h / 2))), w, h };
        let s = 0;
        for (const o of avoid) {
          const gx = Math.max(0, o.x - (r.x + r.w), r.x - (o.x + o.w)),
            gy = Math.max(0, o.y - (r.y + r.h), r.y - (o.y + o.h));
          const gap = Math.hypot(gx, gy);
          s -= gap === 0 ? 1000 : 40 / (gap + 1);
        }
        for (const path of layout.paths)
          for (let i = 0; i < path.length; i += 3) if (path[i].x >= r.x - 2 && path[i].x <= r.x + r.w + 2 && path[i].y >= r.y - 2 && path[i].y <= r.y + r.h + 2) s -= 30;
        s -= Math.abs(a - 0.5) * 4;
        if (s > score) ((score = s), (best = r));
      }
    return best;
  }
  /** Scrolls a level into the middle of the view. */
  private focus(level: number, smooth = false) {
    const node = this.layout?.nodes.find((n) => n.level === level);
    if (!node) return;
    const s = this.scroller;
    s.scrollTo({ left: node.x * this.scale - s.clientWidth / 2, top: node.y * this.scale - s.clientHeight / 2, behavior: smooth ? "smooth" : "auto" });
  }
  /** Wheel turns scroll a sideways map sideways; a mouse can drag the map about; a tap opens a level. */
  private wire() {
    const s = this.scroller;
    s.addEventListener(
      "wheel",
      (e) => {
        if (s.dataset.axis === "x" && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          s.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      },
      { passive: false },
    );
    let from: { x: number; y: number; left: number; top: number } | undefined;
    s.addEventListener("pointerdown", (e) => {
      this.panned = false;
      if (e.pointerType === "mouse" && e.button === 0) from = { x: e.clientX, y: e.clientY, left: s.scrollLeft, top: s.scrollTop };
    });
    s.addEventListener("pointermove", (e) => {
      if (!from) return;
      const dx = e.clientX - from.x,
        dy = e.clientY - from.y;
      if (!this.panned && Math.hypot(dx, dy) < 5) return;
      this.panned = true;
      s.scrollLeft = from.left - dx;
      s.scrollTop = from.top - dy;
    });
    const end = () => (from = undefined);
    s.addEventListener("pointerup", end);
    s.addEventListener("pointerleave", end);
    s.addEventListener("click", (e) => {
      const node = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-level]");
      if (this.panned) return void ((this.panned = false), e.preventDefault());
      if (node) this.options.open(Number(node.dataset.level));
    });
  }
}
