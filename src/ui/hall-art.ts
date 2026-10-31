import { skyAtTime, worldSky } from "../daylight.ts";
/** The walls behind the in-world menus, as lit pixel art: the Smithy's worn
 * oak boards, the Study's vault stone and the keep's hall with its great
 * window. Each wall is baked once a size (colour and a height map, at `ART`
 * screen pixels a pixel) and lit each frame, per pixel and through its
 * slopes like the Library's nave, by the torches mounted on the menu's sides
 * and, in the keep, by the sun through the window; the torches themselves
 * are small pixel sprites (`paintSconce`) with a flickering flame in a black
 * outline. Presentation only. */
import { PILLAR_OUTLINE, ashlar, facing, h01, pillarShade } from "../library/ashlar.ts";
import { getTorchFlicker, getTorchSway } from "../lighting.ts";
import { DAY_MS } from "../daylight.ts";
import { FLAME, OUTLINE, puff } from "../defend/pixel-fx.ts";
import { SoftSunlight, SUNLIGHT, windowSunlight } from "../soft-sunlight.ts";

type RGB = [number, number, number];
/** Screen (CSS) pixels to an art pixel. */
export const ART = 3;
/** How wide the vault's piers are, in art pixels: narrower in a phone-wide
 * room, so its torches keep clear of the menu. Each torch hangs off a pier's
 * inner side, placed by CSS from the `--pier` width `fit` sets on the room
 * (style.css's `.chamber-vault .sconce`, loading.css's `.loading-torch`). */
const pierWidth = (w: number) => (w * ART < 480 ? 6 : 12);
/** Fewest milliseconds between two lightings (the flicker is slow). */
const FRAME_MS = 70;

export type HallLook = "planks" | "vault" | "keep";

/** A torch on the menu's side, in CSS pixels from the backdrop's corner. */
export type TorchSpot = { x: number; y: number };

/** The window's pixels: 0 wall, 1 the stone surround, 2 the iron tracery, 3 glass. */
const WALL = 0, SURROUND = 1, TRACERY = 2, GLASS = 3, WOOD = 4;

export class HallBackdrop {
  private w = 0;
  private h = 0;
  private albedo = new Float32Array(0);
  private sx = new Float32Array(0);
  private sy = new Float32Array(0);
  /** The window: material mask, sky height, and the baked exterior's colours. */
  private part = new Uint8Array(0);
  private scene = new Float32Array(0);
  private glassTint = new Uint8Array(0);
  /** Each pane's own brightness, lighter along its top came and darker along its foot. */
  private glassShade = new Float32Array(0);
  private detailed = false;
  /** Which glazing fills the rose (`ROSES`), changed at midnight, but only
   * picked up while the room is out of sight. */
  private rose: Rose = "flower";
  /** Wall-clock time the room was last fitted, so a gap means it was hidden. */
  private seen = -Infinity;
  private sunlight: SoftSunlight | null = null;
  private city = new Float32Array(0);
  private outside: { x: number; y: number; radius: number; seed: number }[] = [];
  private win = { x0: 0, x1: 0, y0: 0, y1: 0 };
  private image: ImageData | null = null;
  private last = -Infinity;

  /** `piers`: which sides of a vault stand a pier (the loading screen has
   * only the left one, its torch's). */
  constructor(private canvas: HTMLCanvasElement, private look: HallLook, private piers: "both" | "left" = "both") {}

