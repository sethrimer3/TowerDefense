# Panels

## Armory (`src/defend/catalog.ts`)

- Row: `{ id, group, name, maxLevel, describe(level), price?(level) }` in `UPGRADES`; add the id to `UpgradeId`.
- Price: `upgradePrice(level)` in the mine's metal points (Copper 2 + 20 × owned², quadratic Silver from level 3 and Gold from level 5) unless `price` overrides it (one-offs).
- Effect: a stat curve beside the others (`archerRange(l)`, `wallHp(l)`…) read by the sim from `sim.levels.<id>`.
- Shown in the Smithy below the Mine (`src/ui/ledger.ts`): list the id in its topic's `upgrades` in `src/upgrade-subjects.ts` (`tests/upgrade-subjects.test.ts` fails until every upgrade is listed once).
- Work: `src/forge-jobs.ts`, 120 × next-level² seconds per smith, sharing named workers with Training; reserve mixed metals and apply the level only after completion.
- Saved in `save.defend.levels` (`decodeDefendSave` clamps to `maxLevel`).
- The replay test (`tests/defend-replay.test.ts`) builds levels from `UPGRADES`; a new id at its max level changes the `fortress` scenario's golden.

## Smithy (Training in code, `src/progression.ts`)

- Row: `{ id, group, name, per, max }` in `TRAINING`; add the id to `TrainingId`.
- Shown in the Smithy: list the id in its topic's `training` in `src/upgrade-subjects.ts`.
- Cost: `rankCost = 1 + 5 × owned²` units, its metal by rank (`rankPrice`: copper, silver, gold).
- Effect: `per` percent a rank on the target of the same name: a `Bonuses` field (times in `TIMES` divide); battle currency reward upgrades have been removed.
- Time: `trainingSeconds(ranks) = 60 × next-rank²` seconds of one smith in `src/training-jobs.ts`, shared by the smiths on it.
- Saved in `save.training` (decoded against `max`).

## Skill trees (`src/skill-trees.ts`)

- Skill: `{ id, name, icon, max, base, effect: { target, per }, text }` in `SKILLS`; add the id to `SkillId`.
- Trees: Command and Stewardship (Defend), Mine and Library.
- Node: `{ id, requires }` in one tree's `nodes` (requirements within the same subject), and the id in its topic's `skills` in `src/upgrade-subjects.ts`, which places it in the Study below the Library.
- Cost: `skillCost = base × (1 + growth × owned²)` Knowledge (`src/economy.ts` supplies growth).
- Work: `src/research-jobs.ts`; one project shared by all researchers, 300 × next-rank² seconds per researcher. Effects apply on completion, cancellation refunds actual payment.
- Effect: `per` on a `BonusTarget` (as Training), or `smiths` (room for more smiths, read by the mine as `extraSmiths`), summed in `progression.ts`; or `fireproof` / `fireTraining`, which the Library reads as ranks (`main.ts` passes `save.skills` to the page; `accidentChance`, `fireDrill` in `library/sim.ts`), or `coffee` / `waterproof`, which the Mine reads as ranks the same way (`nightShift` and the shaft house's `seal` in `mine/sim.ts`).
- Saved in `save.skills` (decoded against `max`).

## Knowledge paths (`src/knowledge-paths.ts`)

- Path: `{ id, topic, name, motto, hue, ranks, evolves? }` in `PATHS`; `topic` is the `upgrade-subjects.ts` topic's id (one tower or troop building), which puts the path on that topic's tree in the Study. Add the id to `PathId` (and a new topic to `PathTopic`). A strike spell's topic is a `SpellId` (`SPELLS`): it has no cards, so the battle reads the path `save.spellPaths` equips (`spellPath`) through its own `Bonuses` field.
- Ranks: `{ name, icon, cost, text }`, learned in order with Knowledge; an icon is an 11 × 11 pixel drawing in `src/ui/path-icons.ts` painted in the path's `hue`.
- Work: same lab project as skills; rank timers are quadratic and evolution crowns take 24 researcher-hours.
- Evolution: `evolves: { from, item, name, cost, text }` puts a crown after the last rank; `evolve` turns every owned `from` into `item` (placed ones lifted to the palette), `unlearnPath` turns them back, and the Tiles shop stops selling `item` on its own (`shopOffer` in `src/tiles.ts`).
- Exclusive: the first rank chooses the path and seals the topic's others; unlearning returns all the Knowledge spent (`spent` in `save.paths`).
- Effect: the battle reads `Bonuses.paths` with `pathRank(paths, topic, id)`; keep the numbers in an exported table beside the paths, keep any new unit or enemy state absent when the path isn't chosen, and use exact math only, so replays don't move.
