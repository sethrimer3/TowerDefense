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

  if (e.kind === "siegeBeetle") {
    c.fillStyle = "#3d3925"; c.fillRect(x - k, y + k, s + 2 * k, s - k);
    c.fillStyle = "#aaa171"; c.fillRect(x, y, s, s - k);
    const facing = e.facing ?? { x: 0, y: 1 };
    c.fillStyle = "#d8925e"; c.fillRect(x + s / 2 - facing.x * s / 2, y + s / 2 - facing.y * s / 2, k * 2, k * 2);
    c.fillStyle = "#e0d7a6"; c.fillRect(x + s / 2 + facing.x * s / 3, y + s / 2 + facing.y * s / 3, k * 2, k * 2);
  }
  if (e.kind === "burrowingMole") {
    c.fillStyle = (e.burrow ?? 1) > 0 ? "#85623d" : "#a98262";
    c.fillRect(x - k, y + k, s + 2 * k, s - k);
    c.fillStyle = "#b59460"; c.fillRect(x + k, y, s - 2 * k, k);
    if (!e.burrow) { c.fillStyle = "#e0b699"; c.fillRect(x + s - k, y + k, k * 2, k); }
  }
  if (e.kind === "necromancer" || e.kind === "skeleton") {
    c.fillStyle = "#e1d6b8"; c.fillRect(x + k, y, s - 2 * k, k * 3);
    c.fillStyle = "#1b1424"; c.fillRect(x + k, y + k, k, k); c.fillRect(x + s - 2 * k, y + k, k, k);
    if (e.kind === "necromancer") { c.fillStyle = "#705094"; c.fillRect(x + s, y - k, k, s * 1.8); c.fillStyle = "#9add83"; c.fillRect(x + s - k, y - 2 * k, 3 * k, k); }
  }
  if (e.kind === "bannerCaptain") {
    c.fillStyle = "#b5a074"; c.fillRect(x + s, y - s, k, s * 2);
    c.fillStyle = "#ae3546"; c.fillRect(x + s + k, y - s, s, s / 2);
    c.fillStyle = "#f0c678"; c.fillRect(x + s + k, y - s, k, s / 2);
  }
  if (e.kind === "mirrorKnight") {
    c.fillStyle = "#394455"; c.fillRect(x - k, y, k * 3, s);
    c.fillStyle = "#dae9ef"; c.fillRect(x - k, y + k, k * 2, s - 2 * k);
    c.fillStyle = "#f9fdff"; c.fillRect(x, y + k, k, k);
  }
  if (e.kind === "leechSwarm") {
    c.fillStyle = "#a15e83";
    for (let n = 0; n < 6; n++) c.fillRect(x + (n % 3) * s / 2 - k, y + Math.floor(n / 3) * s / 2, k, k * 2);
  }
  if (e.kind === "ashPhoenix") {
    c.fillStyle = "#a73a32"; c.fillRect(x - s, y + k, s, k * 2); c.fillRect(x + s, y + k, s, k * 2);
    c.fillStyle = "#ffcf61"; c.fillRect(x + k, y - k, k * 2, s); c.fillRect(x + k, y + s, k, k * 3);
  }
  if (e.kind === "phoenixEgg") {
    c.fillStyle = "#594034"; c.fillRect(x - k, y + s - k, s + 2 * k, k * 2);
    c.fillStyle = "#f8d59d"; c.fillRect(x + k, y - k, s - 2 * k, s); c.fillRect(x, y + k, s, s - k);
    c.fillStyle = "#ce5c33"; c.fillRect(x + s / 2, y + k, k, k * 2);
  }
  if (e.kind === "blinkImp") {
    c.fillStyle = "#d3afe9"; c.fillRect(x - k, y - k, k, k * 2); c.fillRect(x + s, y - k, k, k * 2);
    if (e.blink) {
      const tx = e.blink.x * px, ty = e.blink.y * px, radius = px * .45;
      c.save(); c.globalAlpha = .65; c.fillStyle = "#d3afe9";
      for (let n = 0; n < 16; n++) { const a = n * Math.PI / 8; c.fillRect(Math.round(tx + Math.cos(a) * radius), Math.round(ty + Math.sin(a) * radius), k, k); }
      c.restore();
    }
  }
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