  /** Bakes the wall when the canvas's size changed. */
  private fit(now: number) {
    const w = Math.max(8, Math.ceil(this.canvas.clientWidth / ART)), h = Math.max(8, Math.ceil(this.canvas.clientHeight / ART));
    const away = !(now - this.seen <= AWAY_MS);
    this.seen = now;
    // The glaziers never work while someone's watching: the glazing only
    // changes when the room comes back into view (or the console pins one).
    const detailed = this.look === "keep" && !legacyGraphics(), rose = detailed ? roseOverride ?? (away ? roseOn(now) : this.rose) : this.rose;
    if (w === this.w && h === this.h && this.detailed === detailed && this.rose === rose) return false;
    this.detailed = detailed;
    const pierW = pierWidth(w);
    if (this.look === "vault") this.canvas.parentElement?.style.setProperty("--pier", `${pierW * ART}px`);
    this.rose = rose;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.image = new ImageData(w, h);
    const n = w * h, hgt = new Float32Array(n);
    this.albedo = new Float32Array(n * 3);
    this.part = new Uint8Array(n);
    this.scene = new Float32Array(n);
    this.glassTint = new Uint8Array(n);
    this.glassShade = new Float32Array(n);
    this.city = new Float32Array(n * 3);
    this.outside = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const pier = this.look === "vault" && (x < pierW || (this.piers === "both" && x >= w - pierW));
        const i = y * w + x, px = this.look === "planks" ? plank(x, y) : ashlar(x, y, pier);
        // The vault's piers, outlined and shaded round, with a torch on each.
        const k = pier ? pillarShade(x < pierW ? x : x - (w - pierW), pierW) : 1;
        hgt[i] = k === null ? 0 : px.hgt;
        if (k === null) this.albedo.set(PILLAR_OUTLINE, i * 3);
        else this.albedo.set(this.look === "vault" ? [px.rgb[0] * 0.92 * k, px.rgb[1] * 0.88 * k, px.rgb[2] * 1.02 * k] : px.rgb, i * 3);
      }
    if (this.look === "keep") this.bakeWindow(hgt);
    this.sx = new Float32Array(n);
    this.sy = new Float32Array(n);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        // A raised surface's normal points against its height gradient:
        // the rising left/top bevel faces left/up, toward a light on that side.
        this.sx[i] = (hgt[y * w + Math.max(0, x - 1)] - hgt[y * w + Math.min(w - 1, x + 1)]) / 2;
        this.sy[i] = (hgt[Math.max(0, y - 1) * w + x] - hgt[Math.min(h - 1, y + 1) * w + x]) / 2;
      }
    return true;
  }

  /** A round-headed opening in moulded stone and oak. Pixel Art glazes it
   * with one-pixel leadwork (`leadedPane`): a beaded border, an eight-petal
   * rose ringed with roundels, two pointed lancets of diamond quarries, all
   * in pale clear, blue and cream glass; off preserves
   * the old four-lobed clear window. Both overlook the same living city. */
  private bakeWindow(hgt: Float32Array) {
    const { w, h } = this, ww = Math.round(Math.max(30, Math.min(w * 0.46, 110))), r = ww / 2;
    const cx = w / 2, top = Math.round(h * 0.05), wh = Math.round(Math.max(ww * 1.1, Math.min(h * 0.62, ww * 1.75)));
    const archY = top + r, bottom = top + wh, rose = { x: cx, y: archY - r * 0.08, r: r * 0.5 };
    this.win = { x0: cx - r, x1: cx + r, y0: top, y1: bottom };
    /** How far inside the opening (x, y) is: negative outside. */
    const inside = (x: number, y: number) => (y < archY ? r - Math.hypot(x - cx, y - archY) : Math.min(r - Math.abs(x - cx), bottom - y));
    const horizon = top + wh * 0.53;
    const cityPixel = this.bakeCity(cx - r, top, ww, wh);
    for (let y = Math.max(0, top - 6); y < Math.min(h, bottom + 7); y++)
      for (let x = Math.max(0, Math.floor(cx - r - 6)); x < Math.min(w, Math.ceil(cx + r + 6)); x++) {
        const i = y * w + x, px = x + 0.5, py = y + 0.5, d = inside(px, py);
        if (y >= bottom && y < bottom + 4 && Math.abs(px - cx) < r + 6) {
          // The sill: a ledge of pale stone, lit along its top.
          this.part[i] = SURROUND;
          hgt[i] = y === bottom ? 1 : 0.6 - (y - bottom) * 0.12;
          this.albedo.set(y === bottom ? [150, 140, 124] : [104, 96, 86], i * 3);
          continue;
        }
        if (d < -5 || y >= bottom) continue;
        if (d < 0) {
          // The surround's mouldings: three rolls stepping in to the glass.
          const band = Math.floor(-d);
          this.part[i] = SURROUND;
          hgt[i] = [0.55, 1, 0.75, 1, 0.4][band] ?? 0.3;
          const t = 0.9 + h01(x, y, 4) * 0.12, base = band === 1 || band === 3 ? 136 : 112;
          this.albedo.set([base * t, base * 0.94 * t, base * 0.86 * t], i * 3);
          continue;
        }
        if (d < 3) {
          // Carved oak inside the stone arch, with grain following the arch.
          this.part[i] = WOOD;
          hgt[i] = d < 1 || d > 2.4 ? 0.6 : 1.2;
          const grain = 0.8 + h01(Math.floor(px + py * 0.4), Math.floor(d * 3), 18) * 0.3;
          this.albedo.set([123 * grain, 76 * grain, 39 * grain], i * 3);
          continue;
        }
        // Only the circular rose, its centre and flower-like lobes.
        const ring = (c: { x: number; y: number }, rr: number) => Math.abs(Math.hypot(px - c.x, py - c.y) - rr) < 0.75;
        const lobe = rose.r * 0.46;
        const iron = ring(rose, rose.r) || ring(rose, rose.r * 0.18)
          || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => ring({ x: rose.x + a * lobe, y: rose.y + b * lobe }, lobe * 0.98));
        const pane = this.detailed ? leadedPane(px, py, cx, r, archY, bottom, this.rose) : null;
        if (pane ? pane.lead : iron) {
          this.part[i] = TRACERY;
          hgt[i] = 1;
          this.albedo.set(this.detailed ? [52, 54, 58] : h01(x, y, 19) > 0.65 ? [73, 75, 70] : [30, 34, 33], i * 3);
          continue;
        }
        this.part[i] = GLASS;
        this.glassTint[i] = pane?.tint ?? 0;
        this.glassShade[i] = pane?.shade ?? 1;
        // Outside: hills, then the city's roofs and its wall under the sky.
        const hill = horizon + Math.sin(px * 0.11) * 2.2 + Math.sin(px * 0.037 + 1) * 3;
        const city = cityPixel(px, py);
        this.scene[i] = city ? -2 : py > hill ? -1 : (py - top) / Math.max(1, hill - top);
        if (city) this.city.set(city, i * 3);
      }
  }

  /** Elevated view from the keep: a far battlement behind three rows of
   * tiled roofs, timbered stone houses and lanes, echoing Defend's palette. */
  private bakeCity(left: number, top: number, width: number, height: number) {
    // Double the wall upward, keeping its foot behind the same city lanes.
    const oldWallH = Math.max(5, height * 0.07), wallH = oldWallH * 2;
    const wallY = top + height * 0.59 - oldWallH;
    const houses: { x: number; y: number; w: number; h: number; roof: RGB; seed: number }[] = [];
    for (let row = 0; row < 3; row++) {
      const size = width * (0.16 + row * 0.025);
      for (let col = -1; col < 6; col++) {
        const seed = row * 9 + col + 2;
        const x = left + col * width / 4.5 + (row % 2) * width * 0.1;
        const y = top + height * (0.7 + row * 0.13) + h01(col, row, 24) * 3;
        houses.push({ x, y, w: size, h: height * 0.075, roof: [[133, 62, 42], [137, 111, 57], [82, 99, 111]][seed % 3] as RGB, seed });
        // One stable coin flip per house: resizing or drawing never rerolls it.
        if (h01(col, row, 26) < 0.5) this.outside.push({ x: x + size * 0.78, y: y + height * 0.07, radius: size * 1.25, seed });
      }
    }
    return (x: number, y: number): RGB | null => {
      let rgb: RGB | null = null;
      const noise = 0.9 + h01(Math.floor(x), Math.floor(y), 25) * 0.18;
      if (y >= wallY - (Math.floor((x - left) / 3) % 2 === 0 ? 4 : 0) && y < wallY + wallH) {
        const joint = Math.floor(y - wallY) % 3 === 2 || Math.floor(x + Math.floor((y - wallY) / 3) * 3) % 7 === 0;
        rgb = joint ? [30, 27, 26] : [104 * noise, 100 * noise, 95 * noise];
      } else if (y >= wallY + wallH) rgb = [87 * noise, 80 * noise, 60 * noise];
      for (const b of houses) {
        const dx = x - b.x, dy = y - b.y;
        if (dx < 0 || dx >= b.w || dy < 0 || dy >= b.h * 2.1) continue;
        const edge = dx < 1 || dx >= b.w - 1 || dy < 1 || dy >= b.h * 2.1 - 1;
        if (edge) { rgb = [29, 25, 20]; continue; }
        if (dy < b.h) {
          const tile = Math.floor(dy) % 3 === 0 || Math.floor(dx + Math.floor(dy / 3) * 2) % 5 === 0;
          const tone = tile ? 0.66 : 1.15 - dy / b.h * 0.25;
          rgb = b.roof.map((v) => v * tone * noise) as RGB;
        } else {
          const beam = Math.floor(dx) % Math.max(4, Math.floor(b.w / 3)) === 0 || Math.floor(dy - b.h) === 0;
          const window = dx > b.w * 0.25 && dx < b.w * 0.48 && dy > b.h * 1.35 && dy < b.h * 1.85;
          rgb = window ? [21, 26, 27] : beam ? [56, 39, 26] : [143 * noise, 127 * noise, 93 * noise];
        }
      }
      return rgb;
    };
  }

  /** Lights the wall at most every `FRAME_MS` (every three seconds with
   * Reduce Motion), using wall-clock `now` and daylight in [0, 1]. */
  draw(now: number, torches: TorchSpot[], day: number, reduced: boolean) {
    const resized = this.fit(now);
    if (!resized && now - this.last < (reduced ? 3000 : FRAME_MS)) return;
    this.last = now;
    const { w, h, albedo, sx, sy, part, scene } = this, out = this.image!.data;
    const keep = this.look === "keep", night = 1 - day;
    // The candle-warm torches; their flicker swells and shrinks their pools.
    const lights = torches.map((t, k) => {
      const seed = k ? 5 : 2;
      const f = getTorchFlicker({ x: seed, y: 9 }, now, reduced), sway = getTorchSway({ x: seed, y: 9 }, now, reduced);
      return { x: t.x / ART + sway.x * 35 * (k ? -1 : 1), y: t.y / ART, r: Math.min(w, h) * 0.5 + 40 * f, k: 1.25 * f, rgb: [1, 0.62, 0.3] as RGB };
    });
    const amb: RGB = this.look === "planks" ? [0.2, 0.15, 0.12] : this.look === "vault" ? [0.25, 0.21, 0.32] : [0.16 + day * 0.14, 0.16 + day * 0.15, 0.2 + day * 0.15];
    const sky = skyColours(day), win = this.win, sun = keep ? day : 0, warmth = worldSky()?.warmth ?? 0;
    const lit = Math.max(0, Math.min(1, (0.55 - day) / 0.35));
    const exterior = this.outside.map((l) => ({ ...l, f: getTorchFlicker({ x: l.seed, y: 9 }, now, reduced) * lit }));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4, p = part[i];
        if (p === GLASS) {
          const s = scene[i];
          let c: RGB;
          if (s >= 0) c = mix(sky.top, sky.low, s);
          else if (s === -1) c = sky.hill;
          else {
            let warm = 0;
            for (const l of exterior) warm += Math.max(0, 1 - Math.hypot(x - l.x, y - l.y) / l.radius) ** 2 * l.f;
            const ambient = 0.13 + day * 0.87;
            c = [this.city[i * 3] * (ambient + warm * 1.2), this.city[i * 3 + 1] * (ambient + warm * 0.65), this.city[i * 3 + 2] * (ambient + warm * 0.24)];
          }
          // A faint sheen across clear glass, and a star or two at night.
          const sheen = this.detailed ? 1 : Math.abs(((x - y * 0.6) % 14 + 14) % 14 - 3) < 1 ? 1.12 : 1;
          if (this.detailed) {
            // Pale cathedral glass: the view softened behind clear, faintly
            // blue and faintly cream panes, each pane its own brightness.
            const t = GLASS_TINTS[this.glassTint[i]], lum = (0.16 + day * 0.84) * this.glassShade[i];
            c = mix(c, [t[0] * lum, t[1] * lum, t[2] * lum], 0.3 + day * 0.25);
          }
          const star = s > 0 && s < 0.7 && night > 0.5 && h01(x, y, 11) > 0.985 ? 120 * night : 0;
          out[o] = Math.min(255, c[0] * sheen + star);
          out[o + 1] = Math.min(255, c[1] * sheen + star);
          out[o + 2] = Math.min(255, c[2] * sheen + star);
          out[o + 3] = 255;
          continue;
        }
        let lr = amb[0], lg = amb[1], lb = amb[2];
        for (const l of lights) {
          const dx = l.x - x, dy = l.y - y, d = Math.hypot(dx, dy);
          if (d >= l.r) continue;
          const f = (1 - d / l.r) ** 2 * l.k * facing(sx[i], sy[i], dx, dy, d);
          lr += l.rgb[0] * f;
          lg += l.rgb[1] * f;
          lb += l.rgb[2] * f;
        }
        if (sun > 0) {
          // Surface light catches the stone relief. Atmospheric shafts are
          // separate soft density fields, never hard wall-coloured stripes.
          const mx = (win.x0 + win.x1) / 2, my = (win.y0 + win.y1) / 2, dx = mx - x, dy = my - y, d = Math.hypot(dx, dy);
          const glow = Math.max(0, 1 - d / ((win.x1 - win.x0) * 1.3)) ** 2 * 0.55 * sun * facing(sx[i], sy[i], dx, dy, d);
          lr += glow * (1 + warmth * .25);
          lg += glow * (.93 - warmth * .18);
          lb += glow * (.78 - warmth * .4);
        }
        out[o] = Math.min(255, albedo[i * 3] * lr * 1.5);
        out[o + 1] = Math.min(255, albedo[i * 3 + 1] * lg * 1.5);
        out[o + 2] = Math.min(255, albedo[i * 3 + 2] * lb * 1.5);
        out[o + 3] = 255;
      }
    // Exterior sconces and flames stay behind the oak and metal.
    for (const l of exterior) {
      const pen = (x: number, y: number, colour: string, pw = 1, ph = 1, alpha = 1) => {
        const rgb = hexRGB(colour);
        for (let yy = y; yy < y + ph; yy++) for (let xx = x; xx < x + pw; xx++) {
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const i = yy * w + xx;
          if (part[i] !== GLASS) continue;
          const o = i * 4;
          for (let k = 0; k < 3; k++) out[o + k] += (rgb[k] - out[o + k]) * alpha;
        }
      };
      const tx = Math.round(l.x), ty = Math.round(l.y);
      pen(tx, ty + 1, "#33281d", 1, 3);
      pen(tx - 1, ty + 1, "#242522", 3, 1);
      if (l.f > 0) torchFlame((x, y, colour, pw, ph) => pen(x, y, colour, pw, ph, lit), tx, ty, now, l.seed, reduced, true);
    }
    const ctx = this.canvas.getContext("2d")!;
    ctx.putImageData(this.image!, 0, 0);
  }

  /** The sun's shafts from the keep's window and the dust turning in them,
   * every frame onto `light`, a layer over the whole room (the menu too) that
   * the page screens over it. Coordinates are art pixels, the canvas a CSS
   * pixel a pixel so the motes stay fine. Same heading and slow pulse as the
   * Library's beams, with a gentle sway of their own; Reduce Motion holds
   * them still and hides the dust; by night it is empty. */
  drawLight(light: HTMLCanvasElement, now: number, day: number, reduced: boolean) {
    this.fit(now);
    const cw = light.clientWidth, ch = light.clientHeight;
    if (light.width !== cw || light.height !== ch) {
      light.width = cw;
      light.height = ch;
    }
    const ctx = light.getContext("2d")!;
    ctx.clearRect(0, 0, cw, ch);
    if (this.look !== "keep" || day <= 0.02 || !cw || !ch) return;
    this.sunlight ??= new SoftSunlight(SUNLIGHT.hallDensity, SUNLIGHT.hallFade);
    const { win, h } = this, clock = reduced ? 0 : now, span = win.x1 - win.x0 - 8;
    const solar = windowSunlight(worldSky() ?? skyAtTime(now));
    const tilt = reduced ? 0.2 : solar.tilt;
    day = Math.min(day, solar.strength);
    const beams = 5, width = span / beams, top = win.y0 + (win.y1 - win.y0) * 0.6, length = h - top;
    ctx.save();
    ctx.scale(cw / this.w, ch / this.h);
    for (let k = 0; k < beams; k++) {
      const pulse = 0.72 + 0.28 * Math.sin(clock / (3100 + k * 700) + k * 1.7);
      const start = top + (k % 2) * 8;
      // Narrower than their spacing, so each shaft stands apart and breathes on its own.
      this.sunlight.draw(ctx, win.x0 + 4 + width * (k + 0.5), start, width * 0.55, h - start, tilt, day * pulse, k);
    }
    if (!reduced) {
      // Motes on fixed wall-clock paths, drifting both ways and wandering;
      // they glint only inside the light. No spawning, no random stream.
      ctx.fillStyle = "#fff6dc";
      const mid = (win.x0 + win.x1) / 2, dot = Math.max(0.5, this.w / cw * 1.6);
      for (let k = 0; k < SUNLIGHT.dustCount; k++) {
        const speed = (h01(k, 2, 83) - 0.4) / (60000 + h01(k, 5, 83) * 60000);
        const age = ((h01(k, 1, 83) + now * speed) % 1 + 1) % 1, run = age * length;
        const wander = Math.sin(now / (5200 + h01(k, 6, 83) * 6000) + k) * 3 + Math.sin(now / 1900 + k * 2.3) * 0.6;
        const across = (h01(k, 3, 83) - 0.5) * span * (1 + age * 0.9);
        const x = mid + across + run * tilt + wander, y = top + run + Math.sin(now / 3700 + k * 1.3) * 1.5;
        // Brighter toward the shafts' middle and the window, gone at the ends.
        const off = Math.abs(x - mid - run * tilt) / (span * 0.5 * (1 + age * 0.9));
        const inBeam = Math.max(0, 1 - off * off), ends = Math.min(1, age * 8) * (1 - age) ** 1.2;
        const twinkle = 0.65 + 0.35 * Math.sin(now / (700 + h01(k, 7, 83) * 900) + k);
        ctx.globalAlpha = Math.min(1, day * inBeam * ends * twinkle * (0.6 + h01(k, 4, 83) * 0.4));
        if (ctx.globalAlpha > 0.02) ctx.fillRect(x, y, dot, dot);
      }
    }
    ctx.restore();
  }
}

