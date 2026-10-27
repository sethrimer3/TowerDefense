/** Curated fragments and hash-only choices: stable, bounded player handles. */
const FIRST = [
  "ash",
  "moss",
  "iron",
  "ember",
  "silver",
  "night",
  "oak",
  "frost",
  "rune",
  "storm",
  "flint",
  "copper",
  "quiet",
  "swift",
  "wild",
  "lunar",
  "solar",
  "mist",
  "cedar",
  "tiny",
  "brave",
  "sleepy",
  "drift",
  "cloud",
  "river",
  "meadow",
  "granite",
  "sable",
  "crystal",
  "fern",
  "amber",
  "echo",
] as const;
const LAST = [
  "fox",
  "rook",
  "warden",
  "badger",
  "drake",
  "fern",
  "knight",
  "owl",
  "wolf",
  "raven",
  "forge",
  "vale",
  "panda",
  "otter",
  "sparrow",
  "beetle",
  "tower",
  "shield",
  "archer",
  "wizard",
  "keeper",
  "trail",
  "bloom",
  "comet",
  "falcon",
  "sprite",
  "brook",
  "stone",
  "leaf",
  "squire",
  "glen",
  "thistle",
] as const;
export const BLOCKED_PAIRS = new Set(["white:power", "dark:skin", "black:death"]);
const BLOCKED_FRAGMENTS = ["fuck", "shit", "cunt", "nazi", "rape", "sex"];
export function identityHash(seed: number, salt: number) {
  let n = (seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}
export function allowedBotName(name: string) {
  const letters = name.toLowerCase().replace(/[^a-z]/g, "");
  return name.length >= 2 && name.length <= 24 && /^[A-Za-z0-9_]+$/.test(name) && !BLOCKED_FRAGMENTS.some((word) => letters.includes(word));
}
export function botName(seed: number) {
  seed >>>= 0;
  const a = FIRST[identityHash(seed, 1) % FIRST.length];
  let b: string = LAST[identityHash(seed, 2) % LAST.length];
  for (let attempt = 0; attempt < LAST.length && (BLOCKED_PAIRS.has(a + ":" + b) || !allowedBotName(a + b)); attempt++)
    b = LAST[(identityHash(seed, 2) + attempt + 1) % LAST.length];
  const style = identityHash(seed, 3) % 100;
  let name =
    style < 45
      ? a + b
      : style < 70
        ? a + b[0].toUpperCase() + b.slice(1)
        : style < 85
          ? a + "_" + b
          : style < 98
            ? a + b + (identityHash(seed, 4) % 2 ? String(identityHash(seed, 5) % 1000) : String(1980 + (identityHash(seed, 5) % 47)))
            : "xX_" + a + b + "_Xx";
  if (name.length > 24 || !allowedBotName(name)) name = a + "_" + b;
  return allowedBotName(name) ? name : "warden" + seed.toString(36);
}
