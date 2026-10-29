/** One lazily used native renderer, at most thirty cached preview snapshots. */
import { DefendRenderer } from "../defend/render.ts";
import { onCityArtLoaded } from "../defend/city-layer.ts";
import { pixelArtOn } from "../defend/pixel-sprites.ts";
import type { CastleSnapshot } from "./castles.ts";
import { siegeField } from "./battlefield.ts";
import { ambushField } from "./ambush-field.ts";
import { AMBUSH_LEVELS } from "./levels.ts";
import { drawEntryArrow } from "./entry-arrow.ts";
import { artLook } from "../defend/tower-art.ts";
const cache = new Map<string, HTMLCanvasElement>(),
  repaints = new Set<() => void>();
let renderer: DefendRenderer | undefined, lastArt: boolean | undefined;
onCityArtLoaded(() => {
  cache.clear();
  for (const repaint of repaints) repaint();
});
function snapshot(index: number) {
  const art = pixelArtOn();
  if (art !== lastArt) {
    cache.clear();
    lastArt = art;
  }
  const level = AMBUSH_LEVELS[index],
    key = level.id;
  let old = cache.get(key);
  if (old) return old;
  if (!renderer) {
    const c = document.createElement("canvas");
    c.style.cssText = "position:fixed;left:-1000px;top:0;width:144px;height:208px;pointer-events:none;";
    c.setAttribute("aria-hidden", "true");
    document.body.append(c);
    renderer = new DefendRenderer(c);
  }
  const field = ambushField(index),
    r = renderer;
  r.resize(144, 208);
  r.resetCam();
  r.draw(field.map, null, null, {
    area: level.area,
    grid: 0,
    weather: null,
    night: 0,
    now: 0,
    reduceMotion: true,
    effects: false,
  });
  const c = r.canvas.getContext("2d")!;
  c.save();
  c.setTransform(r.cam.s, 0, 0, r.cam.s, r.cam.x, r.cam.y);
  for (const lane of field.lanes) drawEntryArrow(c, lane[0], lane[1], r.px, 0, true);
  c.restore();
  old = document.createElement("canvas");
  old.width = r.canvas.width;
  old.height = r.canvas.height;
  old.getContext("2d")!.drawImage(r.canvas, 0, 0);
  cache.set(key, old);
  return old;
}
export function observePreviews(root: HTMLElement) {
  const visible = new Set<HTMLCanvasElement>(),
    pending = new Set<HTMLCanvasElement>();
  let timer: ReturnType<typeof setTimeout> | undefined,
    closed = false;
  const pump = () => {
    timer = undefined;
    const canvas = pending.values().next().value as HTMLCanvasElement | undefined;
    if (!canvas || closed) return;
    pending.delete(canvas);
    if (canvas.isConnected) {
      const image = snapshot(Number(canvas.dataset.preview));
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      canvas.dataset.ready = "true";
    }
    if (pending.size) timer = setTimeout(pump, 16);
  };
  const queue = (canvas: HTMLCanvasElement) => {
    pending.add(canvas);
    timer ??= setTimeout(pump, 0);
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const canvas = e.target as HTMLCanvasElement;
        if (e.isIntersecting) {
          visible.add(canvas);
          queue(canvas);
        } else visible.delete(canvas);
      }
    },
    { root, rootMargin: "100px" },
  );
  root.querySelectorAll<HTMLCanvasElement>("[data-preview]").forEach((c) => observer.observe(c));
  // Native textures can finish loading after the first card is visible.
  const repaint = () => {
    if (closed) return;
    for (const c of visible) queue(c);
  };
  repaints.add(repaint);
  return () => {
    closed = true;
    repaints.delete(repaint);
    observer.disconnect();
    if (timer) clearTimeout(timer);
    visible.clear();
    pending.clear();
  };
}

/** Match cards reuse the native preview renderer and its bounded image cache. */
export function observeSiegePreview(canvas: HTMLCanvasElement, castle: CastleSnapshot) {
  let closed = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  const paint = () => {
    timer = undefined;
    if (closed || !canvas.isConnected) return;
    const art = pixelArtOn();
    if (art !== lastArt) {
      cache.clear();
      lastArt = art;
    }
    const key = "siege:" + castle.id + ":" + castle.seed + ":" + JSON.stringify(castle),
      cached = cache.get(key);
    let image = cached;
    if (!image) {
      if (!renderer) {
        const offscreen = document.createElement("canvas");
        offscreen.style.cssText = "position:fixed;left:-1000px;top:0;width:144px;height:208px;pointer-events:none;";
        offscreen.setAttribute("aria-hidden", "true");
        document.body.append(offscreen);
        renderer = new DefendRenderer(offscreen);
      }
      const field = siegeField(castle, []),
        r = renderer;
      r.resize(144, 208);
      r.resetCam();
      r.cam.s = 1.5;
      r.cam.x = r.canvas.width / 2 - 36 * r.px * 1.5;
      r.cam.y = r.canvas.width / 2 - 30 * r.px * 1.5;
      r.draw(field.map, null, null, {
        area: "moss",
        grid: 0,
        weather: null,
        night: 0,
        now: 0,
        reduceMotion: true,
        effects: false,
        looks: Object.fromEntries(castle.castle.layout.structures.map(s => [s.uid, artLook(s.kind, s.path)]).filter(([, look]) => look)),
        gate: castle.castle.gateRanks,
      });
      image = document.createElement("canvas");
      image.width = image.height = r.canvas.width;
      image.getContext("2d")!.drawImage(r.canvas, 0, 0, image.width, image.height, 0, 0, image.width, image.height);
      if (cache.size >= 30) cache.delete(cache.keys().next().value!);
      cache.set(key, image);
    }
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    canvas.dataset.ready = "true";
  };
  const queue = () => {
    if (!closed) timer ??= setTimeout(paint, 0);
  };
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) queue();
  });
  observer.observe(canvas);
  repaints.add(queue);
  return () => {
    closed = true;
    observer.disconnect();
    repaints.delete(queue);
    if (timer) clearTimeout(timer);
  };
}