/** The panes' tints: clear, the palest blue, the palest cream. */
const GLASS_TINTS: RGB[] = [[236, 240, 236], [212, 230, 246], [250, 238, 206], [255, 212, 118]];
/** GOLD, a little more yellow than cream, picks out the suns, wings and hilts. */
const CLEAR = 0, BLUE = 1, CREAM = 2, GOLD = 3;
/** No pane: inside the frame's came or the central mullion. */
const CAME = -1;

type Pane = { id: number; tint: number };

/** The rose's glazings. From one midnight to the next the glaziers set one
 * of the specials: diamond quarries, a winged sword, the sun between two
 * moons and the stars, an abstract of cells, or interlocking triangles. The
 * flower stays only for the console's `tilesRose("flower")`. */
export const ROSES = ["flower", "diamonds", "sword", "sky", "cells", "triangles"] as const;
export type Rose = (typeof ROSES)[number];
let roseOverride: Rose | null = null;
/** A gap in drawing longer than this means the room was out of sight (another
 * tab, or the browser hidden), when the window may take the day's glazing. */
const AWAY_MS = 1000;
/** Sets the rose's glazing (the console's `tilesRose`), or null for the night's own. */
export function setRose(rose: Rose | null) {
  roseOverride = rose;
}
/** Show legacy graphics (the root's `.legacy-graphics`) brings back the
 * original clear four-lobed window. */
