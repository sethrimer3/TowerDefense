import { drawPlasmaTurret } from "./blight-plasma-art.ts";
import { drawFortressLegs, drawFortressGun, fortressBodyY } from "./fortress-motion-art.ts";
/** Solid black walkers; internal light never participates in their contour. */
import { basicUnitSprite } from "./basic-unit-art.ts";
import { drawSprite } from "./damage-art.ts";
import { ENEMIES } from "./catalog.ts";
import { BLIGHT_LASER } from "./blight-fortress.ts";
import { createTronField, stepTronField, TRON, type TronField } from "./blight-fortress-particles.ts";
import type { Brush } from "./battle-art.ts";
import type { DefendSim, Enemy } from "./sim.ts";

const fields = new WeakMap<Enemy, TronField>();
const stillFields = new WeakMap<Enemy, TronField>();

function particles(c: CanvasRenderingContext2D, e: Enemy, x: number, y: number, size: number, seconds: number, reduced: boolean) {
  const cache = reduced ? stillFields : fields;
  let field = cache.get(e);
  const tick = Math.max(0, Math.floor(seconds * TRON.hz)) + TRON.tail;
  if (!field || field.tick > tick) {
    field = createTronField(e.id, ENEMIES[e.kind].blightFortress === "plasma" ? TRON.large : ENEMIES[e.kind].blightFortress === "dual" ? TRON.medium : TRON.small);
    cache.set(e, field);
  }
  // Bound catch-up for journal/late-visible bodies; their cosmetic phase may restart.
  if (tick - field.tick > 120) field.tick = tick - 120;
  while (field.tick < tick) stepTronField(field);
  c.save(); c.lineWidth = size / 95; c.lineCap = "butt";
  for (const p of field.particles) {
    for (let n = 1; n < p.trail.length; n++) {
      const a = p.trail[n - 1], b = p.trail[n];
      const g = c.createLinearGradient(x + a.x * size, y + a.y * size, x + b.x * size, y + b.y * size);
      const denominator = p.trail.length - 1;
      g.addColorStop(0, `rgba(255,106,0,${(n - 1) / denominator * .8})`);
      g.addColorStop(1, `rgba(255,106,0,${n / denominator * .8})`);
      c.strokeStyle = g;
      const path = new Path2D(); path.moveTo(x + a.x * size, y + a.y * size); path.lineTo(x + b.x * size, y + b.y * size);
      CanvasRenderingContext2D.prototype.stroke.call(c, path);
    }
    const dot = size / 60;
    c.fillStyle = "#ff991c"; c.fillRect(x + p.x * size - dot / 2, y + p.y * size - dot / 2, dot, dot);
  }
  c.restore();
}

export function drawBlightFortress({ c, px }: Brush, e: Enemy, seconds: number, reduceMotion = false) {
  if (e.fortressPart) return;
  const def = ENEMIES[e.kind], fort = def.fortress!, size = def.size * px;
  const t = reduceMotion ? 0 : seconds, x = e.x * px - size / 2, y = fortressBodyY(e, px, reduceMotion) - size / 2;
  const scale = (fort.partScale ?? 1) * px;
  c.save();
  drawFortressLegs({ c, px }, e, reduceMotion, true);
  drawSprite(c, basicUnitSprite(e.kind, true), x, y, size, size);
  particles(c, e, x, y, size, t, reduceMotion);
  for (const part of e.fortressParts ?? [])
    if (part.hp > 0 && part.fortressPart?.role === "turret") {
      if (part.fortressPart.weapon === "plasma") drawPlasmaTurret({ c, px }, part, t, reduceMotion);
      else drawFortressGun({ c, px }, part, scale, true);
    }
  if (e.flash > 0) {
    c.fillStyle = `rgba(255,158,75,${Math.min(.15, e.flash * 1.25)})`; c.fillRect(x, y, size, size);
  }
  c.restore();
}

export function drawBlightLasers({ c, px }: Brush, sim: DefendSim) {
  c.save(); c.lineCap = "butt";
  for (const beam of sim.blightLasers) {
    const alpha = Math.max(0, beam.life / BLIGHT_LASER.life);
    for (const [width, color] of [[.3, `rgba(185,49,0,${alpha * .25})`], [.11, `rgba(218,66,0,${alpha})`], [.035, `rgba(255,119,12,${alpha})`]] as const) {
      c.lineWidth = px * width; c.strokeStyle = color; c.beginPath();
      c.moveTo(beam.x0 * px, beam.y0 * px); c.lineTo(beam.x1 * px, beam.y1 * px); c.stroke();
    }
  }
  c.restore();
}
