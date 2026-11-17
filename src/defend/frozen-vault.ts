/** The Highlands (zone 5, area id `frozen`): the open ground outside the
 * walls lies under the desert's dunes in snow (`drift-look.ts`), and out of
 * the drifts stand what is left of the first kings' vault: spires of blue
 * ice, broken fluted pillars and their fallen drums, slate rune stones whose
 * carvings still glow, relics sealed in blocks of ice, sheets of frozen
 * meltwater, and the little snowed-over huts of the folk who live up here,
 * some beside the trails, which fall apart when a blast hits them or
 * anyone walks through them (`HutRuins`), and stand again by the next
 * wave. Planned from the map alone (each cell's own hashes), clear of
 * the trails trodden through the snow; presentation only: nothing here
 * blocks, slows or draws from the battle's random stream.
 * `frozen-vault-art.ts` draws it. */
import { CELLS_H, CELLS_W, cellIndex, hash, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import type { AreaId } from "./areas.ts";
import { clearOf } from "./forest.ts";
import { trailPlan, type TrailPlan } from "./trails.ts";

/** The areas dressed as the Highlands. */
export const FROZEN_VAULT_AREAS: readonly AreaId[] = ["frozen"];
export const hasFrozenVault = (area: AreaId) => FROZEN_VAULT_AREAS.includes(area);

/** How the vault's ground is planned: at most so many of each piece, their
 * sizes in cells and how many cells apart they keep. */
export const FROZEN_VAULT = {
  spires: 12, spire: [0.6, 1.3], pillars: 8, runes: 5, relics: 3, sheets: 3, sheet: [1.3, 2.3],
  apart: 0.9,
  /** Huts: at most so many, so many of them beside the trails, their size. */
  huts: 6, trailHuts: 4, hut: [0.85, 1.1],
  /** Glints that may flash on the ice at once. */
  glints: 10,
} as const;

/** A cluster of ice spires, `r` cells across its foot, `shards` of them. */
export type IceSpire = { x: number; y: number; r: number; seed: number; shards: number };
/** A broken fluted pillar of the vault, standing (`fallen` false) or a drum
 * of one lying in the snow. */
export type VaultPillar = { x: number; y: number; r: number; seed: number; fallen: boolean };
/** A slate rune stone, its carvings glowing. */
export type RuneStone = { x: number; y: number; r: number; seed: number };
/** A relic sealed in a block of ice: a crown, an urn or a sword. */
export type RelicKind = "crown" | "urn" | "sword";
export type Relic = { x: number; y: number; r: number; seed: number; kind: RelicKind };
/** A sheet of frozen meltwater, `r` cells across its middle. */
export type IceSheet = { x: number; y: number; r: number; seed: number };

/** A little hut in the snow, `r` cells across its middle: a cabin under a
 * gabled roof (its ridge running across, or up and down when `turned`) or a
 * round hut under a conical one (`round`). */
export type Hut = { x: number; y: number; r: number; seed: number; round: boolean; turned: boolean };

/** The plan: `open` is 1 on each open-ground cell. */
export type FrozenVaultPlan = {
  open: Uint8Array; spires: IceSpire[]; pillars: VaultPillar[]; runes: RuneStone[]; relics: Relic[]; sheets: IceSheet[]; huts: Hut[];
  /** The trails trodden through the snow (Defend's own cities only). */
  trails: TrailPlan | null;
};

const plans = new WeakMap<CityMap, FrozenVaultPlan>();

/** `map`'s vault ground, planned on first use. */
export function frozenVaultPlan(map: CityMap): FrozenVaultPlan {
  let plan = plans.get(map);
  if (!plan) plans.set(map, (plan = plan_(map)));
  return plan;
}

const RELICS: readonly RelicKind[] = ["crown", "urn", "sword"];

function plan_(map: CityMap): FrozenVaultPlan {
  const open = Uint8Array.from(map.type, (t) => (t === CellType.OUT ? 1 : 0));
  const spots = (salt: number) => {
    const out: [number, number, number][] = [];
    for (let cy = 0; cy < CELLS_H; cy++)
      for (let cx = 0; cx < CELLS_W; cx++) if (open[cellIndex(cx, cy)]) out.push([cx, cy, hash01(cx, cy, salt)]);
    return out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  };
  const taken: { x: number; y: number; r: number }[] = [];
  const trails = trailPlan(map, "sand");
  const onTrail = (x: number, y: number, r: number) => {
    if (!trails) return false;
    for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++)
      for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++)
        if (cx >= 0 && cy >= 0 && cx < CELLS_W && cy < CELLS_H && (cx + 0.5 - x) ** 2 + (cy + 0.5 - y) ** 2 < r * r && trails.wear[cellIndex(cx, cy)] > 0.1) return true;
    return trails.rocks.some((k) => (k.x - x) ** 2 + (k.y - y) ** 2 < (k.r + r) ** 2);
  };
  // Nothing is cut off by the board's edge, and pieces stand a little
  // above their foot, so they keep further from the top.
  const free = (x: number, y: number, r: number, up = 0) => x - r > 0.2 && y - r - up > 0.2 && x + r < CELLS_W - 0.2 && y + r < CELLS_H - 0.2 && !onTrail(x, y, r + 0.5) && taken.every((t) => (t.x - x) ** 2 + (t.y - y) ** 2 >= (t.r + r + FROZEN_VAULT.apart) ** 2);
  const range = (lo: number, hi: number, u: number) => lo + u * (hi - lo);
  const place = <T extends { x: number; y: number; r: number }>(list: T[], max: number, salt: number, size: (cx: number, cy: number) => number, make: (x: number, y: number, r: number, cx: number, cy: number) => T, pad = 0.5, up = 0) => {
    for (const [cx, cy] of spots(salt)) {
      if (list.length >= max) break;
      const r = size(cx, cy), x = cx + 0.5, y = cy + 0.5;
      if (!clearOf(map, x, y, r + 0.2) || !free(x, y, r + pad, up)) continue;
      list.push(make(x, y, r, cx, cy));
      taken.push({ x, y, r });
    }
  };
  const sheets: IceSheet[] = [];
  place(sheets, FROZEN_VAULT.sheets, 1101, (cx, cy) => range(...FROZEN_VAULT.sheet, hash01(cx, cy, 1102)), (x, y, r, cx, cy) => ({ x, y, r, seed: hash(cx, cy, 1103) }), 1.5);
  const runes: RuneStone[] = [];
  place(runes, FROZEN_VAULT.runes, 1111, (cx, cy) => 0.7 + hash01(cx, cy, 1112) * 0.25, (x, y, r, cx, cy) => ({ x, y, r, seed: hash(cx, cy, 1113) }), 1.2, 2);
  const pillars: VaultPillar[] = [];
  place(pillars, FROZEN_VAULT.pillars, 1121, (cx, cy) => 0.8 + hash01(cx, cy, 1122) * 0.3, (x, y, r, cx, cy) => ({ x, y, r, seed: hash(cx, cy, 1123), fallen: hash01(cx, cy, 1124) < 0.4 }), 0.9, 2.5);
  const relics: Relic[] = [];
  place(relics, FROZEN_VAULT.relics, 1131, () => 0.7, (x, y, r, cx, cy) => ({ x, y, r, seed: hash(cx, cy, 1132), kind: RELICS[hash(cx, cy, 1133) % RELICS.length] }), 1.2, 1.5);
  const spires: IceSpire[] = [];
  place(spires, FROZEN_VAULT.spires, 1141, (cx, cy) => range(...FROZEN_VAULT.spire, hash01(cx, cy, 1142) ** 1.4), (x, y, r, cx, cy) => ({ x, y, r, seed: hash(cx, cy, 1143), shards: 2 + (hash(cx, cy, 1144) % 4) }), 0.6, 2);
  // The huts last, so the vault's pieces keep their places: first beside
  // the trails, where the Blight's columns will tramp through them, then
  // anywhere in the snow. Only the trail's boulders keep them off it.
  const huts: Hut[] = [];
  const nearTrail = (cx: number, cy: number) => {
    if (!trails) return false;
    for (let y = cy - 1; y <= cy + 1; y++)
      for (let x = cx - 1; x <= cx + 1; x++) if (x >= 0 && y >= 0 && x < CELLS_W && y < CELLS_H && trails.wear[cellIndex(x, y)] > 0.1) return true;
    return false;
  };
  const hutFree = (x: number, y: number, r: number) => x - r > 0.3 && y - r > 0.3 && x + r < CELLS_W - 0.3 && y + r < CELLS_H - 0.3 && clearOf(map, x, y, r + 0.1)
    && !(trails?.rocks.some((k) => (k.x - x) ** 2 + (k.y - y) ** 2 < (k.r + r + 0.3) ** 2))
    && taken.every((t) => (t.x - x) ** 2 + (t.y - y) ** 2 >= (t.r + r + FROZEN_VAULT.apart) ** 2);
  for (const [beside, max] of [[true, FROZEN_VAULT.trailHuts], [false, FROZEN_VAULT.huts]] as const)
    for (const [cx, cy] of spots(1161)) {
      if (huts.length >= max) break;
      if (beside && !nearTrail(cx, cy)) continue;
      // Off the cell's middle a little, so they don't stand in rows.
      const r = range(...FROZEN_VAULT.hut, hash01(cx, cy, 1162));
      const x = cx + 0.5 + (hash01(cx, cy, 1163) - 0.5) * 0.4, y = cy + 0.5 + (hash01(cx, cy, 1164) - 0.5) * 0.4;
      if (!hutFree(x, y, r)) continue;
      huts.push({ x, y, r, seed: hash(cx, cy, 1165), round: hash01(cx, cy, 1166) < 0.4, turned: hash01(cx, cy, 1167) < 0.5 });
      taken.push({ x, y, r });
    }
  return { open, spires, pillars, runes, relics, sheets, huts, trails };
}

