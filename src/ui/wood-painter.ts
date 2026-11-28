// Paints every oak panel and button a board of its own size from
// `wood-art.ts`, so a tall column or a wide bar shows one continuous plank
// rather than a tile repeating, its grain along the longer side. Each element whose style uses `var(--wood)`
// gets `--wood` set on it: its own image first, then theme.css's tile and the
// older noise-grained wood underneath, which show while it is painted and if
// it ever fails. Pseudo-elements keep the tile. Boards are seeded by size, so
// a redraw of the same element paints the same grain. Off under the Pixel-art
// wood setting off (`.classic-wood`), and in a page without a canvas.

import { drawBoard, woodSeed, WOOD_PALETTE, WOOD_SCALE } from "./wood-art.ts";

/** Boards kept for reuse, by size. */
const CACHE_LIMIT = 160;
/** The tallest or widest board painted, in art pixels; past it the board repeats. */
const MAX_ART = 1200;
/** How long DOM changes gather before a rescan. */
const SCAN_DELAY_MS = 120;

const RGB = WOOD_PALETTE.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
const cache = new Map<string, string>();

/** A board `w` × `h` art pixels as a PNG data URL, `scale` device pixels to an art pixel. */
function boardUrl(w: number, h: number, scale: number): string {
  const key = `${w}x${h}@${scale}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const px = drawBoard(w, h, woodSeed(key));
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const g = canvas.getContext("2d");
  if (!g) return "";
  const image = g.createImageData(canvas.width, canvas.height);
  const data = image.data;
  for (let y = 0; y < canvas.height; y++) {
    const row = Math.floor(y / scale) * w;
    for (let x = 0; x < canvas.width; x++) {
      const c = RGB[px[row + Math.floor(x / scale)]];
      const o = (y * canvas.width + x) * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  const url = canvas.toDataURL("image/png");
  cache.set(key, url);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return url;
}

/** The comma-separated selectors of every style rule that uses `var(--wood)`, pseudo-elements left out. */
export function woodSelectors(rules: Iterable<{ selectorText: string; cssText: string }>): string[] {
  const out = new Set<string>();
  for (const rule of rules) {
    if (!rule.cssText.includes("var(--wood)")) continue;
    for (const part of rule.selectorText.split(",")) {
      const s = part.trim();
      if (!s || /::|:(before|after)\b/.test(s)) continue;
      out.add(s);
    }
  }
  return [...out];
}

function styleRules(): { selectorText: string; cssText: string }[] {
  const found: { selectorText: string; cssText: string }[] = [];
  const walk = (list: CSSRuleList) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSStyleRule) found.push(rule);
      else if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try { walk(sheet.cssRules); } catch { /* A sheet from another origin can't be read. */ }
  }
  return found;
}

/** Starts painting; safe to call once at start-up. */
export function installWoodPainter(): void {
  if (typeof ResizeObserver === "undefined" || !document.createElement("canvas").getContext) return;
  const root = document.documentElement;
  const painted = new Set<HTMLElement>();
  const watched = new WeakSet<Element>();
  let selector = "";
  let fallback = "";

  const classic = () => root.classList.contains("classic-wood");

  const paint = (el: HTMLElement) => {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h || classic()) return;
    const aw = Math.min(MAX_ART, Math.ceil(w / WOOD_SCALE)), ah = Math.min(MAX_ART, Math.ceil(h / WOOD_SCALE));
    const scale = Math.max(WOOD_SCALE, Math.round(WOOD_SCALE * (window.devicePixelRatio || 1)));
    const url = boardUrl(aw, ah, scale);
    if (!url) return;
    el.style.setProperty("--wood", `url("${url}") 0 0 / ${aw * WOOD_SCALE}px ${ah * WOOD_SCALE}px, ${fallback}`);
    painted.add(el);
  };

  const resized = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      if (!el.isConnected) {
        resized.unobserve(el);
        painted.delete(el);
        continue;
      }
      paint(el);
    }
  });

  const scan = () => {
    if (!selector) {
      const list = woodSelectors(styleRules());
      if (!list.length) return;
      // Drop any selector the browser can't match on its own (`:hover` and the like still match).
      selector = list.filter((s) => { try { document.querySelector(s); return true; } catch { return false; } }).join(",");
      fallback = getComputedStyle(root).getPropertyValue("--wood").trim();
      if (!selector || !fallback) return;
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (watched.has(el)) continue;
      watched.add(el);
      resized.observe(el);
    }
    for (const el of painted) if (!el.isConnected) { resized.unobserve(el); painted.delete(el); }
  };

  let timer = 0;
  const later = () => {
    if (!timer) timer = window.setTimeout(() => { timer = 0; scan(); }, SCAN_DELAY_MS);
  };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(() => {
    if (classic()) {
      for (const el of painted) el.style.removeProperty("--wood");
      painted.clear();
    } else {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector || ":not(*)"))) paint(el);
    }
  }).observe(root, { attributes: true, attributeFilter: ["class"] });
  scan();
}
