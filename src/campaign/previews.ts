/** One lazily used native renderer for Siege castle previews, at most thirty cached snapshots. */
import { DefendRenderer } from "../defend/render.ts";
import { CELLS_W } from "../defend/grid.ts";
import { onCityArtLoaded } from "../defend/city-layer.ts";
import { pixelArtOn } from "../defend/pixel-sprites.ts";
import type { CastleSnapshot } from "./castles.ts";
import { siegeField } from "./battlefield.ts";
import { artLook } from "../defend/tower-art.ts";
const cache = new Map<string, HTMLCanvasElement>(),
  repaints = new Set<() => void>();
let renderer: DefendRenderer | undefined, lastArt: boolean | undefined;
onCityArtLoaded(() => {
  cache.clear();
  for (const repaint of repaints) repaint();
});
/** Match cards share one native preview renderer and its bounded image cache. */
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
      r.cam.x = r.canvas.width / 2 - (CELLS_W / 2) * r.px * 1.5;
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
