/** The Mine's little effects, each moving its own way: dust and grit off a
 * dig fall and settle on the ground; smoke from the forge's chimney rises,
 * drifts with the wind and spreads as it fades; sparks off the anvil fly up
 * and fall fast and bright; a sleeper's z's float up and sway; the wisp of a
 * miner lost or saved rises slowly and glows; embers off the furnace drift
 * up, flickering; a whistled note floats up and sways; a drop of sweat or
 * water falls and is gone where it lands; a word's dots hang over a chat.
 * Presentation only: the
 * renderer feeds it from `stream("effects")`. */
import type { Fine } from "./figures.ts";

export type ParticleKind = "dust" | "smoke" | "spark" | "zzz" | "wisp" | "steam" | "ember" | "note" | "drop" | "word";
export type Particle = { kind: ParticleKind; x: number; y: number; vx: number; vy: number; age: number; life: number; color: string; size: number };

const MAX = 320;

export class Particles {
  private list: Particle[] = [];

  add(kind: ParticleKind, x: number, y: number, vx: number, vy: number, life: number, color: string, size = 0.5) {
    this.list.push({ kind, x, y, vx, vy, age: 0, life, color, size });
    if (this.list.length > MAX) this.list.shift();
  }
  get count() {
    return this.list.length;
  }

  /** Moves every particle one frame: `solid` says where dust comes to rest,
   * `wind` pushes smoke and steam along. */
  step(solid: (x: number, y: number) => boolean, wind: number) {
    this.list = this.list.filter((p) => {
      p.age++;
      switch (p.kind) {
        case "dust":
          p.vy = Math.min(0.35, p.vy + 0.018);
          p.vx *= 0.94;
          if (solid(p.x + p.vx, p.y + p.vy)) {
            // Landed: it lies where it fell and fades.
            p.vx = p.vy = 0;
            p.age = Math.max(p.age, p.life - 18);
          }
          break;
        case "spark":
          p.vy += 0.022;
          p.vx *= 0.97;
          if (solid(p.x + p.vx, p.y + p.vy)) p.vy = -p.vy * 0.3;
          break;
        case "smoke":
        case "steam":
          // Rising, slowing as it cools, carried off by the wind, spreading.
          p.vy *= 0.985;
          p.vx += (wind * 0.004 - p.vx) * 0.04;
          p.size = Math.min(1, p.size + 0.008);
          break;
        case "zzz":
          p.vx = Math.sin(p.age / 12) * 0.012;
          break;
        case "note":
          p.vx = Math.sin(p.age / 8) * 0.015;
          break;
        case "ember":
          // Rising on the heat, slowing as it cools, wandering.
          p.vy *= 0.99;
          p.vx = p.vx * 0.9 + Math.sin(p.age / 5 + p.x * 3) * 0.004;
          break;
        case "drop":
          p.vy = Math.min(0.3, p.vy + 0.02);
          if (solid(p.x, p.y + p.vy)) p.age = p.life;
          break;
        case "wisp":
          p.vx = Math.sin(p.age / 9 + p.size * 7) * 0.02;
          p.vy *= 0.995;
          break;
      }
      p.x += p.vx;
      p.y += p.vy;
      return p.age < p.life;
    });
  }

  /** Draws them: `ctx` for alpha and blending, `fine` to snap each to
   * whole screen pixels. */
  draw(ctx: CanvasRenderingContext2D, fine: Fine) {
    for (const p of this.list) {
      const t = p.age / p.life, fade = t < 0.75 ? 1 : (1 - t) / 0.25;
      const s = p.size;
      if (p.kind === "spark" || p.kind === "wisp" || p.kind === "ember") ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = p.kind === "smoke" ? 0.55 * (1 - t) : p.kind === "steam" ? 0.4 * (1 - t) : p.kind === "zzz" || p.kind === "note" ? 0.8 * fade * Math.min(1, p.age / 15) : fade;
      if (p.kind === "zzz") {
        // A little z, four fifths of a cell across: its stroke slants down
        // from the top bar's right end to the bottom bar's left.
        const q = 0.2, x = p.x - 0.4, y = p.y - 0.4;
        fine(x, y, 4 * q, q, p.color);
        fine(x + 2 * q, y + q, q, q, p.color);
        fine(x + q, y + 2 * q, q, q, p.color);
        fine(x, y + 3 * q, 4 * q, q, p.color);
      } else if (p.kind === "note") {
        // A quaver: its head, stem and flag.
        const q = 0.2, x = p.x - 0.2, y = p.y - 0.4;
        fine(x, y + 3 * q, 2 * q, q, p.color);
        fine(x + q, y, q, 3 * q, p.color);
        fine(x + 2 * q, y, q, q, p.color);
      } else if (p.kind === "word") {
        // Three dots of talk, one after another as it ages.
        const n = Math.min(3, 1 + Math.floor(p.age / 12));
        for (let i = 0; i < n; i++) fine(p.x - 0.5 + i * 0.4, p.y, 0.2, 0.2, p.color);
      } else if (p.kind === "ember" || p.kind === "drop") {
        if (p.kind === "ember") ctx.globalAlpha = fade * (0.6 + 0.4 * Math.sin(p.age * 1.7));
        fine(p.x - 0.125, p.y - 0.125, 0.25, p.kind === "drop" ? 0.375 : 0.25, p.color);
      } else if ((p.kind === "smoke" || p.kind === "steam") && s > 0.6) {
        // A puff: a cross of half cells, rounder than a block.
        fine(p.x - s / 2, p.y - 0.25, s, 0.5, p.color);
        fine(p.x - 0.25, p.y - s / 2, 0.5, s, p.color);
      } else fine(p.x - s / 2, p.y - s / 2, s, s, p.color);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = 1;
  }
}
