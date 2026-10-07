/** Little ghosts rising from the city's fallen people, as Pikmin's do: when
 * a soldier or a civilian dies, a pale pixel spirit in its colour floats up
 * from where it fell, swaying side to side, and fades out.
 *
 * Presentation only: the sim is never touched. `watch` notices the dead by
 * looking through last frame's lists for anyone whose HP has run out (the
 * sim drops them from its lists the step they die; a civilian gone home is
 * dropped alive), so it costs one pass over the defenders a frame. Ghosts
 * move on the wall clock and at most `GHOST.max` are in the air at once,
 * so a massacre stays cheap. */
import { ART } from "./park-art.ts";
import { OUTLINE, bake, blit } from "./pixel-fx.ts";
import { hash01 } from "./grid.ts";

/** Who a ghost was. */
export type GhostKind = "sword" | "archer" | "mage" | "valkyrie" | "darkWizard" | "civilian";

type Body = { x: number; y: number; hp: number; id: number };
type Units = { soldiers: readonly (Body & { kind: Exclude<GhostKind, "civilian"> })[]; civilians: readonly Body[] };

export type Ghost = { kind: GhostKind; x: number; y: number; born: number; seed: number };

/** Seconds a ghost lives, cells it rises, art pixels it sways either side,
 * how opaque it starts and the most in the air at once. */
export const GHOST = { life: 2.4, rise: 2.6, sway: 1.5, alpha: 0.8, max: 48 };

/** The ghost in two tail frames, with a little halo over it: `o` outline,
 * `w` body, `h` its sheen, `e` eyes, `y` the halo. */
export const GHOST_PIXELS = [
  [
    "..yyy..",
    ".......",
    "..ooo..",
    ".ohwwo.",
    "ohwwwwo",
    "owewewo",
    "owwwwwo",
    "oowwwoo",
    ".owwwo.",
    ".owwo..",
    "..oo...",
  ],
  [
    "..yyy..",
    ".......",
    "..ooo..",
    ".ohwwo.",
    "ohwwwwo",
    "owewewo",
    "owwwwwo",
    "oowwwoo",
    ".owwwo.",
    "..owwo.",
    "...oo..",
  ],
];

/** The halo's gold. */
const HALO = "#f6d36a";

/** Each kind's pale body and its sheen. */
const TINTS: Record<GhostKind, [string, string]> = {
  sword: ["#c8dcff", "#f4f8ff"],
  archer: ["#cdeec9", "#f4fff2"],
  mage: ["#ffd2ad", "#fff3e6"],
  valkyrie: ["#fff0b0", "#fffbe8"],
  darkWizard: ["#dcc4ff", "#f6eeff"],
  civilian: ["#f1ece0", "#ffffff"],
};

export class Ghosts {
  readonly ghosts: Ghost[] = [];
  private sim: object | null = null;
  private soldiers: Units["soldiers"] = [];
  private civilians: Units["civilians"] = [];
  private seen = new WeakSet<object>();
  private sprites = new Map<string, HTMLCanvasElement>();

  /** Looks for whoever died since last frame in battle `sim` and raises
   * their ghosts at wall time `now` (seconds); drops spent ghosts. */
  watch(sim: (Units & object) | null, now: number) {
    if (sim !== this.sim) {
      this.sim = sim;
      this.ghosts.length = 0;
      this.seen = new WeakSet();
    } else if (sim) {
      for (const s of this.soldiers) if (s.hp <= 0) this.raise(s, s.kind, now);
      for (const c of this.civilians) if (c.hp <= 0) this.raise(c, "civilian", now);
    }
    this.soldiers = sim?.soldiers ?? [];
    this.civilians = sim?.civilians ?? [];
    let n = 0;
    for (const g of this.ghosts) if (now - g.born < GHOST.life && now >= g.born) this.ghosts[n++] = g;
    this.ghosts.length = n;
  }

  private raise(u: Body, kind: GhostKind, now: number) {
    if (this.seen.has(u)) return;
    this.seen.add(u);
    // When too many fall at once, the oldest ghosts make room.
    if (this.ghosts.length >= GHOST.max) this.ghosts.shift();
    this.ghosts.push({ kind, x: u.x, y: u.y, born: now, seed: u.id * 7.31 + (kind === "civilian" ? 0.5 : 0) });
  }

  /** Where ghost `g` is at wall time `now`: its offset in art pixels from
   * where it fell, its opacity and tail frame. Holds still under reduced motion. */
  static pose(g: Ghost, now: number, reduceMotion: boolean) {
    const t = Math.max(0, now - g.born), p = Math.min(1, t / GHOST.life);
    const phase = hash01(Math.floor(g.seed * 100), 61) * 6.28;
    const rise = reduceMotion ? 0 : GHOST.rise * ART * (1 - (1 - p) * (1 - p));
    const sway = reduceMotion ? 0 : GHOST.sway * Math.sin(t * 3.4 + phase) * Math.min(1, t * 3);
    const alpha = GHOST.alpha * Math.min(1, t / 0.15) * (p < 0.55 ? 1 : (1 - p) / 0.45);
    const frame = reduceMotion ? 0 : Math.floor(t * 5 + phase) % 2;
    return { dx: Math.round(sway), dy: 0 - Math.round(rise), alpha, frame };
  }

  /** Draws the ghosts onto `c` (the camera applied), `px` canvas pixels a cell. */
  draw(c: CanvasRenderingContext2D, px: number, now: number, reduceMotion: boolean) {
    if (!this.ghosts.length) return;
    const alpha0 = c.globalAlpha;
    for (const g of this.ghosts) {
      const { dx, dy, alpha, frame } = Ghosts.pose(g, now, reduceMotion);
      if (alpha <= 0.01) continue;
      const img = this.sprite(g.kind, frame);
      c.globalAlpha = alpha0 * alpha;
      // Its tail starts where the body lay.
      blit(c, px, img, Math.round(g.x * ART) - 3 + dx, Math.round(g.y * ART) - 9 + dy);
    }
    c.globalAlpha = alpha0;
  }

  private sprite(kind: GhostKind, frame: number) {
    const key = `${kind}${frame}`;
    let img = this.sprites.get(key);
    if (img) return img;
    const rows = GHOST_PIXELS[frame];
    const { cv, c } = bake(rows[0].length, rows.length);
    const [body, sheen] = TINTS[kind];
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === ".") return;
      c.fillStyle = ch === "o" || ch === "e" ? OUTLINE : ch === "y" ? HALO : ch === "h" ? sheen : body;
      c.fillRect(x, y, 1, 1);
    }));
    this.sprites.set(key, img = cv);
    return img;
  }
}
