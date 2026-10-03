import { drawFortress } from "./fortress-art.ts";
import { enemySize } from "./catalog.ts";
import { drawEnemyHealthbars, healthbarEnemies } from "./healthbars.ts";
import { drawBlackHoles, drawHostileMarks, drawPoisonClouds } from "./hostile-art.ts";
import { drawFirework, drawSiegeEngine, drawSiegeShots, siegeLights } from "./siege-art.ts";
import { boatLights, drawBoat } from "./boat-art.ts";
/** What DEFEND draws fresh each battle frame over the city layer: struck and
 * damaged buildings, blast scorches, then the units, projectiles and effects.
 * Every painter takes a `Brush`: the board's context and its pixels per cell. */
import { hash01 } from "./grid.ts";
import { ARCHER_UNIT, CIVILIAN, DARK_WIZARD, ENEMIES, FIRE_MAGE, SOLDIER, VALKYRIE, watchRadius, type EnemyDef } from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { center } from "./pathing.ts";
import type { CarriedLight } from "./lighting.ts";
import { drawFireballs, drawMage } from "./mage-art.ts";
import { drawStabs, drawValkyrie } from "./valkyrie-art.ts";
import { drawDarkWizard } from "./dark-art.ts";
import { BUILDING_FLASH, type DefendSim, type Effect, type Enemy, type Scorch, type Soldier } from "./sim.ts";

export type Brush = { c: CanvasRenderingContext2D; px: number };

/** Struck buildings flash pale for a moment; hurt houses and walls darken,
 * and other hurt structures wear a health bar. */
export function drawDamage(b: Brush, sim: DefendSim) {
  drawStrikes(b, sim);
  drawHurt(b, sim);
}

function drawStrikes({ c, px }: Brush, sim: DefendSim) {
  for (const bd of sim.map.buildings) {
    const f = sim.flash[bd.id];
    if (f <= 0 || !sim.intact(bd)) continue;
    const r = bd.rect;
    c.fillStyle = `rgba(255,244,220,${(f / BUILDING_FLASH) * 0.55})`;
    c.fillRect(r.x * px, r.y * px, r.w * px, r.h * px);
  }
}

function drawHurt(b: Brush, sim: DefendSim) {
  for (const bd of sim.map.buildings) {
    const hp = sim.hp[bd.id],
      max = sim.maxHp[bd.id];
    // Houses and walls show their hurt only in their art's damage stages.
    if (!sim.intact(bd) || hp >= max || bd.kind === "house" || bd.kind === "wall" || bd.kind === "gate") continue;
    healthBar(b, bd, hp / max);
  }
}

function healthBar({ c, px }: Brush, bd: Building, frac: number) {
  const r = bd.rect;
  const bw = r.w * px,
    bh = Math.max(2, px * 0.22);
  c.fillStyle = "rgba(0,0,0,0.7)";
  c.fillRect(r.x * px, r.y * px - bh - 1, bw, bh);
  c.fillStyle = frac > 0.5 ? "#8fcf6a" : frac > 0.25 ? "#e3b14c" : "#d9635a";
  c.fillRect(r.x * px, r.y * px - bh - 1, bw * frac, bh);
}

/** How brightly a torch at (x, y) still burns, 0 (out) to 1. */
export type Burning = (x: number, y: number, id: number) => number;

/** Units, projectiles and effects. With `torches`, units carry a torch,
 * lit while it still burns. */
export function drawUnits(b: Brush, sim: DefendSim, torches: Burning | null, healthbars = false) {
  // Track the wave peak even when the setting is off.
  healthbarEnemies(sim);
  drawBlackHoles(b, sim);
  drawPoisonClouds(b, sim);
  drawWatchRadii(b, sim);
  drawCivilians(b, sim, torches);
  const swords = drawSoldiers(b, sim, torches);
  for (const e of sim.enemies) {
    const def = ENEMIES[e.kind];
    if (def.siege) drawSiegeEngine(b, e, sim.time);
    else if (def.boat) drawBoat(b, e, sim.time);
    else drawEnemy(b, e);
  }
  drawSwords(b, swords);
  drawArrows(b, sim);
  drawShells(b, sim);
  drawSiegeShots(b, sim);
  drawFireballs(b.c, b.px, sim);
  drawStabs(b.c, b.px, sim);
  for (const fx of sim.effects) drawEffect(b, fx);
  if (healthbars) drawEnemyHealthbars(b, sim);
}