const legacyGraphics = () => typeof document !== "undefined" && document.documentElement.classList.contains("legacy-graphics");
/** The specials the window cycles through (never the flower). */
const CYCLE = ROSES.filter(r => r !== "flower");
/** The glazing for wall-clock `now`: one a day, changed at midnight (a
 * quarter `DAY_MS` before the day's turn), each special equally often. */
export function roseOn(now: number): Rose {
  // (`HallBackdrop.fit` only asks after the room has been out of sight.)
  if (roseOverride) return roseOverride;
  const night = Math.floor((now + DAY_MS / 4) / DAY_MS), roll = h01(night, 3, 97);
  return CYCLE[Math.min(CYCLE.length - 1, Math.floor(roll * CYCLE.length))];
}

/** Each glazing as panes over the rose's disc of radius `rr`, in `X = |dx|`
 * and `dy` from its centre (up is negative), so each mirrors exactly. */
const ROSE_PANES: Record<Exclude<Rose, "flower">, (X: number, dy: number, dr: number, rr: number) => Pane> = {
  diamonds(X, dy, _dr, rr) {
    const q = Math.max(5, rr / 3.6), u = X / q, v = dy / (q * 1.4);
    const i = Math.round(u + v), j = Math.round(u - v);
    return { id: 1000 + (i + 50) * 100 + j + 50, tint: i === j && i % 2 === 0 ? GOLD : (((i + j) % 3) + 3) % 3 };
  },
  sword(X, dy, dr, rr) {
    const bw = Math.max(1.5, rr * 0.07), tip = -rr * 0.78, guard = rr * 0.18;
    // The blade, narrowing to its point, leaded in lengths.
    if (dy > tip && dy < guard && X < bw * Math.min(1, (dy - tip) / (rr * 0.18)))
      return { id: 2000 + Math.floor((dy - tip) / (rr * 0.24)), tint: CLEAR };
    if (Math.abs(dy - guard - rr * 0.04) < rr * 0.055 && X < rr * 0.34) return { id: 2050, tint: GOLD };
    if (dy > guard && dy < rr * 0.5 && X < bw * 0.85) return { id: 2051, tint: BLUE };
    if (Math.hypot(X, dy - rr * 0.58) < rr * 0.09) return { id: 2052, tint: GOLD };
    // The wings, from beside the guard, sweeping up and out in five feathers.
    const wx = X - bw * 1.2, wy = guard - dy, ang = Math.atan2(wy, wx) * 180 / Math.PI, dw = Math.hypot(wx, wy);
    if (wx > 0 && ang > -12 && ang < 70) {
      const k = Math.min(4, Math.floor((ang + 12) / 16.4)), reach = rr * (0.92 - k * 0.07) - Math.abs(((ang + 12) % 16.4) - 8.2) * rr * 0.012;
      if (dw < rr * 0.34) return { id: 2060, tint: CREAM };
      if (dw < reach) return { id: 2070 + k, tint: k % 2 ? CREAM : GOLD };
    }
    // The sky behind, in quarters round the disc.
    return { id: 2090 + Math.floor(Math.atan2(X, -dy) / (Math.PI / 4)) + (dr > rr * 0.62 ? 10 : 0), tint: BLUE };
  },
  sky(X, dy, dr, rr) {
    // The sun, its eight rays, a crescent moon either side and the stars.
    if (dr < rr * 0.2) return { id: 3000, tint: GOLD };
    const th = Math.atan2(X, -dy), k = Math.round(th / (Math.PI / 4)), off = Math.abs(th - k * Math.PI / 4);
    if (dr < rr * 0.44 && off * dr < (rr * 0.44 - dr) * 0.45) return { id: 3010 + k, tint: k % 2 ? CREAM : GOLD };
    const mx = rr * 0.66, my = rr * 0.04, m = rr * 0.24;
    if (Math.hypot(X - mx, dy - my) < m && Math.hypot(X - mx - m * 0.45, dy - my + m * 0.15) > m * 0.85) return { id: 3030, tint: CREAM };
    for (const [n, sx, sy, sr] of STARS) {
      const ax = Math.abs(X - sx * rr), ay = Math.abs(dy - sy * rr), size = sr * rr;
      if (Math.sqrt(ax) + Math.sqrt(ay) < Math.sqrt(size)) return { id: 3040 + n, tint: n % 2 ? GOLD : CREAM };
    }
    return { id: 3100 + Math.floor(th / (Math.PI / 2)) + (dr > rr * 0.86 ? 10 : 0), tint: dr > rr * 0.86 ? CLEAR : BLUE };
  },
  cells(X, dy, _dr, rr) {
    // An abstract of cells round mirrored seeds, a few on the mullion's line.
    let best = Infinity, n = 0;
    for (let k = 0; k < CELLS.length; k++) {
      const [sx, sy] = CELLS[k], d = (X - sx * rr) ** 2 + (dy - sy * rr) ** 2;
      if (d < best) { best = d; n = k; }
    }
    return { id: 4000 + n, tint: n % 5 === 2 ? GOLD : n % 3 };
  },
  triangles(X, dy, dr, rr) {
    // Two hexagrams, upright and on their sides, and an eye: each pane is
    // tinted by how many of the four triangles overlap there.
    if (dr < rr * 0.14) return { id: 5000, tint: GOLD };
    let mask = 0, inside = 0;
    TRIANGLES.forEach(([R, normals], t) => {
      let all = true;
      normals.forEach(([nx, ny], e) => {
        const out = nx * X + ny * dy >= R * rr * 0.5;
        if (out) { mask |= 1 << (t * 3 + e); all = false; }
      });
      if (all) inside++;
    });
    return { id: 5100 + mask, tint: inside >= 3 ? GOLD : inside % 3 };
  },
};
/** The sky's stars: index, x and y as shares of the rose's radius, size. */
const STARS: [number, number, number, number][] = [[0, 0, -0.7, 0.13], [1, 0.4, -0.58, 0.1], [2, 0.7, -0.4, 0.08], [3, 0.36, 0.56, 0.1], [4, 0.66, 0.42, 0.08], [5, 0, 0.68, 0.12]];
/** The cells' seeds as shares of the radius, x never negative (folded). */
const CELLS: [number, number][] = [[0, -0.8], [0, -0.36], [0, 0.08], [0, 0.5], [0, 0.88], [0.3, -0.62], [0.62, -0.62], [0.24, -0.12], [0.5, -0.3], [0.84, -0.26], [0.36, 0.28], [0.7, 0.08], [0.9, 0.3], [0.3, 0.7], [0.62, 0.56], [0.52, 0.86]];
/** The triangles: circumradius share and their edges' outward normals. */
const TRIANGLES: [number, [number, number][]][] = [
  [0.96, [[0, 1], [0.866, -0.5], [-0.866, -0.5]]],
  [0.96, [[0, -1], [0.866, 0.5], [-0.866, 0.5]]],
  [0.56, [[1, 0], [-0.5, 0.866], [-0.5, -0.866]]],
  [0.56, [[-1, 0], [0.5, 0.866], [0.5, -0.866]]],
];

