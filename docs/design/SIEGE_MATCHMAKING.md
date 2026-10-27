# Siege opponents and ratings

Siege raids a seeded bot-owned native Defend city. The player approaches from below using every owned infantry building, including copies currently placed in Defend, with the same worn paths, global bonuses, garrisons and training logic. The bot castle occupies the upper field and contains native houses, streets, walls, a gate, keep, towers and infantry buildings. Native units fight native units; projectiles, spells, wall collapse, guard mitigation and repairs use Defend's implementations. Destroying the keep wins; the four-minute limit loses. Garrisons replenish as in Defend, with no separate finite recruit reserve.

## Native battle integration

`battlefield.ts` uses Defend's city generator and actual building footprints. `raid.ts` runs two DefendSim instances sharing the city geometry, one per owner. Only owned buildings recruit and attack. Opposing native units and buildings appear as targeting adapters to the existing tower/troop modules. Damage is forwarded to the owning simulation's normal defender/building damage functions. These adapters do not render as monsters; DefendRenderer combines actual units and effects from both sides. A small red ground marker identifies castle infantry. Synchronization propagates destroyed/repaired buildings and collision to both sides.

All owned infantry copies retain their native upgrades and deploy automatically in rows below the castle. Very large rosters stack same-kind muster footprints once the available lower field is full; copies are never silently dropped. The battle snapshots the roster without editing inventory or the Defend layout.

## Two ratings

- **Attack MMR** estimates the player's raid success with their available army. New players start at 1000. This includes army/equipment strength as well as decisions.
- **Castle defense rating** estimates a particular castle revision's difficulty. It is separate from its owner's attack MMR. Current bot ratings are provisional estimates, with no fabricated match history.

For attacker rating A and castle rating D:

`E = 1 / (1 + 10^((D - A) / 400))`

Winning changes attack MMR by `K × (1 - E)`; losing changes it by `K × (0 - E)`. K is 48 for the first ten rated raids, then 24. Ratings are rounded and bounded to 100–3000. Equal ratings express a model target of 50% success, not an empirically measured chance.

## Provisional generation budget

Saved `CastleSnapshot` offers retain the original seed, bot handle and legacy abstract strength description so existing local offers remain readable. The legacy prior is:

```
H = sum(abstract structure HP) + guard count × guard HP
F = sum(abstract structure DPS × min(1.5, range / 5))
    + 0.6 × guard count × guard DPS
O = count of directed firing-defense pairs within mutual range
P = sqrt(H × max(0.1, F)) × (1 + min(0.2, 0.025 × O))
D_prior = clamp(1000 + 400 × log2(P / 170), 100, 3000)
```

This describes a generation budget, not native battle physics. The generator varies the seeded owner, tower count and strength budget; offers are selected within ±80 of the player's current MMR. The native adapter builds actual native tower types from the seed and tower count, then maps the stored estimate to a fixed defense multiplier:

`scale = 0.65 × 2^((D_prior - 1000) / 800)`

The scale applies through existing Defend bonuses to defender tower damage, troop HP/damage and keep/wall HP. Native tower characteristics, city collision and troops remain authoritative. Difficulty is fixed before battle and never adjusts to the attacker's current army mid-raid.

The inherited budget prior does not yet measure native wall topology, every specialty matchup, native garrison replenishment or every tower type. Therefore this adaptation needs fresh calibration. The old simplified-combat baseline was deleted because its win rates do not describe this engine. Do not display model probabilities as measured native success rates.

## Calibration

Run the actual native simulation, without reading a player save:

```
SIEGE_SAMPLES=5 node --experimental-transform-types --import ./tests/pin-random.ts tools/calibrate-siege.ts
```

This samples six rating bands with the starter army. Increase the sample count for a baseline; five seeds is only a smoke check. Native raids are considerably more expensive than the discarded simplified simulation.

Before treating defense ratings as calibrated, use held-out castle seeds, melee/ranged/mixed armies, several equipment tiers and repeat attack seeds. Fit the budget intercept and rating slope against real native win/loss results, then inspect reliability by rating band and army family. Use a new rating-model revision when mechanics or the export format change. Building cost alone cannot establish a defense rating.

## Persistence and rated results

Optional `Save.siege` stores MMR, match count, wins, seed sequence and a frozen opponent offer. The transitions are `offered → started → won/lost`; settlement is idempotent. A completed target can be practiced without further rating changes. A new target is available only after settlement. Forfeit/rebuild during a rated assault records a loss. Reloading a started raid records one loss on recovery; navigating to another tab pauses it. This local policy is not server-side anti-cheat protection.

Legacy Siege placement layouts are ignored; all infantry musters from inventory. Ambush gold and other modes' city layouts remain separate.

## Later player-built castles

The existing `CastleSnapshot` is a legacy budget offer, not a serialized native city. Real player castles require a versioned native export containing layout, structure copies, worn paths, Armory ranks and relevant bonuses. The native ownership/damage bridge can then run those mechanics directly rather than translating them into a simplified combat game.

Before multiplayer:

1. Add authenticated, validated native exports, immutable castle revisions and a versioned battle ruleset. Keep attack MMR separate from each castle revision's defense rating and uncertainty.
2. Seed each defense estimate with structural features and standardized native simulated attacks. Keep it provisional until there are diverse real raids.
3. Freeze a server-issued match ID, castle revision, attacking roster/upgrades, ratings and random seed. Validate/replay outcomes server-side and settle each match once.
4. Update attack MMR from actual results. Update defense rating in the opposite direction: `D += K_defense × (E - result)`, using pre-match ratings and uncertainty. Apply server policies against repeated-pair farming and selective publication.
5. Evaluate prediction reliability by army tier and matchup, recalibrating changed castles by revision.

Current opponents are clearly labeled bots. No multiplayer service or server-verified rating is implemented.
