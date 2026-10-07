/** The alchemy lab, a vaulted cellar under the nave where the researchers
 * work: what each of them does there (an errand at a time, from station to
 * station), and the state of the apparatus they tend, which the renderer
 * shows. The athanor cools unless someone works its bellows; the cauldron
 * takes the colour of whatever is poured in and boils as hard as the fire
 * under it; the alembic drips distillate into its receiver, which, full, is
 * carried to the philosopher's stone on its pedestal and makes it glow; a
 * chant lights the transmutation circle on the wall (so does a research
 * bought in the Study beneath the library). Now and then a brew goes wrong in a cloud of
 * coloured smoke and leaves its brewer sooty, and its mess on the floor
 * until someone sweeps it up. A researcher may taste the brew (and float a
 * moment, or hiccup bubbles), read a scroll, feed the homunculus, or look
 * over a colleague's shoulder at the desk. The annexes a bigger lab opens
 * add their own errands: tending the mandrakes (one pulled now and then,
 * shrieking), reading aloud at the lectern, casting gold at the crucible,
 * winding the orrery, feeding the salamander (which breathes fire for it)
 * and gazing into the orb.
 *
 * Draws only from the library's stream, passed in. */
import type { Action, Librarian, Step } from "./sim.ts";
import { LAB, LAB_NEEDS, type LabStation } from "./geometry.ts";

/** Elixir colours (0 is the cauldron's plain murk). */
export const ELIXIRS = ["#4a6a34", "#4ad86a", "#c050e0", "#e8a030", "#40b8e8", "#e04848", "#e8e070"];

export type LabState = {
  /** The athanor's heat, 0 to 1: stoked by the bellows, cooling slowly. */
  furnace: number;
  /** The cauldron's colour (an `ELIXIRS` index). */
  brew: number;
  /** Distillate in the alembic's receiver, 0 to 1. */
  still: number;
  /** The circle's glow after a chant or a research bought, fading. */
  glow: number;
  /** The philosopher's stone's glow, fed by distillates, fading. */
  stone: number;
  /** Bursts of coloured smoke: where, which elixir, when (sim seconds), and
   * whether something went wrong. */
  puffs: { x: number; color: number; at: number; big: boolean }[];
  /** Who works at each station (0 nobody). */
  busy: Partial<Record<LabStation, number>>;
  /** The lab's level (1 to `LAB_MAX_LEVEL`): which stations stand. */
  level: number;
  /** Soot and spilt brew on the floor by the cauldron after a mishap (0 to 1). */
  mess: number;
  /** Who is sweeping it up (0 nobody). */
  sweeper: number;
  /** When (sim seconds) a mandrake last shrieked, gold was last cast, the
   * homunculus was last fed and the salamander last breathed fire. */
  shriek: number;
  cast: number;
  /** Gold bars cast so far (the stack by the crucible shows the last few). */
  casts: number;
  fed: number;
  breath: number;
  /** How fast the orrery turns (wound up, running down) and how bright the
   * orb is (gazed into, fading), 0 to 1. */
  orrery: number;
  orb: number;
};
export const newLab = (level = 1): LabState => ({
  furnace: 0.5, brew: 0, still: 0.3, glow: 0, stone: 0.3, puffs: [], busy: {}, level, mess: 0, sweeper: 0, shriek: -99, cast: -99, casts: 0, fed: -99, breath: -99, orrery: 0.3, orb: 0.2,
});
/** Whether a station stands in a lab of `level`. */
export const hasStation = (k: LabStation, level: number) => level >= (LAB_NEEDS[k] ?? 1);

/** Lets the apparatus cool and fade, and the alembic drip while it's hot. */
export function stepLab(lab: LabState, dt: number, time: number) {
  lab.furnace = Math.max(0.15, lab.furnace - dt / 100);
  lab.still = Math.min(1, lab.still + (dt * lab.furnace) / 400);
  lab.glow = Math.max(0, lab.glow - dt * 0.12);
  lab.stone = Math.max(0.2, lab.stone - dt / 240);
  lab.orrery = Math.max(0.1, lab.orrery - dt / 150);
  lab.orb = Math.max(0.15, lab.orb - dt / 90);
  if (lab.puffs.length) lab.puffs = lab.puffs.filter((p) => time - p.at < 6);
}
/** Lets go of every station `id` holds. */
export function leaveLab(lab: LabState, id: number) {
  for (const k of Object.keys(lab.busy) as LabStation[]) if (lab.busy[k] === id) delete lab.busy[k];
  if (lab.sweeper === id) lab.sweeper = 0;
}