/** Where glint `k` of the vault flashes at `t` seconds: which piece it
 * catches (an index into the plan's ice, spires first then sheets), where
 * on it (cells) and how bright (0 dark, 1 at its peak): a brief sparkle of
 * the sun, now here, now there. */
export function glintAt(plan: Pick<FrozenVaultPlan, "spires" | "sheets">, k: number, t: number) {
  const n = plan.spires.length + plan.sheets.length;
  if (!n) return null;
  const life = 2.6 + hash01(k, 1151) * 2.4, phase = t / life + hash01(k, 1152), round = Math.floor(phase), age = phase - round;
  const which = hash(k, round, 1153) % n, spire = which < plan.spires.length;
  const p = spire ? plan.spires[which] : plan.sheets[which - plan.spires.length];
  const a = hash01(k, round, 1154) * Math.PI * 2, d = Math.sqrt(hash01(k, round, 1155)) * p.r * (spire ? 0.5 : 0.75);
  const lift = spire ? p.r * (0.6 + hash01(k, round, 1156) * 1.2) : 0;
  return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.7 - lift, show: age < 0.12 ? Math.sin((age / 0.12) * Math.PI) : 0 };
}

/** What can knock a hut down: anyone on foot (`size` cells across), and
 * the battle's blasts, dust and sparks. */
