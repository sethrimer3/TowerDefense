/** The snipers' lasers, presentation only. Every sniper, and every
 * Revolutionary's laser sniper, holds a thin laser on whom it would shoot
 * (`sniperAim`), faint as it starts to reload and brightening as it locks
 * on (the reload run down), a red one for a lodge's, a cyan one for a
 * Revolutionary's, which zigzags on through every enemy its bullet will
 * strike (`chainTargets`). When it fires, the beam flashes the length of
 * the shot and fades, and each bullet in flight trails a bright streak back
 * along its leg. Everything is read from the sim; nothing is stored. */
import { RAIL_SNIPER } from "./catalog.ts";
import { chainTargets } from "./revolutionary.ts";
import { sniperAim, sniperReload } from "./snipers.ts";
import type { DefendSim, Enemy, Soldier } from "./sim.ts";

type Ctx = CanvasRenderingContext2D;
/** Each laser's colour, as "r, g, b". */
const RED = "255, 64, 52", CYAN = "96, 240, 255";
/** How long a shot's flash lasts, in seconds. */
const FLASH = 0.12;
/** How far back a bullet's streak reaches, in cells. */
const STREAK = 2.5;

const isSniper = (u: Soldier) => u.kind === "sniper" || u.kind === "railSniper";

/** The lock-on lasers and shot flashes, then the bullets' streaks. */
export function drawLasers(c: Ctx, px: number, sim: DefendSim) {
  const snipers = sim.soldiers.filter(isSniper);
  if (!snipers.length) return;
  c.save();
  c.lineCap = "round";
  for (const u of snipers) {
    const rail = u.kind === "railSniper", rgb = rail ? CYAN : RED;
    const reload = rail ? RAIL_SNIPER.cooldown : sniperReload(sim, u);
    const since = reload - u.cd, lock = Math.max(0, Math.min(1, since / reload));
    const target = sniperAim(sim, u);
    if (!target) continue;
    const marks: Enemy[] = rail ? chainTargets(sim, target) : [target];
    const pts = [{ x: u.x, y: u.y }, ...marks];
    // Just fired: the beam flashes the length of the shot.
    if (since >= 0 && since < FLASH) beam(c, px, pts, rgb, 1 - since / FLASH, 2.2);
    // Locking on: faint, then brighter, then a steady pulse once locked.
    const glow = lock >= 1 ? 0.75 + 0.2 * Math.sin(sim.time * 14 + u.id) : 0.1 + 0.6 * lock * lock;
    beam(c, px, pts, rgb, glow, 1);
    // The dot on its mark, once nearly locked.
    if (lock > 0.6) for (const m of marks) dot(c, px, m.x, m.y, rgb, glow);
  }
  // Each bullet's streak back along its leg.
  const kinds = new Map(snipers.map((u) => [u.id, u.kind]));
  for (const a of sim.arrows) {
    const k = a.shot === "bullet" && a.origin?.attacker !== undefined ? kinds.get(a.origin.attacker) : undefined;
    if (!k) continue;
    const from = a.chain?.from ?? a.origin!;
    let dx = from.x - a.x, dy = from.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-3) continue;
    const len = Math.min(STREAK, d);
    dx = (dx / d) * len;
    dy = (dy / d) * len;
    const g = c.createLinearGradient(a.x * px, a.y * px, (a.x + dx) * px, (a.y + dy) * px);
    const rgb = k === "railSniper" ? CYAN : RED;
    g.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    g.addColorStop(0.25, `rgba(${rgb}, 0.7)`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    c.strokeStyle = g;
    c.lineWidth = Math.max(1, px * 0.09);
    line(c, px, a.x, a.y, a.x + dx, a.y + dy);
  }
  c.restore();
}

/** A laser along `pts`: a soft glow under a thin bright core, `width` times
 * a laser's own. */
function beam(c: Ctx, px: number, pts: { x: number; y: number }[], rgb: string, alpha: number, width: number) {
  const core = Math.max(1, px * 0.04) * width;
  c.strokeStyle = `rgba(${rgb}, ${alpha * 0.25})`;
  c.lineWidth = core * 3;
  path(c, px, pts);
  c.strokeStyle = `rgba(${rgb}, ${alpha})`;
  c.lineWidth = core;
  path(c, px, pts);
  if (width > 1) {
    c.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
    c.lineWidth = Math.max(1, core * 0.4);
    path(c, px, pts);
  }
}

function path(c: Ctx, px: number, pts: { x: number; y: number }[]) {
  c.beginPath();
  c.moveTo(pts[0].x * px, pts[0].y * px);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x * px, pts[i].y * px);
  c.stroke();
}

function line(c: Ctx, px: number, x0: number, y0: number, x1: number, y1: number) {
  c.beginPath();
  c.moveTo(x0 * px, y0 * px);
  c.lineTo(x1 * px, y1 * px);
  c.stroke();
}

/** The laser's dot on a mark: a small bright square. */
function dot(c: Ctx, px: number, x: number, y: number, rgb: string, alpha: number) {
  const s = Math.max(2, Math.round(px * 0.14));
  c.fillStyle = `rgba(${rgb}, ${alpha})`;
  c.fillRect(Math.round(x * px - s / 2), Math.round(y * px - s / 2), s, s);
}
