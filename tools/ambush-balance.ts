/** Deterministic smoke balance policy; never reads or writes a player save.
 * Initial two Archers and a Melee Guild, then coverage-weighted native base buildings and local upgrades.
 * This measures a repeatable policy, not the best possible human strategy. */
import { performance } from "node:perf_hooks";
import { AmbushSim, AMBUSH_PALETTE } from "../src/campaign/ambush-sim.ts";
import { AMBUSH_WAVES } from "../src/campaign/ambush-waves.ts";
import { AMBUSH_LEVELS, pointAlong } from "../src/campaign/levels.ts";
import { defaults } from "../src/save.ts";
import { rootOf } from "../src/specializations.ts";
import { AMBUSH_PATHS, buyAmbush } from "../src/ambush-upgrades.ts";
import { ambushPrice, STARTING_GOLD } from "../src/campaign/economy.ts";
import { CELLS_W, CELLS_H } from "../src/defend/grid.ts";
import { deployRangeOf } from "../src/defend/deployment.ts";
import { rectDist } from "../src/defend/pathing.ts";
import { dist } from "../src/exact.ts";
import type { StructureKind } from "../src/defend/catalog.ts";
const simple = process.argv.includes("--simple");
const arg = (name: string) => process.argv.find((a) => a.startsWith("--" + name + "="))?.split("=")[1];
const indices = arg("levels")?.split(",").map(Number) ?? AMBUSH_LEVELS.map((_, i) => i),
  seconds = Number(arg("seconds") ?? 2400),
  maxed = process.argv.includes("--max-stars"),
  starBudget = Math.max(0, Math.min(90, Number(arg("earned-stars") ?? (maxed ? 90 : 0))));
// Tuning overrides for the placeholder curve: --hp, --level-growth, --wave-growth, --gold-per-hp, --release,
// --release-per, --keep-hp, --outpost-hp, --dps, --defense-growth, --start-gold.
const knobs = AMBUSH_WAVES as unknown as Record<string, number>;
for (const [flag, knob] of [
  ["hp", "hp"],
  ["level-growth", "levelGrowth"],
  ["wave-growth", "waveGrowth"],
  ["gold-per-hp", "goldPerHp"],
  ["release", "release"],
  ["release-per", "releasePer"],
  ["keep-hp", "keepHp"],
  ["outpost-hp", "outpostHp"],
  ["dps", "dps"],
  ["defense-growth", "defenseGrowth"],
] as const)
  if (arg(flag)) knobs[knob] = Number(arg(flag));
