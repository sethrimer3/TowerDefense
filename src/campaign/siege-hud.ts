/** The Siege battle's corner pieces over the board: each side's flag hung
 * from a T-shaped pole and waving gently (the opponent's top left, the
 * player's bottom right, each beside a parchment plate with the name and
 * rank), and a box bottom left counting the player's remaining troops by
 * kind. Presentation only: the battle never reads any of it. */
import { t } from "../i18n/index.ts";
import { FLAG_WIDTH, FLAG_HEIGHT, flagPixels, escapeText, type PlayerProfile, type Flag } from "../profile/model.ts";
import { paintTroopBadge } from "../defend/garrison-icons.ts";
import { OUTLINE } from "../defend/pixel-fx.ts";
import type { Soldier } from "../defend/sim.ts";
import { rankBadge } from "./siege-entry.ts";

/** The banner stand in art pixels: the crossbar along the top, the post down
 * its middle to a foot, the flag hanging from the bar in front of the post. */
export const POLE = { w: 28, h: 46, bar: 2, post: 13, foot: 43, flagX: 6, flagY: 5 };
/** How far the flag's hem swings, in art pixels, how quickly it waves and
 * how often it is redrawn. */
const WAVE = { swing: 2.2, speed: 1.6, ripple: 0.32, fps: 15 };
const WOOD = { light: 0xa0703c, dark: 0x6b4423, deep: 0x4a2e17 };
const BRASS = { light: 0xe8c66a, dark: 0xa9802f };
const BLACK = parseInt(OUTLINE.slice(1), 16);

/** A name plate with its banner pole; the canvas is painted by `Banners`. */
export function bannerPlate(profile: PlayerProfile, mmr: number, position: "top" | "bottom") {
  return (
    '<div class="siege-name-plate siege-name-plate-' +
    position +
    '"><canvas class="siege-banner" width="' +
    POLE.w +
    '" height="' +
    POLE.h +
    '" role="img" aria-label="' +
    escapeText(profile.name) +
    '"></canvas><div class="siege-plate-text"><strong class="' +
    (position === "bottom" ? "siege-profile-name" : "siege-opponent-name") +
    '">' +
    escapeText(profile.name) +
    "</strong>" +
    rankBadge(mmr) +
    "</div></div>"
  );
}

/** The stand's own pixels (0 for none), lit from the upper left. */
function standPixels() {
  const px = new Uint32Array(POLE.w * POLE.h);
  const set = (x: number, y: number, w: number, h: number, c: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px[j * POLE.w + i] = c | 0xff000000;
  };
  // The post, lit on its left, down to a broad foot.
  set(POLE.post, POLE.bar, 1, POLE.foot - POLE.bar, WOOD.light);
  set(POLE.post + 1, POLE.bar, 1, POLE.foot - POLE.bar, WOOD.dark);
  set(POLE.post - 3, POLE.foot, 8, 1, WOOD.light);
  set(POLE.post - 4, POLE.foot + 1, 10, 1, WOOD.deep);
  // The crossbar, and a brass knob at each end.
  set(3, POLE.bar, POLE.w - 6, 1, WOOD.light);
  set(3, POLE.bar + 1, POLE.w - 6, 1, WOOD.dark);
  for (const x of [1, POLE.w - 3]) {
    set(x, POLE.bar, 2, 1, BRASS.light);
    set(x, POLE.bar + 1, 2, 1, BRASS.dark);
  }
  return px;
}

/** Paints `layer` over `out` inside a one-pixel black ring of its own, so
 * the flag keeps its outline where it hangs over the post. */
function stamp(out: Uint32Array, layer: Uint32Array) {
  const w = POLE.w, h = POLE.h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (layer[y * w + x]) continue;
      const near =
        (x > 0 && layer[y * w + x - 1]) ||
        (x < w - 1 && layer[y * w + x + 1]) ||
        (y > 0 && layer[(y - 1) * w + x]) ||
        (y < h - 1 && layer[(y + 1) * w + x]);
      if (near) out[y * w + x] = BLACK | 0xff000000;
    }
  for (let i = 0; i < layer.length; i++) if (layer[i]) out[i] = layer[i];
}

const shade = (rgb: number, k: number) => {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f(rgb >>> 16) << 16) | (f((rgb >>> 8) & 255) << 8) | f(rgb & 255);
};

/** The flag at time `s` seconds: fixed along the bar, each row further
 * down swung further sideways in a slow travelling wave, and columns lit
 * and shaded by a ripple running across the cloth. */