/** Watch-tower radii, very faint. */
function drawWatchRadii({ c, px }: Brush, sim: DefendSim) {
  c.strokeStyle = "rgba(242,210,122,0.16)";
  c.lineWidth = Math.max(1, px * 0.08);
  for (const bd of sim.map.buildings) {
    if (bd.kind !== "watchTower" || !sim.intact(bd)) continue;
    const p = center(bd.rect);
    c.beginPath();
    c.arc(p.x * px, p.y * px, watchRadius(sim.levels.watchRadius) * px, 0, Math.PI * 2);
    c.stroke();
  }
}

/** Civilians, with a flicker of gold over those at work. */
function drawCivilians(b: Brush, sim: DefendSim, torches: Burning | null) {
  const { c, px } = b;
  for (const u of sim.civilians) {
    const s = Math.max(2, CIVILIAN.size * px);
    c.fillStyle = u.flash > 0 ? "#fff" : CIVILIAN.color;
    c.fillRect(u.x * px - s / 2, u.y * px - s / 2, s, s);
    if (torches) drawHandTorch(b, { x: u.x + CIVILIAN.size * 0.6, y: u.y - CIVILIAN.size * 0.4, id: u.id }, sim.time, torches(u.x, u.y, u.id));
    if (u.state === "working" && Math.floor(sim.time * 6) % 2) {
      c.fillStyle = "#f2d27a";
      c.fillRect(u.x * px + s / 2, u.y * px - s, Math.max(1, s / 2), Math.max(1, s / 2));
    }
  }
}

/** Swordsmen and archers (who carry a little bow on the off side), the
 * fire mages (`mage-art.ts`, lit by the flame in their hand, not a torch)
 * the valkyries (`valkyrie-art.ts`, lit by their own gold) and the dark
 * wizard (`dark-art.ts`, lit by his ruby).
 * Returns the swordsmen's swings, whose swords and trails draw over the
 * enemies. */
function drawSoldiers(b: Brush, sim: DefendSim, torches: Burning | null) {
  const { c, px } = b;
  const swords: { x: number; y: number; swing: Swing }[] = [];
  for (const u of sim.soldiers) {
    if (u.kind === "mage") {
      drawMage(c, px, u, sim.time);
      continue;
    }
    if (u.kind === "valkyrie") {
      drawValkyrie(c, px, u, sim);
      continue;
    }
    if (u.kind === "darkWizard") {
      drawDarkWizard(c, px, u, sim);
      continue;
    }
    const archer = u.kind === "archer";
    const swing = archer ? null : swingOf(sim, u);
    const x = u.x + (swing?.dx ?? 0),
      y = u.y + (swing?.dy ?? 0);
    const s = Math.max(2, (archer ? ARCHER_UNIT.size : SOLDIER.size) * px);
    c.fillStyle = archer ? "#1b3324" : "#1c2a40";
    c.fillRect(x * px - s / 2 - 1, y * px - s / 2 - 1, s + 2, s + 2);
    c.fillStyle = u.flash > 0 ? "#fff" : archer ? ARCHER_UNIT.color : SOLDIER.color;
    c.fillRect(x * px - s / 2, y * px - s / 2, s, s);
    if (archer) {
      c.fillStyle = "#b58a4f";
      c.fillRect(x * px - s / 2 - Math.max(1, s * 0.3), y * px - s / 2, Math.max(1, s * 0.2), s);
    }
    if (swing) swords.push({ x, y, swing });
    if (torches) drawHandTorch(b, { x: x + SOLDIER.size * 0.65, y: y - SOLDIER.size * 0.45, id: u.id }, sim.time, torches(u.x, u.y, u.id));
  }
  return swords;
}

/** Each sword and its swing's trail, over whoever it is cutting. */
function drawSwords(b: Brush, swords: { x: number; y: number; swing: Swing }[]) {
  for (const { x, y, swing } of swords) {
    drawSwordTrail(b, x, y, swing);
    drawSword(b, x, y, swing.blade, swing.k < 1 ? 1 : 0.8);
  }
}