/** The window's glazing as panes, each an id and a tint: a border of
 * alternating beads, a rose in the head (a cream eye, eight petals, crescents
 * between them and an outer ring of sixteen segments, each with a roundel),
 * spandrels round it and two pointed lancets of diamond quarries below.
 * Everything reads `|x - cx|`, so the leadwork mirrors exactly. */
function paneAt(px: number, py: number, cx: number, r: number, archY: number, bottom: number, rose: Rose = "flower"): Pane {
  const X = Math.abs(px - cx);
  const d = py < archY ? r - Math.hypot(X, py - archY) : Math.min(r - X, bottom - py);
  if (d < 4) return { id: CAME, tint: CLEAR };
  if (d < 8) {
    // The border, measured round the opening from the head's crown.
    const side = r - X < bottom - py;
    const s = py < archY ? Math.atan2(X, archY - py) * (r - 6)
      : side ? Math.PI / 2 * (r - 6) + (py - archY) : Math.PI / 2 * (r - 6) + (bottom - archY) + (r - X);
    const k = Math.round(s / 5);
    return { id: 100 + k, tint: k % 2 ? BLUE : CREAM };
  }
  const rr = r - 8, dy = py - archY, dr = Math.hypot(X, dy);
  // Each glazing is drawn the way up it was designed, turned a half turn into
  // the window; mirrored in x already, so that is only dy's sign.
  if (dr < rr && rose !== "flower") return ROSE_PANES[rose](X, -dy, dr, rr);
  if (dr < rr) {
    const th = Math.atan2(X, -dy), eye = rr * 0.2, ring = rr * 0.74;
    if (dr < eye) return { id: 200, tint: CREAM };
    if (dr < ring) {
      const petal = rr * (0.6 + 0.14 * Math.cos(th * 8));
      if (dr < petal) return { id: 210 + Math.round(th / (Math.PI / 4)), tint: BLUE };
      return { id: 220 + Math.floor(th / (Math.PI / 4)), tint: CLEAR };
    }
    // Sixteen segments in a big rose, eight in a small one so the roundels keep room.
    const step = rr >= 24 ? Math.PI / 8 : Math.PI / 4, m = Math.round(th / step), a = m * step, mid = (ring + rr) / 2;
    const bead = Math.max(1.6, (rr - ring) * 0.3);
    if (Math.hypot(X - Math.sin(a) * mid, dy + Math.cos(a) * mid) < bead) return { id: 260 + m, tint: CREAM };
    return { id: 240 + m, tint: m % 2 ? BLUE : CLEAR };
  }
  // Below the rose: two pointed lancets either side of the mullion.
  const foot = archY + rr, half = rr / 2, hw = half - 1.5, a = X - half;
  if (X < 1 && py > foot - 1) return { id: CAME, tint: CLEAR };
  const springing = foot + 3 + hw * 1.73, reach = (Math.abs(a) + hw);
  const head = reach < hw * 2 ? springing - Math.sqrt(hw * hw * 4 - reach * reach) : Infinity;
  if (Math.abs(a) < hw && py > head) {
    const q = Math.max(5, hw / 1.8), u = a / q, v = (py - springing) / (q * 1.4);
    const i = Math.round(u + v), j = Math.round(u - v);
    return { id: 100000 + (i + 500) * 1000 + j + 500, tint: (((i + j) % 3) + 3) % 3 };
  }
  // The spandrels: faintly blue, the outer ones round a cream roundel where
  // the rose meets the lancets, the inner one under the rose's foot.
  const outer = a > 0, spot = outer ? { x: r - 8 - rr * 0.16, y: foot + 1 } : { x: 0, y: foot + 2 + hw * 0.5 };
  if (Math.hypot(X - spot.x, py - spot.y) < Math.max(1.6, rr * 0.1)) return { id: 510 + (outer ? 1 : 0), tint: CREAM };
  return { id: 500 + (outer ? 1 : 0) + (py < foot - rr * 0.35 ? 2 : 0), tint: outer ? BLUE : CLEAR };
}