export function wavingFlag(pixels: Uint32Array, s: number, phase: number) {
  const layer = new Uint32Array(POLE.w * POLE.h);
  for (let r = 0; r < FLAG_HEIGHT; r++) {
    const hang = r / (FLAG_HEIGHT - 1),
      dx = Math.round(WAVE.swing * hang * Math.sin(s * WAVE.speed + phase - r * WAVE.ripple));
    for (let x = 0; x < FLAG_WIDTH; x++) {
      const light = 1 + 0.13 * hang * Math.sin(s * WAVE.speed * 1.7 + phase + x * 0.7 - r * 0.25);
      const ax = POLE.flagX + x + dx,
        ay = POLE.flagY + r;
      if (ax >= 0 && ax < POLE.w) layer[ay * POLE.w + ax] = shade(pixels[r * FLAG_WIDTH + x], light) | 0xff000000;
    }
  }
  // Two rings holding it to the bar.
  for (const x of [POLE.flagX + 2, POLE.flagX + FLAG_WIDTH - 3]) layer[(POLE.flagY - 1) * POLE.w + x] = BRASS.dark | 0xff000000;
  return layer;
}

/** Keeps the page's banner canvases waving on the wall clock (held still
 * under Reduce Motion), redrawing at most `WAVE.fps` times a second. */
export class Banners {
  private readonly stand = standPixels();
  private items: { canvas: HTMLCanvasElement; flag: Uint32Array; phase: number }[] = [];
  private last = -Infinity;
  attach(root: HTMLElement, flags: { top: Flag; bottom: Flag }) {
    this.items = [];
    for (const position of ["top", "bottom"] as const) {
      const canvas = root.querySelector<HTMLCanvasElement>(".siege-name-plate-" + position + " .siege-banner");
      if (canvas) this.items.push({ canvas, flag: flagPixels(flags[position]), phase: position === "top" ? 0 : 2.1 });
    }
    this.last = -Infinity;
  }
  draw(now: number, reduced: boolean) {
    if (!this.items.length || (reduced && this.last > -Infinity) || now - this.last < 1000 / WAVE.fps) return;
    this.last = now;
    const s = reduced ? 0 : now / 1000;
    for (const { canvas, flag, phase } of this.items) {
      const out = new Uint32Array(POLE.w * POLE.h);
      stamp(out, this.stand);
      stamp(out, wavingFlag(flag, s, phase));
      const c = canvas.getContext("2d");
      if (!c) continue;
      const img = c.createImageData(POLE.w, POLE.h);
      for (let i = 0; i < out.length; i++) {
        const v = out[i];
        if (!v) continue;
        img.data[i * 4] = (v >>> 16) & 255;
        img.data[i * 4 + 1] = (v >>> 8) & 255;
        img.data[i * 4 + 2] = v & 255;
        img.data[i * 4 + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    }
  }
}

/** Every troop kind's name, whose initials label it in the box. */
export const TROOP_NAMES: Record<Soldier["kind"], string> = {
  sword: "Swordsman",
  archer: "Archer",
  mage: "Fire mage",
  valkyrie: "Valkyrie",
  darkWizard: "Dark wizard",
  undead: "Risen dead",
  reinforcement: "Reinforcement",
  brawler: "Brawler",
  slinger: "Stone thrower",
  sniper: "Sniper",
  musketeer: "Musketeer",
  gunner: "Gunner",
  machineGunner: "Machine gunner",
  gatlingGunner: "Gatling gunner",
  railSniper: "Laser sniper",
  rocketeer: "Rocketeer",
  spearman: "Spearman",
  hoplite: "Hoplite",
  javelineer: "Javelineer",
  lancer: "Lancer",
  hero: "Hero",
  shade: "Shade",
  assassin: "Assassin",
};

/** Two letters: each word's first, or a one-word name's first two. */
export function initials(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

/** Living troops by kind, most numerous first (ties in catalog order). */
export function troopCounts(soldiers: readonly Soldier[]) {
  const counts = new Map<Soldier["kind"], number>();
  for (const u of soldiers) if (u.hp > 0) counts.set(u.kind, (counts.get(u.kind) ?? 0) + 1);
  const order = Object.keys(TROOP_NAMES);
  return [...counts].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]));
}

/** The remaining troops box, rebuilt only when a count changes. */
export class TroopBox {
  readonly el = document.createElement("div");
  private key = "";
  constructor() {
    this.el.className = "siege-units";
    this.el.setAttribute("role", "status");
    this.el.setAttribute("aria-label", t("siege.remaining"));
  }
  update(soldiers: readonly Soldier[]) {
    const counts = troopCounts(soldiers),
      key = counts.map(([k, n]) => k + n).join();
    if (key === this.key) return;
    this.key = key;
    this.el.hidden = !counts.length;
    this.el.innerHTML = counts
      .map(
        ([kind, n]) =>
          '<div class="siege-unit" title="' +
          TROOP_NAMES[kind] +
          '" data-troop="' +
          kind +
          '"><canvas></canvas><b>' +
          initials(TROOP_NAMES[kind]) +
          "</b><span>" +
          n +
          "</span></div>",
      )
      .join("");
    this.el.querySelectorAll<HTMLElement>("[data-troop]").forEach((row) => paintTroopBadge(row.querySelector("canvas")!, row.dataset.troop as Soldier["kind"]));
  }
}
