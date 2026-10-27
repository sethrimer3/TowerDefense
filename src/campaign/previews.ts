/** One lazily used native renderer, at most thirty cached preview snapshots. */
import { DefendRenderer } from "../defend/render.ts";
import { onCityArtLoaded } from "../defend/city-layer.ts";
import { pixelArtOn } from "../defend/pixel-sprites.ts";
import { ambushField } from "./battlefield.ts";
import { AMBUSH_LEVELS } from "./levels.ts";
import { drawEntryArrow } from "./entry-arrow.ts";
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
  r.draw(field.map, null, null, { area: level.area, grid: 0, weather: null, night: 0, now: 0, reduceMotion: true, effects: false });
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
