/** How the Mine's crew moves while it works and idles, beat by beat, on the
 * wall clock: presentation only, never the sim. Each miner has a temperament
 * from its name (`temperament`: the two habits it falls into most), and
 * while it waits or rests it passes the time in spells of one habit or
 * another (`habitAt`): looking about, stretching, sitting down, whistling,
 * yawning, tapping a foot, crouching to sift the ground. A forge hand
 * shovels ore in a cycle (`shovelAt`: scoop from the pile, carry, throw into
 * the furnace), and a smith works a bar (`hammerAt`: raise, strike, the bar
 * cooling from orange heat stroke by stroke until it is quenched). */
import type { Pose } from "./figures.ts";

export type Habit = "stand" | "look" | "stretch" | "sit" | "whistle" | "yawn" | "tap" | "sift";
export const HABITS: readonly Habit[] = ["look", "stretch", "sit", "whistle", "yawn", "tap", "sift"];

/** A fixed number for a string and a salt. */
function hash(s: string, salt: number) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return (h ^ (h >>> 13)) >>> 0;
}

/** The two habits the miner named `name` falls into most. */
export function temperament(name: string): [Habit, Habit] {
  const a = HABITS[hash(name, 1) % HABITS.length];
  let b = HABITS[hash(name, 2) % HABITS.length];
  if (b === a) b = HABITS[(HABITS.indexOf(a) + 3) % HABITS.length];
  return [a, b];
}

/** The habit a waiting miner is in at `time` (ms), how far through its
 * spell (0 to 1), and the spell's number. Spells last three to five seconds,
 * each its own length; half go to its temperament's habits, a fifth to
 * just standing, the rest to any habit. */
export function habitAt(name: string, time: number): { habit: Habit; t: number; spell: number } {
  const len = 3000 + (hash(name, 3) % 2000), shift = hash(name, 4) % len;
  const spell = Math.floor((time + shift) / len), t = ((time + shift) % len) / len;
  const roll = hash(name, 100 + spell) % 100, [a, b] = temperament(name);
  const habit = roll < 30 ? a : roll < 50 ? b : roll < 70 ? "stand" : HABITS[hash(name, 200 + spell) % HABITS.length];
  return { habit, t, spell };
}

/** A waiting miner's pose and facing (from `facing`) partway through a
 * habit: looking about turns it to and fro; a stretch and a yawn raise an
 * arm; a foot tapped lifts a boot, beat by beat. */
export function habitPose(habit: Habit, t: number, facing: number, step: number): { pose: Pose; facing: number } {
  switch (habit) {
    case "look":
      return { pose: "stand", facing: Math.floor(t * 4) % 2 ? -facing : facing };
    case "stretch":
      return { pose: t > 0.2 && t < 0.7 ? "reach" : "stand", facing };
    case "yawn":
      return { pose: t > 0.3 && t < 0.55 ? "reach" : "stand", facing };
    case "sit":
      return { pose: t > 0.08 && t < 0.92 ? "sit" : "stand", facing };
    case "sift":
      return { pose: t > 0.1 && t < 0.9 ? "crouch" : "stand", facing };
    case "tap":
      return { pose: step % 2 ? "walk" : "stand", facing };
    default:
      return { pose: "stand", facing };
  }
}

/** Where a forge hand is in its shovel's cycle (1.6 s, each hand its own
 * offset): scooping from the pile behind it, carrying the load round, or
 * throwing it into the furnace; `n` counts the throws. */
export function shovelAt(id: number, time: number): { stage: "scoop" | "carry" | "throw"; n: number } {
  const len = 1600, at = time + id * 577, t = (at % len) / len;
  return { stage: t < 0.45 ? "scoop" : t < 0.75 ? "carry" : "throw", n: Math.floor(at / len) };
}

/** Where a smith is in working a bar: hammer raised or struck (a stroke
 * each 0.7 s), the bar cooling from 1 (fresh from the fire) toward 0 over
 * nine strokes, then a pause to quench it in a hiss of steam; `n` counts the
 * strokes, `bar` the bars. */
export function hammerAt(id: number, time: number): { stage: "raise" | "strike" | "quench"; heat: number; n: number; bar: number } {
  const stroke = 700, strokes = 9, len = stroke * (strokes + 2), at = time + id * 1231;
  const into = at % len, n = Math.floor(into / stroke), bar = Math.floor(at / len);
  if (n >= strokes) return { stage: "quench", heat: 0, n: bar * strokes + strokes, bar };
  const t = (into % stroke) / stroke;
  return { stage: t < 0.6 ? "raise" : "strike", heat: 1 - n / strokes, n: bar * strokes + n, bar };
}
