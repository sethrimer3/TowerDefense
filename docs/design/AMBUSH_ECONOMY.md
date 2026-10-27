# Ambush deployment economy

Ambush starts levels 1/2/3 with **500/600/700 gold**. This is a level-local wallet, separate from the Mine’s persistent Gold. A retry restarts its budget and rebuys the saved layout only while affordable; run gold is not persisted.

Owning a building type unlocks it for Ambush. Each placement costs gold, and repeat copies can be bought without consuming Defend inventory. Building and selling are allowed during waves. Before waves, selling refunds the exact paid cost; during battle it refunds 70%, rounded down to a multiple of ten, and withdraws that building’s troops. No sales or purchases after victory/defeat.

## Rough pricing rule

All purchase costs round to the nearest ten (minimum 10):

`cost = round10(40 + 12 × potentialDPS × (1 + min(range, 20) / 20) × replacementMultiplier + durabilityAllowance)`

- Infantry potential DPS assumes its full Armory garrison, base unit damage/reload and Arms & Armour. Durability allowance is 15% of the full garrison’s HP. Faster training receives a small replacement-rate premium.
- Direct towers use their implemented damage/cooldown. Cannon splash assumes 2.5 targets; wizard splash assumes 2. These are rough potential estimates, not guaranteed throughput.
- A Watch Tower costs for support: an 8-DPS partner benefiting from its damage mark, plus its upgraded coverage. It has no direct damage.
- `price-estimates.ts` estimates potential DPS using native catalog stats and Armory curves. It is used only for prices; all attacks run in DefendSim. Armory levels are snapshotted for the level; upgrades bought elsewhere take effect on retry or the next level.
- Actual worn Defend paths and their specialty abilities apply in battle. A worn variant adds a rough 20% premium per rank plus 1% of its allocated upgrade value (capped at 500 gold), before rounding. This is an initial estimate rather than a claim that all paths have equal combat value. The table shows unranked copies; Max-Armory prices include every relevant current Armory rank.

## Initial price table

| Building | Base potential DPS | Base cost | Max-Armory cost |
|---|---:|---:|---:|
| Melee Guild | 10.0 | 170 | 1210 |
| Ranged Guild | 5.0 | 110 | 690 |
| Spearmen hall | 10.0 | 180 | 1240 |
| Phalanx | 8.2 | 160 | 1120 |
| Javelin camp | 9.0 | 180 | 1260 |
| Lancer stable | 10.0 | 180 | 1280 |
| Assassins' den | 22.9 | 330 | 2630 |
| Blood hall | 22.9 | 330 | 2630 |
| Veil house | 22.9 | 330 | 2630 |
| Poison den | 22.9 | 330 | 2630 |
| Sniper lodge | 12.2 | 760 | 2480 |
| Gunner hall | 8.9 | 170 | 1210 |
| Musket hall | 10.8 | 210 | 1550 |
| Machine-gun nest | 14.5 | 260 | 1980 |
| Gatling emplacement | 57.1 | 1400 | 8140 |
| Revolutionary | 40.0 | 1320 | 7470 |
| Shadow | 28.0 | 1010 | 4640 |
| Hero | 76.2 | 1640 | 10130 |
| Rocket battery | 8.7 | 180 | 1300 |
| Barracks | 15.0 | 240 | 1790 |
| Chapterhouse | 15.0 | 240 | 1790 |
| Berserker lodge | 15.0 | 240 | 1790 |
| Halberd yard | 15.0 | 240 | 1790 |
| Archer barracks | 9.1 | 170 | 1410 |
| Javelin bow lodge | 9.1 | 170 | 1410 |
| Skyranger lodge | 9.1 | 170 | 1410 |
| Skirmish camp | 9.1 | 170 | 1410 |
| Archer tower | 5.5 | 140 | 1160 |
| Brazier tower | 5.5 | 140 | 1160 |
| Hawk tower | 5.5 | 140 | 1160 |
| Wisp Tower | 5.5 | 140 | 1160 |
| Cannon tower | 17.9 | 370 | 2010 |
| Gun battery | 17.9 | 370 | 2010 |
| Mortar tower | 17.9 | 370 | 2010 |
| Minelayer | 17.9 | 370 | 2010 |
| Ultimate Archer Tower | 5.5 | 640 | 1660 |
| C4 nanobots | 17.9 | 870 | 2510 |
| Watch tower | 8.0 support equiv. | 170 | 210 |
| Wizard tower | 20.0 | 330 | 940 |
| Pyre tower | 20.0 | 330 | 940 |
| Frost tower | 20.0 | 330 | 940 |
| Storm tower | 20.0 | 330 | 940 |
| Mage Guild | 15.2 | 280 | 2130 |
| Inferno hall | 15.2 | 280 | 2130 |
| Frost hall | 15.2 | 280 | 2130 |
| Storm hall | 15.2 | 280 | 2130 |
| Valkyrie palace | 17.8 | 800 | 3220 |
| Dark wizard keep | 37.5 | 1170 | 6110 |

## Kill gold

`difficulty = maxHP / 12 + (damage / cooldown) / 2 + speed / 1.2`

`bounty = round10(4 × difficulty)` (minimum 10)

The bounty is calculated from each enemy’s actual spawn stats. Weak enemies usually pay 10 gold; tougher native species and later-wave HP scaling pay more. Higher HP, DPS or speed increases the underlying reward before rounding. Every enemy gets a bounty. Only the friendly killing hit pays it, once; hits, escaped enemies and defeated friendly troops never pay. Gold is awarded immediately so it can fund another building during that wave. Siege gives no Ambush gold.

The coefficient choices are initial balance estimates. Check actual level outcomes and adjust starting gold, prices or reward coefficients together rather than tying this budget to the player’s persistent metal wallet.

Regenerate: `node --experimental-transform-types --import ./tests/pin-random.ts tools/ambush-prices.ts > docs/design/AMBUSH_ECONOMY.md`
