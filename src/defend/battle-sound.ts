import { play, type Cue } from "../sound.ts";
import type { Fireball } from "./mages.ts";
import type { Arrow, Civilian, DefendSim, Soldier } from "./sim.ts";

/** Troops whose blows land up close, heard as a punch each stroke. */
const MELEE = new Set<Soldier["kind"]>(["sword", "brawler", "assassin", "spearman", "hoplite", "lancer", "hero", "undead", "reinforcement"]);
/** A blast at least this wide (in cells) is heard as the big explosion. */
const BIG_BLAST = 1.8;

/** The battle as heard from the walls: each frame, what was loosed, cast,
 * burst or brought down since the last one becomes a cue, louder the more
 * of it there was. Presentation only: it reads the sim and changes nothing.
 * Every shot and effect is an object the sim pushes once, so a WeakSet of
 * those already heard tells the new ones apart; what landed or fell is
 * what was in last frame's lists and isn't now (or has run out of HP). */
export class BattleSound {
  private heard = new WeakSet<object>();
  private sim: DefendSim | null = null;
  private mapVersion = 0;
  /** Last frame's arrows, fireballs, troops and people. */
  private arrows: Arrow[] = [];
  private fireballs: Fireball[] = [];
  private soldiers: Soldier[] = [];
  private civilians: Civilian[] = [];
  /** Each building's standing last frame (1) or not. */
  private standing = new Uint8Array(0);
  /** Each melee troop's cooldown last frame: a jump up is a stroke. */
  private cooldowns = new WeakMap<Soldier, number>();

  hear(sim: DefendSim) {
    if (sim !== this.sim) {
      // A new run: what's already there is the opening, not news.
      this.sim = sim;
      this.heard = new WeakSet();
      this.mapVersion = sim.mapVersion;
      this.arrows = this.fireballs = this.soldiers = this.civilians = [];
      this.standing = Uint8Array.from(sim.map.buildings, (b) => (sim.hp[b.id] > 0 ? 1 : 0));
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
    cue("thunk", count(sim.nanoShells), 0.5);
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
    cue(big >= BIG_BLAST ? "bigBlast" : "blast", booms, Math.min(0.9, 0.45 + big * 0.12));
    cue("meteorHit", count(sim.impacts), 0.9);
    let splashes = 0;
    for (const f of sim.floods) if (!this.heard.has(f)) {
      this.heard.add(f);
      if (!f.frozen && !f.decorative) splashes++;
    }
    cue("splash", splashes, 0.4);
    const sunk = count(sim.sinkings);
    const fell = this.falls(sim, cue);
    // Dust that wasn't a building falling: a giant's cleave, risen bones.
    cue("crumble", dust - fell, 0.6);
    cue("sinking", sunk, 0.7);
    cue("hiss", steam, 0.5);
    cue("firework", rockets, 0.5);
    this.landings(sim, cue);
    // Every change to the map that wasn't a fall is the city's people
    // setting a stone back.
    const changes = sim.mapVersion - this.mapVersion - dust - sunk;
    this.mapVersion = sim.mapVersion;
    if (changes > 0) cue("hammer", changes, 0.45);
  }

  /** The buildings that fell since last frame, heard by what they were
   * made of; returns how many (sinkings aside, which are heard as water). */
  private falls(sim: DefendSim, cue: (c: Cue, n: number, loud: number) => void) {
    const sunk = new Set<number>();
    for (const s of sim.sinkings) sunk.add(s.building);
    let houses = 0, stones = 0, keep = 0;
    for (const b of sim.map.buildings) {
      const up = sim.hp[b.id] > 0 ? 1 : 0;
      if (this.standing[b.id] && !up && !sunk.has(b.id)) {
        if (b.kind === "keep") keep++;
        else if (b.kind === "house") houses++;
        else stones++;
      }
      this.standing[b.id] = up;
    }
    cue("keepFall", keep, 1);
    cue("houseFall", houses, 0.6);
    cue("stoneFall", stones, 0.6);
    return houses + stones + keep;
  }

  /** What struck home or fell since last frame: arrows and fireballs gone
   * from their lists, melee strokes (a troop's cooldown jumping back up),
   * and the city's troops and people who died. */
  private landings(sim: DefendSim, cue: (c: Cue, n: number, loud: number) => void) {
    const gone = <T extends object>(before: T[], now: T[], hits: (o: T) => boolean) => {
      if (!before.length) return 0;
      const still = new Set(now);
      let n = 0;
      for (const o of before) if (!still.has(o) && hits(o)) n++;
      return n;
    };
    cue("arrowHit", gone(this.arrows, sim.arrows, (a) => a.shot !== "rocket" && !a.pierce && !a.sky), 0.55);
    cue("fireballHit", gone(this.fireballs, sim.fireballs, () => true), 0.5);
    this.arrows = sim.arrows;
    this.fireballs = sim.fireballs;
    let strokes = 0;
    for (const s of sim.soldiers) {
      if (!MELEE.has(s.kind)) continue;
      const was = this.cooldowns.get(s);
      if (was !== undefined && s.cd > was + 0.05) strokes++;
      this.cooldowns.set(s, s.cd);
    }
    cue("punch", strokes, 0.5);
    let dead = 0;
    for (const s of this.soldiers) if (s.hp <= 0 && !s.called?.left && !this.heard.has(s)) {
      this.heard.add(s);
      dead++;
    }
    for (const c of this.civilians) if (c.hp <= 0 && !this.heard.has(c)) {
      this.heard.add(c);
      dead++;
    }
    cue("bodyFall", dead, 0.6);
    this.soldiers = sim.soldiers;
    this.civilians = sim.civilians;
  }
}
