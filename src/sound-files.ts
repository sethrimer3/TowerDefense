/** The recorded sounds in `public/assets/sounds/`, fetched and decoded on
 * first use. One-shots are short clips the cues in `sound.ts` play (a
 * variant at random where there are several); beds are the ambience's long
 * loops, each baked once into a buffer whose end is cross-faded into its
 * start, so a recording that wasn't cut as a clean loop still repeats
 * without a click or a jump. Nothing here plays anything: it only hands out
 * buffers once they are ready, and null until then (or for good, if a file
 * fails to load), so callers fall back to the sounds made in code. */

const BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./";

/** Each short clip and its variants, by path under `assets/sounds/`. */
export const ONE_SHOTS = {
  /** An oak button pressed. */
  buttonThud: ["ui/button-thud"],
  /** An arrow, stone or javelin striking an enemy. */
  arrowHit: ["battle/arrow-hit-flesh"],
  /** A melee troop's blow landing. */
  punch: ["battle/melee-punch"],
  /** A fire mage's fireball bursting. */
  fireballHit: ["battle/fireball-impact"],
  /** A shell, bomb or bursting enemy. */
  explosionSmall: ["battle/explosion-small"],
  /** A wide blast. */
  explosionLarge: ["battle/explosion-large"],
  /** The Meteor strike landing. */
  meteorHit: ["battle/meteor-impact"],
  /** One of the city's troops or people falling. */
  bodyFall: ["battle/body-fall-1", "battle/body-fall-2"],
  /** A house's timbers giving way. */
  houseFall: ["collapse/house-wood-smash-1", "collapse/house-wood-smash-2", "collapse/house-wood-smash-3", "collapse/house-wood-smash-4"],
  /** A wall stone, gate, tower or hall coming down. */
  stoneFall: ["collapse/stone-building-collapse"],
  /** The keep falling. */
  keepFall: ["collapse/keep-collapse"],
  /** A magic boat's water splashing down. */
  boatSplash: ["water/boat-water-splash"],
  /** A building sinking under a boat's water. */
  sinkSplosh: ["water/building-sinks-splosh"],
} as const satisfies Record<string, readonly string[]>;
export type OneShot = keyof typeof ONE_SHOTS;

/** The ambience's long loops. */
export const BEDS = {
  /** Wind through the trees of the green lands (and the Mine's hillside). */
  windForest: "ambience/wind-forest",
  /** Icy wind over the Frozen Vault. */
  windFrozen: "ambience/wind-frozen",
  /** Desert wind and blowing sand over the Amber Desert. */
  windDesert: "ambience/wind-desert",
  /** Deep in old workings: creaks, rumbles and distant drips. */
  mine: "ambience/mine-underground",
  /** A small fire crackling. */
  fireCrackle: "ambience/fire-crackling",
  /** A fire well alight. */
  fireBurning: "ambience/fire-burning",
} as const satisfies Record<string, string>;
export type Bed = keyof typeof BEDS;

/** Seconds of each bed's end blended into its start. */
export const LOOP_FADE = 2;

type Slot<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "failed" };
const shots = new Map<OneShot, Slot<AudioBuffer[]>>();
const beds = new Map<Bed, Slot<AudioBuffer>>();

async function decode(ctx: BaseAudioContext, path: string): Promise<AudioBuffer> {
  const res = await fetch(`${BASE}assets/sounds/${path}.mp3`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

/** Fills `slot`'s entry in `map` from `load`, once. */
function fetchInto<K, T>(map: Map<K, Slot<T>>, key: K, load: () => Promise<T>): T | null {
  const had = map.get(key);
  if (had) return had.state === "ready" ? had.value : null;
  map.set(key, { state: "loading" });
  load().then(
    (value) => map.set(key, { state: "ready", value }),
    () => map.set(key, { state: "failed" }),
  );
  return null;
}

/** One-shot `name`'s decoded variants, or null while they load (asking for
 * them starts the load). */
export function oneShot(ctx: BaseAudioContext, name: OneShot): AudioBuffer[] | null {
  return fetchInto(shots, name, () => Promise.all(ONE_SHOTS[name].map((p) => decode(ctx, p))));
}

/** Starts loading every one-shot, so the first of each isn't missed. */
export function preloadOneShots(ctx: BaseAudioContext) {
  for (const name of Object.keys(ONE_SHOTS) as OneShot[]) oneShot(ctx, name);
}

/** Bed `name` as a seamless loop, or null while it loads. */
export function bed(ctx: BaseAudioContext, name: Bed): AudioBuffer | null {
  return fetchInto(beds, name, async () => crossfadeLoop(ctx, await decode(ctx, BEDS[name]), LOOP_FADE));
}

/** `buf` made to loop: its last `fade` seconds blended into its first,
 * equal-power, and cut off there. Played on repeat, the end (which is the
 * original's audio just before that tail) runs straight into the start
 * (which carries on from it), so the seam falls inside a slow cross-fade
 * rather than at a cut. */
export function crossfadeLoop(ctx: BaseAudioContext, buf: AudioBuffer, fade: number): AudioBuffer {
  const f = Math.min(Math.floor(fade * buf.sampleRate), Math.floor(buf.length / 3));
  const len = buf.length - f, out = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch), dst = out.getChannelData(ch);
    dst.set(src.subarray(0, len));
    blendLoop(dst, src, len, f);
  }
  return out;
}

/** The blend itself, over plain arrays: `dst[i]`, for the first `f`
 * samples, takes the head fading in and `src[len + i]` (the tail) fading
 * out. */
export function blendLoop(dst: Float32Array, src: Float32Array, len: number, f: number) {
  for (let i = 0; i < f; i++) {
    const k = ((i + 0.5) / f) * (Math.PI / 2);
    dst[i] = src[i] * Math.sin(k) + src[len + i] * Math.cos(k);
  }
}
