# Siege defensive damage estimates

Siege sizes its castles by a damage-per-second estimate: each building's **average DPS** (`src/defend/average-dps.ts`, `averageDps`), summed over the castle by `castleDps` (`src/campaign/castle-dps.ts`). The estimate is a rating prior only. It never sets battle damage, HP, fire rate or targeting.

It replaced a measured table (`siege-dps-table.ts`), which ran a headless battle for every building, path and rank at five upgrade levels against a crowd of dummies that could not die. That took over an hour to regenerate after any change to a building, and its immortal dummies let the Shadow's compounding edge reach about 10⁹ DPS. The averages are simple arithmetic on the same constants the battle reads, so a tweak to a tower changes its estimate at once, with nothing to regenerate.

## The formula

For each building:

> garrison (or one tower) × damage per hit × hits per attack ÷ seconds between attacks, plus any damage over time

All three factors come from the building's own catalog numbers:

- **Damage and reload.** Forge levels (for example `archerDamage(level)`, `cannonCooldown(level)`), the Training and skill multipliers in `Bonuses` (`troopDamage`, `towerDamage`, `towerReload`, and `soldierScale` for troops), and the building's Study path rank.
- **Garrison.** `soldierCap` for troop buildings. The Hero, the Shadow and the Dark wizard train one. The Revolutionary uses its Squad rank.
- **Hits per attack.** Assumes a crowd of `CROWD.density` (0.35) enemies a square cell:
  - A blast of radius r hits `inArea(r)` = 1 + 0.35·πr² enemies.
  - A line hits `alongLine`.
  - A chain reaches `chained(links)`.
  - All three are capped at `CROWD.most` (8).
- **Crits and first strikes.** Counted as their average: a hit that is k times as hard one time in n adds (k − 1)/n. Charges and fresh-target bonuses assume `STRIKES_EACH` (3) strikes on each enemy.
- **Burning ground and trails.** These count for `DWELL` (2) seconds, the time an enemy takes to walk out, not for their whole life.
- **Effects that grow.**
  - The Shadow's edge compounds with every cut and lasts its whole life. It is averaged over a `FIGHT` of 30 seconds. A fully ranked Shadow is now about 57k DPS at the top Forge band, rather than 10⁹.
  - The Hawk tower's focus restarts on each new target. It is averaged over the shots it takes to bring down `FOCUS_HP` (1000).
- **Marks.** Watch towers deal no damage of their own. `castleDps` adds what their marks add: each building gains (mark − 1) of its DPS over the ground in front of it that the strongest covering watch tower reaches. A plain mark is ×2 and Spotters raise it.

Travel time, target choice, overkill, terrain and who is in reach are left out. On purpose, this is a guide for comparing buildings, not a simulation.

## How it compares with the old measurements

For most buildings the averages land within a few percent of the old measured table: guilds, barracks, archers, assassins, snipers, gunners and cannons. The differences come from mechanics the old dummy crowd measured badly:

- **Lower than measured.** Burning ground, which the old dummies stood in for its whole life.
- **Higher than measured.**
  - Nanobots, which only burst when their host dies, and the old dummies never died.
  - The Shadow, which compounded forever against the old dummies.
- **About 2× lower than measured.** Wizard towers, Mage Guilds and the Valkyrie palace, because their fans and charges reach more of a dense crowd than the crowd model assumes.

`tests/siege-dps.test.ts` covers four things:

- The estimate reads the battle's own numbers.
- Every profile is finite and grows with the Forge and its path ranks. The exception is paths that trade damage for something else: Stopping power, and the Hawk tower's slow early focus.
- Shared trees are monotone.
- The Shadow cannot outweigh a castle.

## Floor and ceiling

`tools/siege-dps-ceiling.ts` runs in a few seconds. It writes two castles to `src/campaign/siege-ceiling.ts`:

- **The floor:** the keep and two Ranged Guilds, about **10 DPS**.
- **The ceiling:** the strongest castle its bounded search finds, currently 24 maxed Shadows and 19 watch towers, about **2.76M DPS**.

`DPS_MIN` and `DPS_MAX` are those castles' estimates, worked out live, so they follow tweaks too.

The ceiling is a legal, reproducible witness and the best castle in a bounded search, **not a proof of the global optimum**. The search:

- Places and upgrades through native purchases, `nextSteps`, `upgradeBuilding`, merges and `buySide`.
- Fits the 5×5-tile footprint with native `arrange` and `fitLayout`.

## When a building changes

Nothing needs regenerating. Castles are generated from the live estimate, so the same division budget buys more of a building that got weaker and less of one that got stronger.

The division budgets themselves (`siege-division-dps.ts`) come from raid calibration (`docs/design/SIEGE_MATCHMAKING.md`). That calibration records what the raids showed at the time. Re-run it when the balance between attackers and defenders has moved enough to matter, not after every tweak.

```
node --experimental-transform-types --import ./tests/pin-random.ts tools/siege-dps-ceiling.ts
PLAYWRIGHT_EXECUTABLE=/usr/bin/chromium node tests/siege-dps.mjs
```