export type HutWalker = { x: number; y: number; size: number };
export type HutBlast = { kind: string; x: number; y: number; r: number };

/** Which of a plan's huts have fallen, and when (seconds of battle): a hut
 * falls when a blast reaches it or someone walks through it, and every hut
 * stands again when the next wave comes (or a new battle starts).
 * Presentation only: it reads the battle and changes nothing in it. */
export class HutRuins {
  private battle: object | null = null;
  private wave = -1;
  private huts: readonly Hut[] = [];
  private seen = new WeakSet<object>();
  /** When each hut fell; NaN while it stands. */
  fell = new Float64Array(0);

  /** Notes this frame of `battle` (null while none is fought: every hut
   * stands). */
  update(huts: readonly Hut[], battle: object | null, wave: number, time: number, walkers: readonly HutWalker[], blasts: readonly HutBlast[]) {
    if (huts !== this.huts || battle !== this.battle || wave !== this.wave) {
      if (battle !== this.battle) this.seen = new WeakSet();
      this.huts = huts;
      this.battle = battle;
      this.wave = wave;
      this.fell = new Float64Array(huts.length).fill(NaN);
    }
    if (!battle) return;
    for (const b of blasts) {
      if (this.seen.has(b)) continue;
      this.seen.add(b);
      if (b.kind !== "boom" && b.kind !== "dust" && b.kind !== "spark") continue;
      const reach = b.kind === "boom" ? b.r : b.r * 0.5;
      huts.forEach((h, k) => {
        if (Number.isNaN(this.fell[k]) && (h.x - b.x) ** 2 + (h.y - b.y) ** 2 < (reach + h.r) ** 2) this.fell[k] = time;
      });
    }
    for (let k = 0; k < huts.length; k++) {
      if (!Number.isNaN(this.fell[k])) continue;
      const h = huts[k], reach = h.r * 0.8;
      for (const w of walkers) if ((h.x - w.x) ** 2 + (h.y - w.y) ** 2 < (reach + w.size * 0.5) ** 2) { this.fell[k] = time; break; }
    }
  }

  /** Whether hut `k` has fallen. */
  down(k: number) { return k < this.fell.length && !Number.isNaN(this.fell[k]); }
}
