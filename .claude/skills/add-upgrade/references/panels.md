# Panels

## Armory (`src/defend/catalog.ts`)

- Row: `{ id, group, name, maxLevel, describe(level), price?(level) }` in `UPGRADES`; add the id to `UpgradeId`.
- Price: `upgradePrice(level)` in the mine's metal points (copper 2 + 2 a level, silver from level 3, gold from level 5) unless `price` overrides it (one-offs).
- Effect: a stat curve beside the others (`archerRange(l)`, `wallHp(l)`…) read by the sim from `sim.levels.<id>`.
- Shown in the Upgrades page's Forge (`src/ui/upgrades-page.ts`): list the id in its topic's `upgrades` in `src/upgrade-subjects.ts` (`tests/upgrade-subjects.test.ts` fails until every upgrade is listed once).
- Saved in `save.defend.levels` (`decodeDefendSave` clamps to `maxLevel`).
- The replay test (`tests/defend-replay.test.ts`) builds levels from `UPGRADES`; a new id at its max level changes the `fortress` scenario's golden.

## Smithy (Training in code, `src/progression.ts`)

- Row: `{ id, group, name, per, max }` in `TRAINING`; add the id to `TrainingId`.
- Shown in the Forge: list the id in its topic's `training` in `src/upgrade-subjects.ts`.
- Cost: one Smithy point a rank, its metal by rank (`rankPrice`: copper, silver, gold).
- Effect: `per` percent a rank on the target of the same name: a `Bonuses` field (times in `TIMES` divide), or `gold`, which multiplies rewards.
- Time: `trainingSeconds(ranks)` of one smith in `src/training-jobs.ts`, shared by the smiths on it.
- Saved in `save.training` (decoded against `max`).

## Skill trees (`src/skill-trees.ts`)

- Skill: `{ id, name, icon, max, base, effect: { target, per }, text }` in `SKILLS`; add the id to `SkillId`.
- Trees: Command and Stewardship (Defend), Mine and Library.
- Node: `{ id, requires }` in one tree's `nodes` (requirements within the same Upgrades subject), and the id in its topic's `skills` in `src/upgrade-subjects.ts`, which places it in the page's Study.
- Cost: `skillCost = base × (rank + 1)` Knowledge.
- Effect: `per` on a `BonusTarget` (as Training), or `smiths` (room for more smiths, read by the mine as `extraSmiths`) or `copperPerWave` (copper per wave held), summed in `progression.ts`; or `fireproof` / `fireTraining`, which the Library reads as ranks (`main.ts` passes `save.skills` to the page; `accidentChance`, `fireDrill` in `library/sim.ts`), or `coffee` / `waterproof`, which the Mine reads as ranks the same way (`nightShift` and the shaft house's `seal` in `mine/sim.ts`).
- Saved in `save.skills` (decoded against `max`).
