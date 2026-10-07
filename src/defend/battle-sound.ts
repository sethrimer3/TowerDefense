import { play, type Cue } from "../sound.ts";
import type { DefendSim } from "./sim.ts";

/** The battle as heard from the walls: each frame, what was loosed, cast,
 * burst or brought down since the last one becomes a cue, louder the more
 * of it there was. Presentation only: it reads the sim and changes nothing.
 * Every shot and effect is an object the sim pushes once, so a WeakSet of
 * those already heard tells the new ones apart. */
export class BattleSound {
  private heard = new WeakSet<object>();
  private sim: DefendSim | null = null;
  private mapVersion = 0;

  hear(sim: DefendSim) {
    if (sim !== this.sim) {
      // A new run: what's already there is the opening, not news.
      this.sim = sim;
      this.heard = new WeakSet();
      this.mapVersion = sim.mapVersion;
    }
    const count = (list: readonly object[]) => {
      let n = 0;
      for (const o of list) if (!this.heard.has(o)) {
        this.heard.add(o);
        n++;
      }
      return n;
    };
    const cue = (c: Cue, n: number, loud: number) => {
      if (n > 0) play(c, loud * Math.min(1.6, 0.75 + 0.25 * Math.log2(n)));
    };
    cue("arrow", count(sim.arrows), 0.5);
    cue("cannon", count(sim.shells), 0.55);
    cue("cannon", count(sim.siegeShots), 0.5);
    cue("fireball", count(sim.fireballs), 0.55);
    cue("fireball", count(sim.flames), 0.35);
    cue("frost", count(sim.frosts), 0.5);
    cue("zap", count(sim.bolts), 0.55);
    cue("swish", count(sim.stabs), 0.5);
    cue("thunk", count(sim.ballistaBolts), 0.6);
    let booms = 0, dust = 0, steam = 0, rockets = 0, big = 0;
    for (const e of sim.effects) {
      if (this.heard.has(e)) continue;
      this.heard.add(e);
      if (e.kind === "boom") {
        booms++;
        big = Math.max(big, e.r);
      } else if (e.kind === "dust") dust++;
      else if (e.kind === "steam") steam++;
      else if (e.kind === "firework") rockets++;
    }
    cue("blast", booms, Math.min(0.9, 0.45 + big * 0.12));
    const sunk = count(sim.sinkings);
    cue("crumble", dust, 0.6);
    cue("hiss", sunk, 0.7);
    cue("hiss", steam, 0.5);
    cue("firework", rockets, 0.5);
    // Every change to the map that wasn't a fall is the city's people
    // setting a stone back.
    const changes = sim.mapVersion - this.mapVersion - dust - sunk;
    this.mapVersion = sim.mapVersion;
    if (changes > 0) cue("hammer", changes, 0.45);
  }
}