// ── Sword swings ───────────────────────────────────────────────────────────
// Presentation only: a strike resets the swordsman's cooldown, so the time
// since it is `SOLDIER.cooldown - cd`, and nothing new enters the sim state.

/** Seconds a swing sweeps its half circle, and its trail's fade after. */
const SWING = 0.22,
  TRAIL_FADE = 0.16;
/** How far a swordsman steps into a swing, in cells, and the blade's reach
 * beyond its body. */
const LUNGE = 0.16,
  BLADE = 0.5;
/** Where a swordsman's sword rests between swings: raised on the off side. */
const REST = -Math.PI * 0.6;
const TAU = Math.PI * 2;

/** What the renderer remembers of each swordsman between frames: the way
 * it last faced, the time into its last swing (a drop means a new one), and
 * which way that swing sweeps (they alternate, forehand and back). */
type SwingMemory = { face: number; t: number; side: 1 | -1 };
const swings = new WeakMap<object, SwingMemory>();

type Swing = {
  /** Lunge offset, in cells. */
  dx: number;
  dy: number;
  /** The blade's angle now, and where this swing began. */
  blade: number;
  from: number;
  /** Where the sweep ends: the trail's head, while the blade goes home. */
  end: number;
  /** How far through the sweep, 0 to 1 (past 1 while the trail fades). */
  k: number;
};

