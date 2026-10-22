/** DEFEND's fire and ice cancel each other out.
 *
 * On the ground: where burning ground (`sim.blazes`: a mage's fireball, a
 * Molten core crater, a Grenadier's ball) meets the Frost nova's rime
 * (`sim.rime`), the smaller of the two goes out in a cloud of steam and the
 * larger shrinks by the area it spent, so a meteor's crater frozen over by a
 * nova is put out (and the rime left smaller), and a wandering blizzard
 * douses the fires it drifts across.
 *
 * On the enemies: one burning (`burn`) and chilled or frozen at once has
 * both put out, so neither the burn nor the cold lasts; burning ground thaws
 * whoever walks through it, and the rime douses whoever burns in it.
 *
 * Wizard towers' flames and ice fronts are passing blows, not lasting
 * effects, and are left alone. Nothing here draws from the run's random
 * stream, and nothing happens unless fire and ice meet, so runs where they
 * never do play exactly as before. */
import { dist, sq } from "../exact.ts";
import { ENEMIES } from "./catalog.ts";
import { sheltered } from "./boats.ts";
import type { DefendSim, Enemy } from "./sim.ts";

/** Burning ground and rime meet and cancel; burning and frozen enemies thaw
 * and go out. Runs after the step's fire and ice are laid. */
export function quench(sim: DefendSim) {
  if (sim.blazes.length && sim.rime.length) quenchGround(sim);
  for (const b of sim.blazes)
    for (const e of sim.enemiesNear(b.x, b.y, b.r))
      if ((e.chill !== undefined || e.freeze !== undefined) && !ENEMIES[e.kind].flying && dist(e.x - b.x, e.y - b.y) <= b.r && !sheltered(sim, e.x, e.y)) thaw(sim, e);
  for (const f of sim.rime)
    for (const e of sim.enemiesNear(f.x, f.y, f.r))
      if (e.burn !== undefined && dist(e.x - f.x, e.y - f.y) <= f.r) douse(sim, e);
  for (const e of sim.enemies)
    if (e.burn !== undefined && (e.chill !== undefined || e.freeze !== undefined)) {
      douse(sim, e);
      thaw(sim, e, false);
    }
}

/** Each blaze and patch of rime that overlap: the smaller goes out, the
 * larger keeps the area left over (radius √(R² − r²)). */
function quenchGround(sim: DefendSim) {
  for (const b of sim.blazes) {
    if (b.t >= b.life) continue;
    for (const f of sim.rime) {
      if (f.t >= f.life || dist(b.x - f.x, b.y - f.y) >= b.r + f.r) continue;
      steam(sim, (b.x + f.x) / 2, (b.y + f.y) / 2, Math.min(b.r, f.r));
      if (b.r <= f.r) {
        f.r = Math.sqrt(sq(f.r) - sq(b.r));
        b.t = b.life;
        if (f.r < 0.25) f.t = f.life;
        break;
      }
      b.r = Math.sqrt(sq(b.r) - sq(f.r));
      f.t = f.life;
      if (b.r < 0.25) {
        b.t = b.life;
        break;
      }
    }
  }
  sim.blazes = sim.blazes.filter((b) => b.t < b.life);
  sim.rime = sim.rime.filter((f) => f.t < f.life);
}

/** Melts `e`'s chill and freeze. */
function thaw(sim: DefendSim, e: Enemy, puff = true) {
  delete e.chill;
  delete e.freeze;
  if (puff) steam(sim, e.x, e.y, 0.5);
}

/** Puts out `e`'s burn. */
function douse(sim: DefendSim, e: Enemy) {
  delete e.burn;
  delete e.burnDps;
  steam(sim, e.x, e.y, 0.5);
}

function steam(sim: DefendSim, x: number, y: number, r: number) {
  sim.effects.push({ kind: "steam", x, y, t: 0, r: Math.max(0.5, r) });
}
