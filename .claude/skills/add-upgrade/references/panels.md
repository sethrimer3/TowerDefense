# Panels

## Armory (`src/defend/catalog.ts`)

- Row: `{ id, group, name, maxLevel, describe(level), price?(level) }` in `UPGRADES`; add the id to `UpgradeId`.
- Price: `upgradePrice(level)` (Gold ×1.6 a level, iron, steel from level 3) unless `price` overrides it (one-offs).
- Effect: a stat curve beside the others (`archerRange(l)`, `wallHp(l)`…) read by the sim from `sim.levels.<id>`.
- Shown by `renderArmory` in `src/defend/ui.ts`, grouped by `group`.
- Saved in `save.defend.levels` (`decodeDefendSave` clamps to `maxLevel`).
- The replay test (`tests/defend-replay.test.ts`) builds levels from `UPGRADES`; a new id at its max level changes the `fortress` scenario's golden.

## Training (`src/progression.ts`)

- Row: `{ id, group, name, per, cost, max }` in `TRAINING`; add the id to `TrainingId`.
- Effect: `per` percent a rank on the target of the same name: a `Bonuses` field (times in `TIMES` divide), or `gold`/`xp`, which multiply rewards.
- Time: `trainingSeconds(ranks)` in `src/training-jobs.ts`.
- Saved in `save.training` (decoded against `max`).

## Skill trees (`src/skill-trees.ts`)

- Skill: `{ id, name, icon, max, base, effect: { target, per }, text }` in `SKILLS`; add the id to `SkillId`.
- Trees: Command and Stewardship (Defend), Mine (no nodes yet) and Library.
- Node: `{ id, x, y, requires }` in one tree's `nodes` (x and y are percentages of the tree's view).
- Cost: `skillCost = base × (rank + 1)` Knowledge.
- Effect: `per` on a `BonusTarget` (as Training), or `slots` (Training slots) or `ironPerWave` (iron per wave held), summed in `progression.ts`; or `fireproof` / `fireTraining`, which the Library reads as ranks (`main.ts` passes `save.skills` to the page; `accidentChance`, `fireDrill` in `library/sim.ts`).
- Saved in `save.skills` (decoded against `max`).