/** A pixel of leaded glass: lead where its pane meets the next one toward the
 * mullion or below (so each came is one pixel and mirrors exactly), and
 * otherwise its pane's tint and shade. */
function leadedPane(px: number, py: number, cx: number, r: number, archY: number, bottom: number, rose: Rose) {
  const at = (x: number, y: number) => paneAt(x, y, cx, r, archY, bottom, rose);
  const here = at(px, py);
  if (here.id === CAME) return { lead: true, tint: CLEAR, shade: 1 };
  const toward = at(px + (px < cx ? 1 : -1), py).id;
  const below = at(px, py + 1).id, above = at(px, py - 1).id;
  const lead = (toward !== CAME && toward !== here.id) || (below !== CAME && below !== here.id);
  const shade = (0.95 + h01(here.id % 9973, here.id >> 10, 31) * 0.1) * (above !== here.id ? 1.1 : below !== here.id ? 0.92 : 1);
  return { lead, tint: here.tint, shade };
}

/** Worn oak boards laid in courses, each board its own tone, with grain,
 * knots, scuffs and a nail at each end; the boards' edges bevelled. */
function plank(x: number, y: number): { rgb: RGB; hgt: number } {
  const bh = 11, course = Math.floor(y / bh), ly = y - course * bh;
  const off = Math.floor(h01(course, 3, 1) * 60), len = 46 + Math.floor(h01(course, 5, 2) * 30);
  const board = Math.floor((x + off) / len), lx = (x + off) - board * len;
  const edge = Math.min(lx, len - 1 - lx, ly, bh - 1 - ly);
  if (ly === 0 || lx === 0) return { rgb: [22, 14, 9], hgt: 0 };
  const tone = 0.78 + h01(board, course, 3) * 0.32;
  // Grain: long streaks along the board, wavering, each row its own.
  const wave = Math.sin((lx + h01(board, course, 4) * 40) * 0.09 + ly * 0.8) * 0.5 + 0.5;
  const streak = 0.9 + (h01(course * bh + ly, board, 5) - 0.5) * 0.16 + wave * 0.06;
  // A knot or none per board: dark rings round a point.
  const kx = 8 + h01(board, course, 6) * (len - 16), ky = 3 + h01(board, course, 7) * (bh - 6);
  const kd = Math.hypot((lx - kx) * 0.6, ly - ky), knot = h01(board, course, 8) > 0.55 && kd < 2.6 ? (kd < 1.2 ? 0.55 : 0.8) : 1;
  // Scuffed where hands and boots wore it pale.
  const worn = h01(Math.floor(lx / 3), course * 31 + board, 9) > 0.93 ? 1.14 : 1;
  const nail = ly === Math.floor(bh / 2) && (lx === 2 || lx === len - 3);
  const t = tone * streak * knot * worn;
  if (nail) return { rgb: [120, 116, 108], hgt: 1 };
  return { rgb: [112 * t, 72 * t, 42 * t], hgt: Math.min(1, edge / 1.6) * (0.88 + h01(x, y, 10) * 0.12) };
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** The view's colours by daylight: night, a warm dawn and dusk, and day. */
function skyColours(day: number) {
  const dusk = Math.max(0, 1 - Math.abs(day - 0.45) * 3.2);
  const night = { top: [10, 16, 38] as RGB, low: [28, 36, 70] as RGB, hill: [14, 18, 26] as RGB, roofs: [10, 11, 16] as RGB, wall: [16, 16, 20] as RGB };
  const noon = { top: [86, 150, 214] as RGB, low: [196, 226, 238] as RGB, hill: [70, 104, 66] as RGB, roofs: [104, 66, 52] as RGB, wall: [118, 112, 102] as RGB };
  const at = (k: keyof typeof noon) => mix(night[k], noon[k], day);
  const scene = worldSky();
  const low = scene ? mix(at("low"), [...scene.rgb], Math.min(.85, scene.tint.strength * 2)) : mix(at("low"), [236, 150, 96], dusk * 0.7);
  return { top: at("top"), low, hill: at("hill"), roofs: at("roofs"), wall: at("wall") };
}

// ── The torches ──────────────────────────────────────────────────────────
/** A sconce's sprite size, in art pixels. */
export const SCONCE = { w: 11, h: 24 };
const OUT = "#0b0907";
/** Paints a wall torch into `canvas` (`SCONCE` pixels): an iron bracket on a
 * backplate, an oak haft wrapped in pitch-soaked rags, and its flame, which
 * leans and licks with the wall clock (still under Reduce motion). `side` is
 * the wall it hangs on, so the bracket reaches out of it. */
export function paintSconce(canvas: HTMLCanvasElement, now: number, side: "left" | "right", reduced: boolean) {
  if (canvas.width !== SCONCE.w) {
    canvas.width = SCONCE.w;
    canvas.height = SCONCE.h;
  }
  const c = canvas.getContext("2d")!, flip = side === "right";
  c.clearRect(0, 0, SCONCE.w, SCONCE.h);
  const px = (x: number, y: number, colour: string, w = 1, hh = 1) => {
    c.fillStyle = colour;
    c.fillRect(flip ? SCONCE.w - x - w : x, y, w, hh);
  };
  // The backplate on the wall, riveted.
  px(0, 13, OUT, 3, 9);
  px(0, 14, "#3a3632", 2, 7);
  px(0, 15, "#6a645c", 1, 1);
  px(0, 19, "#6a645c", 1, 1);
  // The bracket arm and its cup.
  px(2, 17, OUT, 4, 3);
  px(2, 18, "#4a4440", 3, 1);
  px(4, 13, OUT, 6, 5);
  px(5, 14, "#55504a", 4, 3);
  px(5, 14, "#8a8278", 4, 1);
  // The haft, then its rag wrapping.
  px(5, 9, OUT, 4, 5);
  px(6, 10, "#5a3a22", 2, 4);
  px(6, 9, "#2a1c14", 2, 1);
  torchFlame(px, 6, 9, now, flip ? 5 : 2, reduced);
}

type FlamePen = (x: number, y: number, colour: string, w?: number, h?: number) => void;
const hexRGB = (colour: string): RGB => [parseInt(colour.slice(1, 3), 16), parseInt(colour.slice(3, 5), 16), parseInt(colour.slice(5, 7), 16)];

/** Wizard fire's cut-corner puffs, outline and palette, rising from a
 * stationary wick. Pure wall-clock animation, with no battle randomness. */
function torchFlame(pen: FlamePen, x: number, y: number, now: number, seed: number, reduced: boolean, tiny = false) {
  const clock = reduced ? 0 : now;
  const sway = getTorchSway({ x: seed, y: 9 }, clock, reduced);
  const flicker = getTorchFlicker({ x: seed, y: 9 }, clock, reduced);
  const scale = tiny ? 0.4 : 1;
  const puffs: { x: number; y: number; r: number; tone: number }[] = [];
  for (let k = 0; k < 5; k++) {
    const age = ((clock / (640 + k * 27) + k * 0.21 + seed * 0.13) % 1 + 1) % 1;
    const rise = age * 7 * sway.stretch;
    const drift = Math.sin(age * 5 + seed + clock / 370) * age * 1.4 + sway.x * 35 * age;
    puffs.push({ x: x + Math.round(drift * scale), y: y - Math.round(rise * scale), r: Math.max(0, Math.round((2.3 - age * 2) * scale * flicker)), tone: age < 0.2 ? 3 : age < 0.5 ? 2 : 1 });
  }
  const dot = (colour: string) => (xx: number, yy: number, w = 1, h = 1) => pen(xx, yy, colour, w, h);
  for (const p of puffs) puff(dot(OUTLINE), p.x, p.y, p.r + (tiny ? 0 : 1));
  for (const p of puffs) {
    puff(dot(FLAME[p.tone]), p.x, p.y, p.r);
    if (p.r > 0) pen(p.x, p.y - 1, FLAME[p.tone + 1]);
  }
  puff(dot(FLAME[4]), x, y, tiny ? 0 : 1);
  if (!tiny) {
    const ember = ((clock / 1100 + seed * 0.17) % 1 + 1) % 1;
    pen(x + Math.round(Math.sin(seed + ember * 5) * 2), y - 4 - Math.round(ember * 4), FLAME[ember < 0.5 ? 3 : 1]);
  }
}