function swingOf(sim: DefendSim, u: Soldier): Swing {
  let m = swings.get(u);
  if (!m) swings.set(u, (m = { face: REST + Math.PI / 2, t: Infinity, side: 1 }));
  const e = sim.enemies.find((e) => e.id === u.target);
  if (e) m.face = Math.atan2(e.y - u.y, e.x - u.x);
  const t = SOLDIER.cooldown - u.cd;
  if (t < m.t) m.side = m.side === 1 ? -1 : 1;
  m.t = t;
  if (!(t >= 0 && t < SWING + TRAIL_FADE)) return { dx: 0, dy: 0, blade: REST, from: REST, end: REST, k: 2 };
  const k = t / SWING;
  const eased = k >= 1 ? 1 : 1 - (1 - k) * (1 - k);
  const from = m.face - (m.side * Math.PI) / 2;
  const lunge = k < 1 ? LUNGE * Math.sin(Math.PI * Math.sqrt(k)) : 0;
  const end = from + m.side * Math.PI * eased;
  // Once the sweep ends, the sword eases back to rest while the trail fades.
  const back = k < 1 ? 0 : (t - SWING) / TRAIL_FADE;
  const home = end + ((((REST - end) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
  return { dx: Math.cos(m.face) * lunge, dy: Math.sin(m.face) * lunge, blade: end + (home - end) * back * back, from, end, k };
}

/** A pixel square of side `d` centred on (x, y) in canvas pixels. */
function dot(c: CanvasRenderingContext2D, x: number, y: number, d: number) {
  c.fillRect(Math.round(x - d / 2), Math.round(y - d / 2), d, d);
}

/** The small sword, hilt at the body's edge, pointing along `angle`. */
function drawSword({ c, px }: Brush, x: number, y: number, angle: number, reach: number) {
  const d = Math.max(1, Math.round(px * 0.07));
  const ux = Math.cos(angle),
    uy = Math.sin(angle);
  const r0 = SOLDIER.size * 0.5,
    r1 = r0 + BLADE * reach;
  // The black outline first, a pixel round the blade.
  c.fillStyle = "#0d0d10";
  for (let r = r0; r <= r1; r += d / px) dot(c, (x + ux * r) * px, (y + uy * r) * px, d + 2);
  c.fillStyle = "#dfe6ee";
  for (let r = r0 + 0.08; r <= r1; r += d / px) dot(c, (x + ux * r) * px, (y + uy * r) * px, d);
  // The crossguard and grip in brass.
  c.fillStyle = "#c9a14a";
  const g = r0 + 0.06;
  dot(c, (x + ux * g - uy * 0.07) * px, (y + uy * g + ux * 0.07) * px, d);
  dot(c, (x + ux * g + uy * 0.07) * px, (y + uy * g - ux * 0.07) * px, d);
  dot(c, (x + ux * r0) * px, (y + uy * r0) * px, d);
}

/** The swing's trail: a pale crescent of pixels behind the blade's tip,
 * brightest at the blade and fading toward where the swing began, then
 * fading out altogether once the sweep ends. */
function drawSwordTrail({ c, px }: Brush, x: number, y: number, sw: Swing) {
  if (sw.k > 1 + TRAIL_FADE / SWING) return;
  const fade = sw.k <= 1 ? 1 : 1 - ((sw.k - 1) * SWING) / TRAIL_FADE;
  const span = sw.end - sw.from;
  if (Math.abs(span) < 0.05) return;
  const d = Math.max(1, Math.round(px * 0.07));
  const outer = SOLDIER.size * 0.5 + BLADE;
  const steps = Math.max(6, Math.ceil((Math.abs(span) * outer * px) / d));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps; // 0 where the swing began, 1 at the blade
    const a = sw.from + span * f;
    const ux = Math.cos(a),
      uy = Math.sin(a);
    // The crescent thickens toward the blade.
    const rows = 1 + Math.round(f * 2);
    for (let row = 0; row < rows; row++) {
      const r = outer - (row * d) / px;
      c.globalAlpha = fade * f * f * (row ? 0.45 : 0.85);
      c.fillStyle = row ? "#9fc8ff" : "#eef6ff";
      dot(c, (x + ux * r) * px, (y + uy * r) * px, d);
    }
  }
  c.globalAlpha = 1;
}

/** A unit's hand torch, held at `at`: the stick, and while it `burns` a
 * flickering pixel or two of flame. */
function drawHandTorch({ c, px }: Brush, at: { x: number; y: number; id: number }, t: number, burns: number) {
  const s = Math.max(1, px * 0.14);
  const f = Math.sin(t * 17 + at.id * 1.7) * 0.5 + 0.5;
  c.fillStyle = "#5a3b1e";
  c.fillRect(at.x * px - s / 2, at.y * px, s, s * 1.6);
  if (burns <= 0) return;
  c.globalAlpha = burns;
  c.fillStyle = f > 0.5 ? "#ffe6a8" : "#ffb35c";
  c.fillRect(at.x * px - s / 2, at.y * px - s * (1 + f * 0.5), s, s * (1 + f * 0.5));
  c.globalAlpha = 1;
}

/** Enemies: tiny squares, gold-outlined when marked, with a shadow under
 * fliers; bosses get a dark rim, a crown and a health bar; a Mother and her
 * brood are black with a violet rim, so they show against the night. */
function drawEnemy(b: Brush, e: Enemy) {
  const { c, px } = b;
  const def = ENEMIES[e.kind];
  if (def.fortress) { drawFortress(b, e); return; }
  const s = Math.max(2, Math.round(enemySize(e) * px));
  const x = Math.round(e.x * px - s / 2),
    y = Math.round(e.y * px - s / 2 - (e.kind === "bombBird" ? (e.dive === undefined ? 1 : Math.max(0, e.dive / 0.6)) * px * 1.5 : 0));
  if (e.marked) {
    c.fillStyle = "#f2c94c";
    c.fillRect(x - 1, y - 1, s + 2, s + 2);
  } else if (def.flying) {
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.fillRect(x + px * 0.2, y + px * 0.35, s, s);
  }
  if (def.boss) {
    c.fillStyle = "#1a0606";
    c.fillRect(x - 1, y - 1, s + 2, s + 2);
  } else if (e.kind === "mother" || e.kind === "broodling") {
    if (!e.marked) {
      c.fillStyle = "#6b3d8f";
      c.fillRect(x - 1, y - 1, s + 2, s + 2);
    }
  }
  c.fillStyle = e.flash > 0 ? "#fff" : def.color;
  c.fillRect(x, y, s, s);
  drawHostileMarks(b, e, { x, y, s });
  if (def.boss) drawBossMarks(b, e, { x, y, s });
  if (def.chainLength) {
    c.fillStyle = "#fff2ba";
    c.fillRect(x, y, Math.max(1, s / 3), Math.max(1, s / 3));
    if (e.kind === "dragon") {
      const flap = 0.5 + Math.sin(e.id + e.cd * 8) * 0.25;
      c.fillStyle = "#793254";
      c.fillRect(x - s * flap, y - s / 2, s * flap, s * 1.5);
      c.fillRect(x + s, y - s / 2, s * flap, s * 1.5);
    }
  }
  if (def.shield && (e.shieldHp ?? 0) > 0) {
    c.save();
    c.fillStyle = e.shieldHp === Infinity ? "rgba(166,124,255,0.12)" : "rgba(72,173,255,0.12)";
    c.strokeStyle = e.shieldHp === Infinity ? "#c1a2ff" : "#72c5ff";
    c.lineWidth = Math.max(1, px * 0.06);
    c.beginPath(); c.arc(e.x * px, e.y * px, def.shield.radius * px, 0, Math.PI * 2); c.fill(); c.stroke();
    if (Number.isFinite(e.shieldHp)) {
      c.fillStyle = "#72c5ff";
      c.fillRect(x - s, y - 3, s * 3 * e.shieldHp! / def.shield.hp, 2);
    }
    c.restore();
  }
  if (e.breath) {
    const { dx, dy, t } = e.breath;
    c.save(); c.globalAlpha = Math.min(1, t / 0.2);
    for (let n = 1; n <= 20; n++) {
      const along = n / 4;
      const width = (0.35 + along * 0.45) * px;
      c.fillStyle = n < 9 ? "#fff2a0" : n < 15 ? "#ffad38" : "#e85a27";
      const spread = Math.sin(n * 7 + e.id) * width;
      c.fillRect((e.x + dx * along) * px - dy * spread, (e.y + dy * along) * px + dx * spread, Math.max(2, px * .22), Math.max(2, px * .22));
    }
    c.restore();
  }
  if (e.kind === "mother") drawMotherMarks(b, { x, y, s });
}

/** A Mother's pale eyes and the swollen brood sac on her back. */
function drawMotherMarks({ c }: Brush, sq: { x: number; y: number; s: number }) {
  const { x, y, s } = sq;
  const k = Math.max(1, Math.round(s / 6));
  c.fillStyle = "#3a2350";
  c.fillRect(x + k, y + s - k * 3, s - k * 2, k * 2);
  c.fillStyle = "#e4d6ff";
  c.fillRect(x + k, y + k, k, k);
  c.fillRect(x + s - k * 2, y + k, k, k);
}

/** A crown of spikes and a health bar, so the boss reads at a glance.
 * `sq` is its body square in canvas pixels. */
function drawBossMarks({ c, px }: Brush, e: Enemy, sq: { x: number; y: number; s: number }) {
  const { x, y, s } = sq;
  c.fillStyle = "#f2c94c";
  const k = Math.max(1, s / 5);
  for (let n = 0; n < 3; n++) c.fillRect(x + (n * (s - k)) / 2, y - k, k, k);

}

function drawArrows({ c, px }: Brush, sim: DefendSim) {
  c.strokeStyle = "#eadcb2";
  c.lineWidth = Math.max(1, px * 0.1);
  c.beginPath();
  for (const a of sim.arrows) {
    const dx = a.tx - a.x,
      dy = a.ty - a.y;
    const d = Math.hypot(dx, dy) || 1;
    c.moveTo(a.x * px, a.y * px);
    c.lineTo((a.x - (dx / d) * 0.6) * px, (a.y - (dy / d) * 0.6) * px);
  }
  c.stroke();
}

/** Cannon shells: an iron ball arcing over, its shadow on the ground. */
function drawShells({ c, px }: Brush, sim: DefendSim) {
  for (const sh of sim.shells) {
    const k = sh.t / sh.dur;
    const gx = sh.x0 + (sh.x1 - sh.x0) * k,
      gy = sh.y0 + (sh.y1 - sh.y0) * k;
    const lift = Math.sin(Math.PI * k) * (0.8 + Math.hypot(sh.x1 - sh.x0, sh.y1 - sh.y0) * 0.12);
    const s = Math.max(2, px * 0.3);
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.fillRect(gx * px - s / 2, gy * px - s / 2, s, s * 0.7);
    c.fillStyle = "#1d1d20";
    c.fillRect(gx * px - s / 2, (gy - lift) * px - s / 2, s, s);
    c.fillStyle = "#6a6a70";
    c.fillRect(gx * px - s / 2, (gy - lift) * px - s / 2, Math.max(1, s / 3), Math.max(1, s / 3));
  }
}

/** A blast, a puff of dust from a collapse, or sparks from a hit. */
function drawEffect(b: Brush, fx: Effect) {
  const { c, px } = b;
  const k = fx.t / 0.6;
  if (fx.kind === "boom") return drawExplosion(b, fx, k);
  if (fx.kind === "firework") return drawFirework(b, fx);
  if (fx.kind === "steam") return drawSteam(b, fx, k);
  if (fx.kind === "dust") {
    c.fillStyle = `rgba(150,140,125,${0.45 * (1 - k)})`;
    c.beginPath();
    c.arc(fx.x * px, fx.y * px, fx.r * px * (0.6 + k * 0.6), 0, Math.PI * 2);
    c.fill();
    return;
  }
  c.fillStyle = `rgba(255,230,180,${1 - k})`;
  const s = Math.max(1, px * 0.15);
  for (let n = 0; n < 4; n++) {
    const a = n * 1.57 + fx.x;
    c.fillRect((fx.x + Math.cos(a) * k * 0.6) * px, (fx.y + Math.sin(a) * k * 0.6) * px, s, s);
  }
}

/** A hiss of steam where fire or a blast met a magic boat's water: pale
 * pixel puffs rising and thinning. */
function drawSteam({ c, px }: Brush, fx: Effect, k: number) {
  const s = Math.max(1, Math.round(px / 8)) * 2;
  for (let n = 0; n < 7; n++) {
    const a = n * 2.4 + fx.x * 3.1, out = fx.r * (0.2 + 0.6 * k) * (0.5 + hash01(n, Math.round(fx.x * 64), Math.round(fx.y * 64)) * 0.5);
    const x = fx.x + Math.cos(a) * out, y = fx.y + Math.sin(a) * out * 0.7 - k * 0.7;
    c.fillStyle = `rgba(232,238,242,${(0.7 * (1 - k)).toFixed(3)})`;
    c.fillRect(Math.round(x * px - s / 2), Math.round(y * px - s / 2), s, s);
  }
}

/** A ragged fireball `k` of the way through: noisy blob outlines (never a
 * clean circle) for the smoke, flame and white-hot core, plus flung sparks
 * and debris. */
function drawExplosion({ c, px }: Brush, fx: Effect, k: number) {
  const { x, y, r } = fx;
  const seed = fx.seed ?? 0;
  const blob = (radius: number, salt: number, wobble: number) => {
    const n = 16;
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 + hash01(seed, salt) * 0.8;
      const rr = radius * (1 - wobble + wobble * 2 * hash01(seed, salt, i % n));
      const px2 = (x + Math.cos(a) * rr) * px,
        py2 = (y + Math.sin(a) * rr * 0.9) * px;
      if (i === 0) c.moveTo(px2, py2);
      else c.lineTo(px2, py2);
    }
    c.closePath();
    c.fill();
  };
  const grow = 0.35 + 0.65 * Math.sqrt(k);
  c.save();
  // Smoke billows out and lingers darkest at the end.
  c.fillStyle = `rgba(40,32,28,${0.45 * (1 - k) * Math.min(1, k * 4)})`;
  blob(r * grow * 1.05, 1, 0.3);
  c.globalCompositeOperation = "lighter";
  c.fillStyle = `rgba(255,120,30,${0.75 * (1 - k)})`;
  blob(r * grow * 0.85, 2, 0.28);
  c.fillStyle = `rgba(255,200,90,${0.8 * (1 - k) ** 1.5})`;
  blob(r * grow * 0.55, 3, 0.25);
  c.fillStyle = `rgba(255,250,220,${0.9 * (1 - k) ** 3})`;
  blob(r * grow * 0.28, 4, 0.2);
  const s = Math.max(1, px * 0.12);
  for (let i = 0; i < 12; i++) {
    const a = hash01(seed, 20, i) * Math.PI * 2;
    const d = r * (0.3 + hash01(seed, 21, i) * 1.1) * Math.sqrt(k);
    c.fillStyle = i % 3 ? `rgba(255,190,90,${1 - k})` : `rgba(90,70,55,${1 - k})`;
    c.fillRect((x + Math.cos(a) * d) * px, (y + Math.sin(a) * d) * px, s, s);
  }
  c.restore();
}

// ── Scorches ──────────────────────────────────────────────────────────────

/** Branching cracks, glowing like cooling embers where a blast landed. */
export function drawScorches(b: Brush, sim: DefendSim) {
  for (const sc of sim.scorches) drawScorch(b, sc);
}

function drawScorch(b: Brush, sc: Scorch) {
  const { c, px } = b;
  const k = sc.t / sc.life;
  const heat = (1 - k) ** 1.6;
  // Scorched ground under the cracks.
  c.fillStyle = `rgba(20,14,10,${0.35 * (1 - k)})`;
  c.beginPath();
  c.ellipse(sc.x * px, sc.y * px, sc.r * 0.55 * px, sc.r * 0.5 * px, 0, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.globalCompositeOperation = "lighter";
  c.lineCap = "round";
  const arms = 5 + (hash01(sc.seed, 30) * 3) | 0;
  // A wide dim glow under a narrow bright one.
  for (const [width, color] of [
    [0.22, `rgba(255,90,20,${0.35 * heat})`],
    [0.09, `rgba(255,190,90,${0.9 * heat})`],
  ] as const) {
    c.strokeStyle = color;
    c.lineWidth = Math.max(1, px * width);
    c.beginPath();
    for (let i = 0; i < arms; i++) traceCrack(b, sc, i, arms);
    c.stroke();
  }
  c.restore();
}

/** Crack `i` of `arms`: a wandering line out from the blast, with the odd
 * little fork. */
function traceCrack({ c, px }: Brush, sc: Scorch, i: number, arms: number) {
  let a = (i / arms) * Math.PI * 2 + hash01(sc.seed, 31, i) * 0.9;
  let cx = sc.x,
    cy = sc.y;
  c.moveTo(cx * px, cy * px);
  const len = sc.r * (0.45 + hash01(sc.seed, 32, i) * 0.45);
  const steps = 4;
  for (let j = 1; j <= steps; j++) {
    a += (hash01(sc.seed, 33, i * 7 + j) - 0.5) * 0.9;
    cx += (Math.cos(a) * len) / steps;
    cy += (Math.sin(a) * len) / steps;
    c.lineTo(cx * px, cy * px);
    if (j === 2 && hash01(sc.seed, 34, i) < 0.6) {
      const f = a + (hash01(sc.seed, 35, i) < 0.5 ? 0.9 : -0.9);
      c.lineTo((cx + Math.cos(f) * len * 0.3) * px, (cy + Math.sin(f) * len * 0.3) * px);
      c.moveTo(cx * px, cy * px);
    }
  }
}

/** Walking units' footprints for the lighting's shadow pass. */
export function shadowCasters(sim: DefendSim) {
  const def = (e: Enemy): EnemyDef => ENEMIES[e.kind];
  return [
    ...sim.soldiers.map((u) => ({ x: u.x, y: u.y, size: u.kind === "archer" ? ARCHER_UNIT.size : u.kind === "mage" ? FIRE_MAGE.size : u.kind === "valkyrie" ? VALKYRIE.size : u.kind === "darkWizard" ? DARK_WIZARD.size : SOLDIER.size })),
    ...sim.civilians.map((u) => ({ x: u.x, y: u.y, size: CIVILIAN.size })),
    ...sim.enemies.filter((e) => !def(e).flying).map((e) => ({ x: e.x, y: e.y, size: enemySize(e) })),
  ];
}

/** Light that moves with the battle: every unit's hand torch, and each
 * blast's brief flash (wider and brighter, fading as it burns out). */
export function carriedLights(sim: DefendSim): CarriedLight[] {
  const torches: CarriedLight[] = [...sim.soldiers, ...sim.civilians].map((u) => ({ x: u.x, y: u.y, id: u.id }));
  for (const fx of sim.effects)
    if (fx.kind === "boom") torches.push({ x: fx.x, y: fx.y, id: fx.seed ?? 0, r: fx.r * 2.4, k: 1.6 * (1 - fx.t / 0.6) });
  torches.push(...siegeLights(sim), ...boatLights(sim));
  return torches;
}