if (arg("start-gold")) STARTING_GOLD.base = Number(arg("start-gold"));
for (const index of indices) {
  const game = defaults();
  let left = starBudget;
  for (const l of AMBUSH_LEVELS) {
    const n = Math.min(3, left);
    if (n) game.campaigns.ambush.stars[l.id] = n as 1 | 2 | 3;
    left -= n;
  }
  const priority = [...AMBUSH_PATHS.filter((p) => p.id !== "bounty"), ...AMBUSH_PATHS.filter((p) => p.id === "bounty")];
  for (const p of priority) for (const rank of p.ranks) if (!buyAmbush(game.campaigns.ambush, p.id)) break;
  const limit = Number(arg("buildings") ?? 20);
  const s = new AmbushSim(index, game);
  s.autoSend = false;
  s.speed = 1;
  const started = performance.now();
  const samples = s.field.lanes.flatMap((lane) => Array.from({ length: 80 }, (_, i) => ({ ...pointAlong(lane, i / 79), weight: 1 })));
  for (const lane of s.field.lanes)
    for (let i = 0; i < 40; i++) {
      const t = i / 39,
        a = lane[0],
        b = s.field.track.keep;
      samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, weight: 1.3 });
    }
  const spots = new Map<StructureKind, { qx: number; qy: number; cover: number[] }[]>();
  for (const kind of AMBUSH_PALETTE) {
    const range = deployRangeOf(kind, s.engine.bonuses) || ambushPrice(kind).range,
      list: { qx: number; qy: number; cover: number[] }[] = [];
    for (let qy = 1; qy < CELLS_H / 2; qy++)
      for (let qx = 1; qx < CELLS_W / 2; qx++) {
        const c = s.grid.check(kind, qx, qy, []);
        if (!c.fits || s.field.outposts.some((p) => rectDist(p.rect, c.rect.x + c.rect.w / 2, c.rect.y + c.rect.h / 2) < 4)) continue;
        const cover = samples.flatMap((p, i) => (dist(c.rect.x + c.rect.w / 2 - p.x, c.rect.y + c.rect.h / 2 - p.y) <= range ? [i] : []));
        if (cover.length) list.push({ qx, qy, cover });
      }
    spots.set(kind, list);
  }
  function decide() {
    const coverage = samples.map((p) =>
      s.buildings.reduce((n, b) => {
        const r = s.map.buildings[b.id].rect;
        return n + (dist(r.x + r.w / 2 - p.x, r.y + r.h / 2 - p.y) <= (deployRangeOf(b.kind, s.engine.bonuses) || ambushPrice(b.kind).range) ? 1 : 0);
      }, 0),
    );
    let best: { kind: StructureKind; qx: number; qy: number; score: number } | undefined;
    const paid = s.buildings.filter((b) => b.paid > 0).length;
    const upgrades = s.buildings
      .flatMap((b) =>
        s
          .upgrades(b.id)
          .filter((o) => o.ready && o.cost <= s.gold && o.step.type !== "merge")
          .sort((a, c) => {
            const preference = simple ? "brazierTower" : b.id % 3 === 0 ? "hawkTower" : b.id % 3 === 1 ? "brazierTower" : "wispTower";
            return Number(c.step.type === "become" && c.step.to === preference) - Number(a.step.type === "become" && a.step.to === preference);
          })
          .slice(0, 1)
          .map((o) => ({ b, o })),
      )
      .sort((a, b) => a.o.cost - b.o.cost);
    // Crowds call for more buildings before better ones: upgrade first only once half the building cap stands.
    if (paid >= 3 && s.buildings.length >= limit / 2 && upgrades.length) return s.upgrade(upgrades[0].b.id, upgrades[0].o.step);
    const initial: StructureKind[] = ["archerTower", "meleeGuild", "archerTower"];
    if (s.buildings.length < limit)
      for (const kind of paid < 3 ? [initial[paid]] : AMBUSH_PALETTE) {
        if (
          s.price(kind) > s.gold ||
          (kind === "meleeGuild" && s.buildings.filter((b) => rootOf(b.kind as Exclude<StructureKind, "keep">) === "meleeGuild").length >= 1) ||
          (kind === "rangedGuild" && s.buildings.filter((b) => rootOf(b.kind as Exclude<StructureKind, "keep">) === "rangedGuild").length >= 3)
        )
          continue;
        const price = ambushPrice(kind);
        for (const p of spots.get(kind)!) {
          if (!s.grid.check(kind, p.qx, p.qy, s.buildings).fits) continue;
          let score = (p.cover.reduce((n, i) => n + samples[i].weight / (1 + coverage[i] * coverage[i]), 0) * price.dps) / s.price(kind);
          if (paid < 3) {
            const aim = paid === 2 && !simple ? s.field.track.keep : s.field.lanes[paid % s.field.lanes.length][0];
            score /= 1 + dist(p.qx * 2 + 1 - aim.x, p.qy * 2 + 1 - aim.y) / 3;
          }
          if (!best || score > best.score) best = { kind, qx: p.qx, qy: p.qy, score };
        }
      }
    if (best && s.placeAt(best.kind, best.qx, best.qy)) return true;
    return upgrades.length ? s.upgrade(upgrades[0].b.id, upgrades[0].o.step) : false;
  }
  for (let i = 0; i < 3; i++) decide();
  let peak = 0,
    decisions = 0;
  for (let tick = 0; tick < seconds * 30 && ["build", "battle"].includes(s.phase); tick++) {
    if (tick % 30 === 0) {
      for (let n = 0; n < 4 && decide(); n++) decisions++;
      if (s.canSend && !s.enemiesLeft) s.send();
    }
    s.step(1 / 30);
    peak = Math.max(peak, s.engine.enemies.length);
  }
  console.log(
    JSON.stringify({
      level: s.level.id,
      stars: s.phase === "won" ? s.stars : 0,
      state: s.phase,
      wave: s.wave,
      seconds: Math.round(s.elapsed),
      keep: Math.round(s.engine.keepHp()),
      outposts: s.outposts.posts.map((p) => Math.round(p.health * 100)),
      buildings: s.buildings.length,
      kills: s.kills,
      earned: Math.round(s.goldEarned),
      gold: Math.round(s.gold),
      peak,
      decisions,
      cpuMs: Math.round(performance.now() - started),
      starBuild: starBudget,
      policy: simple ? "entry-fire" : "mixed-guard",
      ...(process.argv.includes("--debug")
        ? {
            homes: s.buildings.map((b) => {
              const t = s.tallies.get(b.id);
              return [b.kind, b.qx * 2, b.qy * 2, Math.round(t.damage), t.kills].join(" ");
            }),
            lanes: s.field.lanes,
          }
        : {}),
    }),
  );
}
