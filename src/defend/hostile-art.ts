import type { Brush } from "./battle-art.ts";
import type { DefendSim, Enemy } from "./sim.ts";
import { ENEMIES } from "./catalog.ts";

export function drawPoisonClouds({ c, px }: Brush, sim: DefendSim) {
  for (const e of sim.enemies) {
    const poison = ENEMIES[e.kind].poison;
    if (!poison || e.hp <= 0) continue;
    const step = .25, pixel = Math.max(1, Math.ceil(px * step));
    c.save();
    c.fillStyle = poison.color;
    for (let y = -poison.radius; y <= poison.radius; y += step) {
      for (let x = -poison.radius; x <= poison.radius; x += step) {
        const distance = Math.sqrt(x * x + y * y);
        if (distance > poison.radius) continue;
        const haze = Math.sin(x * 3 + sim.time * .7 + e.id) * Math.cos(y * 4 - sim.time * .6);
        c.globalAlpha = (.09 + (haze + 1) * .055) * (1 - distance / poison.radius * .65);
        c.fillRect(Math.round((e.x + x) * px), Math.round((e.y + y) * px), pixel, pixel);
      }
    }
    c.restore();
  }
}

export function drawHostileMarks({ c, px }: Brush, e: Enemy, { x, y, s }: { x: number; y: number; s: number }) {
  const k = Math.max(1, Math.round(s / 5));
  if (e.kind === "darkKnight") {
    c.fillStyle = "#0e101b"; c.fillRect(x - k, y - k, s + 2 * k, s + 2 * k);
    c.fillStyle = "#706781"; c.fillRect(x, y, s, k); c.fillRect(x + s / 2, y, k, s);
    c.fillStyle = "#e65e79"; c.fillRect(x + k, y + k, s - 2 * k, k);
    c.fillStyle = "#aeb4c4"; c.fillRect(x + s + k, y - k, k, s * 1.8);
  }
  if (e.kind === "bombBird" || e.kind === "voidSparrow") {
    const flap = Math.sin(e.id + e.cd * 9) * s / 3;
    c.fillStyle = e.kind === "voidSparrow" ? "#6c4e90" : "#8c5934";
    c.fillRect(x - s, y + flap, s, k * 2); c.fillRect(x + s, y - flap, s, k * 2);
    c.fillStyle = "#ffc784"; c.fillRect(x + s, y + k, k, k);
  }
  if (e.kind === "bombOrc" || e.kind === "bombBird") {
    c.fillStyle = "#3c2922"; c.fillRect(x, y + s / 2, s, k);
    c.fillStyle = "#c4312b";
    for (let n = 0; n < 3; n++) c.fillRect(x + n * s / 3, y + s / 3, k, s * .65);
    c.fillStyle = "#ffdc64"; c.fillRect(x + s / 2, y - k, k, k);
  }
  if (e.slash) {
    // Rasterize the same broad crescent silhouette as the soldiers' sword trail.
    const size = Math.max(1, Math.round(px * .08)), r = px * 1.6;
    c.save(); c.globalAlpha = Math.min(1, e.slash.t / .2);
    for (let uy = -r; uy <= r; uy += size) for (let ux = -r; ux <= r; ux += size) {
      const d = Math.sqrt(ux * ux + uy * uy);
      if (d < r * .72 || d > r || ux * e.slash.dx + uy * e.slash.dy < 0) continue;
      c.fillStyle = d > r * .93 ? "#f0e9ff" : "#8e7bb9";
      c.fillRect(Math.round(e.x * px + ux), Math.round(e.y * px + uy), size, size);
    }
    c.restore();
  }
}

export function drawBlackHoles({ c, px }: Brush, sim: DefendSim) {
  for (const h of sim.blackHoles) {
    const step = .2, pixel = Math.max(1, Math.ceil(px * step));
    c.save(); c.globalAlpha = Math.min(1, h.life / .6);
    for (let y = -h.r; y <= h.r; y += step) for (let x = -h.r; x <= h.r; x += step) {
      const d = Math.sqrt(x * x + y * y);
      if (d > h.r) continue;
      const swirl = Math.sin(Math.atan2(y, x) * 4 + d * 3 - sim.time * 4 + h.seed);
      c.fillStyle = d < h.r * .66 ? "#020107" : d > h.r * .94 ? "#9b7ebd" : swirl > .3 ? "#56336e" : "#190e27";
      c.fillRect(Math.round((h.x + x) * px), Math.round((h.y + y) * px), pixel, pixel);
    }
    c.restore();
  }
}
