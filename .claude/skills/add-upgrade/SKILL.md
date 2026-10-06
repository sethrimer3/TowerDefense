---
name: add-upgrade
description: Define and add a new upgrade the player can unlock in Tower Defense — a Defend Armory upgrade, a Smithy row (Training in code), or a skill-tree node (Command, Stewardship). Writes a spec (panel, name, cost, levels, placement, effect) for approval, then builds it with tests and docs. Use this whenever the user wants a new upgrade, skill, perk, training stat, unlock, tree node or Armory item, even if they only describe the effect ("I want something that makes towers shoot faster").
---

# Add an upgrade

An upgrade here is anything the player buys between defenses that lasts: an Armory upgrade, a Smithy row (Training in code), or a skill-tree node. Work in two steps:

1. **Spec.** Turn the request into a filled-in spec, proposing sensible values for everything the user left out, and show it to them.
2. **Build.** Once they approve (or amend) it, implement, test, document and commit.

Don't start editing code before the user has approved the spec.

## 1. Read the current state first

- Armory: `UPGRADES`, `upgradePrice`, `UpgradeDef` and the stat curves in `src/defend/catalog.ts`.
- Smithy (Training in code): `TRAINING`, `TRAINING_GROUPS` in `src/progression.ts`; durations in `src/training-jobs.ts`.
- Skill trees: `SKILLS`, `TREES`, `skillCost` in `src/skill-trees.ts`.
- What the battle can be changed by: `Bonuses` in `src/defend/catalog.ts`, read in `sim.ts`, `troops.ts`, `towers.ts`, `civilians.ts`.
- Income: `KILL_GOLD`, `waveGold`, `waveReward` in `src/progression.ts`.

`references/panels.md` has, for each panel, the fields a row takes, how its price works, how its effect reaches the game, and the files and tests a new row touches.

## 2. Pick the panel

| The upgrade… | Panel |
|---|---|
| changes one kind of building or unit in a stepwise, Gold-and-bars way (more troops, a longer range, a one-off behaviour) | Armory |
| is a small percent on a broad number that players pour time into | Training |
| is a bigger ranked percent, or an unlock, earned by pushing the best wave | Skill tree (Command for the garrison and towers, Stewardship for the city and economy) |

## 3. Write the spec

```markdown
### <Name> (`<camelCaseId>`)
- **Panel:** Armory › <group> | Training › <group> | Skill tree › <tree>
- **What it does:** <one sentence, player-facing>
- **Effect in code:** <stat curve / Bonuses field / new behaviour read from levels or skills>
- **Levels:** <max>
- **Cost:** <formula and currency>, per level: <…>
- **Placement:** <Armory group order / Training row order / tree node requires; and its Upgrades topic in `upgrade-subjects.ts`>
- **Affordable around:** <wave>
- **Open questions:** <only what you couldn't infer>
```

Mark values you chose with *(proposed)*, list what the build will touch, and ask for approval.

## 4. Build (after approval)

- A new battle effect goes through `Bonuses` (default 1 in `NO_BONUSES`, so the replay golden is unchanged) or an Armory level, never by reading the save inside `src/defend/`.
- Saves need no migration: `defaults()` and the decoders build from the tables.
- Add or extend a test (`tests/progression.test.ts` for Training and skills, `tests/defend*.test.ts` for the battle); a gameplay change at level 0 changes `defend-replay.golden.json`, so avoid one or re-record it deliberately.
- Update `docs/DEFEND.md`, `CONTEXT.md` for new terms, `AGENTS.md` if a mechanism changed, and the README's gameplay notes.
- Run `npm test` and `npm run build` before committing.