/** The next errand for a researcher in the lab. */
export function labErrand(l: Librarian, lab: LabState, rng: () => number, night: number, time: () => number): Step[] {
  const free = (k: LabStation) => hasStation(k, lab.level) && (!lab.busy[k] || lab.busy[k] === l.id);
  const take = (k: LabStation) => (lab.busy[k] = l.id);
  const done = (k: LabStation) => () => {
    if (lab.busy[k] === l.id) delete lab.busy[k];
  };
  const at = (k: LabStation): Step => ({ kind: "walk", x: LAB[k].x });
  const work = (k: LabStation, t: number, action: Action, after?: () => void): Step =>
    ({ kind: "work", t, action, face: LAB[k].face, done: after });

  // Tired: a doze on the desk's stool by night, else a draught from the cauldron.
  if (l.energy < 0.25) {
    if (night >= 0.5 && free("desk")) {
      take("desk");
      return [at("desk"), work("desk", 20 + rng() * 20, "doze", () => {
        l.energy = 1;
        done("desk")();
      })];
    }
    if (free("cauldron")) {
      take("cauldron");
      return [at("cauldron"), work("cauldron", 1.5, "grab", () => {
        l.hand = "flask";
        l.vial = lab.brew;
        done("cauldron")();
      }), { kind: "walk", x: LAB.circle.x - 14 + rng() * 10 }, { kind: "work", t: 5 + rng() * 3, action: "drink", done: () => {
        l.hand = "";
        l.energy = 1;
      } }];
    }
  }

  const options: { w: number; plan: () => Step[] }[] = [];
  if (free("jars") && free("cauldron"))
    options.push({ w: 3, plan: () => {
      // An ingredient off the shelf into the cauldron, then stirred in.
      take("jars");
      take("cauldron");
      const color = 1 + Math.floor(rng() * (ELIXIRS.length - 1));
      return [at("jars"), work("jars", 1.2 + rng(), "grab", () => {
        l.hand = "flask";
        l.vial = color;
        done("jars")();
      }), at("cauldron"), work("cauldron", 1.4, "pour", () => {
        l.hand = "";
        lab.brew = color;
        lab.puffs.push({ x: LAB.cauldron.x + 9, color, at: time(), big: false });
      }), work("cauldron", 6 + rng() * 6, "stir", () => {
        done("cauldron")();
        if (rng() < 0.08) {
          // It goes wrong: a cloud of smoke, and a sooty, startled brewer.
          lab.puffs.push({ x: LAB.cauldron.x + 9, color: lab.brew, at: time(), big: true });
          l.soot = 1;
          lab.mess = 1;
          l.steps.unshift({ kind: "work", t: 1.6, action: "stumble", face: 1 });
        }
      })];
    } });
  if (free("athanor")) options.push({ w: lab.furnace < 0.5 ? 4 : 1, plan: () => {
    take("athanor");
    return [at("athanor"), work("athanor", 5 + rng() * 4, "stoke", () => {
      lab.furnace = 1;
      done("athanor")();
    })];
  } });
  if (free("alembic") && free("circle")) options.push({ w: lab.still > 0.7 ? 4 : 1.5, plan: () => {
    // Tend the alembic; a full receiver goes to the stone on its pedestal.
    take("alembic");
    const steps: Step[] = [at("alembic"), work("alembic", 6 + rng() * 4, "distill", () => {
      lab.still = Math.min(1, lab.still + 0.35);
      done("alembic")();
      if (lab.still < 1 || !free("circle")) return;
      take("circle");
      lab.still = 0;
      l.hand = "flask";
      l.vial = 4;
      l.steps.unshift(at("circle"), work("circle", 1.2, "place", () => {
        l.hand = "";
        lab.stone = 1;
        lab.puffs.push({ x: LAB.circle.x + 6, color: 6, at: time(), big: false });
        done("circle")();
      }));
    })];
    return steps;
  } });
  if (free("desk")) options.push({ w: 2.5, plan: () => {
    take("desk");
    return [at("desk"), work("desk", 12 + rng() * 14, "study", done("desk"))];
  } });
  if (free("mortar")) options.push({ w: 1.5, plan: () => {
    take("mortar");
    return [at("mortar"), work("mortar", 6 + rng() * 4, "grind", done("mortar"))];
  } });
  if (free("circle")) options.push({ w: 1, plan: () => {
    take("circle");
    return [at("circle"), work("circle", 6 + rng() * 4, "chant", () => {
      lab.glow = Math.max(lab.glow, 0.8);
      done("circle")();
    })];
  } });
  if (free("jar")) options.push({ w: 1, plan: () => {
    take("jar");
    return [at("jar"), work("jar", 4 + rng() * 4, "observe", done("jar"))];
  } });
  if (lab.mess > 0.1 && !lab.sweeper)
    options.push({ w: 6, plan: () => {
      // A brew gone wrong swept up.
      lab.sweeper = l.id;
      return [{ kind: "walk", x: LAB.cauldron.x - 3 }, { kind: "work", t: 0.8, action: "grab", done: () => (l.hand = "broom") },
        { kind: "work", t: 7 + rng() * 3, action: "sweep", face: 1, done: () => {
          l.hand = "";
          lab.mess = 0;
          lab.sweeper = 0;
        } }];
    } });
  if (free("cauldron") && lab.brew) options.push({ w: 1, plan: () => {
    // A taste of the brew: and it takes them one way or another.
    take("cauldron");
    const after: Step[] = [];
    const r = rng();
    if (r < 0.3) after.push({ kind: "work", t: 3 + rng() * 2, action: "float" });
    else if (r < 0.6) after.push({ kind: "work", t: 2 + rng() * 2, action: "hiccup" });
    return [at("cauldron"), work("cauldron", 1.2, "grab", () => {
      l.hand = "flask";
      l.vial = lab.brew;
    }), work("cauldron", 2.5, "taste", () => {
      l.hand = "";
      done("cauldron")();
    }), ...after];
  } });
  if (free("desk")) options.push({ w: 1, plan: () => {
    // A scroll off the shelf over the desk, read standing under the vault.
    take("desk");
    return [at("desk"), work("desk", 1.2, "grab", done("desk")), { kind: "walk", x: 120 + rng() * 30 }, { kind: "work", t: 8 + rng() * 8, action: "scroll" }];
  } });
  const studying = lab.busy.desk && lab.busy.desk !== l.id;
  if (studying) options.push({ w: 0.8, plan: () => [{ kind: "walk", x: LAB.desk.x + 5 }, { kind: "work", t: 5 + rng() * 4, action: "confer", face: -1 }] });
  if (free("jar") && time() - lab.fed > 60) options.push({ w: 0.8, plan: () => {
    take("jar");
    return [at("jar"), work("jar", 3 + rng() * 2, "feed", () => {
      lab.fed = time();
      done("jar")();
    })];
  } });
  if (free("garden")) options.push({ w: 2, plan: () => {
    // The mandrakes watered; now and then one pulled, shrieking, and replanted.
    take("garden");
    const steps: Step[] = [at("garden"), work("garden", 5 + rng() * 4, "tend")];
    if (rng() < 0.3) steps.push(work("garden", 2.4, "pull", () => (lab.shriek = time())), work("garden", 1.5, "place"));
    steps.push({ kind: "work", t: 0, action: "idle", done: done("garden") });
    return steps;
  } });
  if (free("lectern")) options.push({ w: 2, plan: () => {
    take("lectern");
    return [at("lectern"), work("lectern", 10 + rng() * 8, "recite", done("lectern"))];
  } });
  if (free("crucible")) options.push({ w: 2, plan: () => {
    // Lead melted down and poured, and the bar comes out of the mould gold.
    take("crucible");
    return [at("crucible"), work("crucible", 4 + rng() * 3, "stoke"), work("crucible", 2.5, "cast", () => {
      lab.cast = time();
      lab.casts++;
      done("crucible")();
    })];
  } });
  if (free("orrery")) options.push({ w: lab.orrery < 0.4 ? 2.5 : 1, plan: () => {
    take("orrery");
    return [at("orrery"), work("orrery", 4 + rng() * 3, "wind", () => {
      lab.orrery = 1;
      done("orrery")();
    })];
  } });
  if (free("salamander")) options.push({ w: 1.5, plan: () => {
    take("salamander");
    return [at("salamander"), work("salamander", 3 + rng() * 2, "feed", () => {
      lab.breath = time();
      done("salamander")();
    }), { kind: "work", t: 1.6, action: "stumble", face: -1 }];
  } });
  if (free("orb")) options.push({ w: 2, plan: () => {
    take("orb");
    return [at("orb"), work("orb", 8 + rng() * 8, "scry", () => {
      lab.orb = 1;
      done("orb")();
    })];
  } });
  const total = options.reduce((n, o) => n + o.w, 0);
  if (!total) return [{ kind: "walk", x: 30 + rng() * 140 }, { kind: "work", t: 2 + rng() * 3, action: "idle" }];
  let pick = rng() * total;
  for (const o of options) if ((pick -= o.w) < 0) return o.plan();
  return options[options.length - 1].plan();
}
