# Ambush deployment economy

Ambush starts levels 1/2/3 with **500/600/700 gold**. This is a level-local wallet, separate from the Mine’s persistent Gold. A retry restarts its budget and rebuys the saved layout only while affordable; run gold is not persisted.

Owning a building type unlocks it for Ambush. Each placement costs gold, and repeat copies can be bought without consuming Defend inventory. Building and selling are allowed during waves. Before waves, selling refunds the exact paid cost; during battle it refunds 70%, rounded down to a multiple of ten, and withdraws that building’s troops. No sales or purchases after victory/defeat.

## Rough pricing rule

All purchase costs round to the nearest ten (minimum 10):

`cost = round10(40 + 12 × potentialDPS × (1 + min(range, 20) / 20) × replacementMultiplier + durabilityAllowance)`

- Infantry potential DPS assumes its full Armory garrison, base unit damage/reload and Arms & Armour. Durability allowance is 15% of the full garrison’s HP. Faster training receives a small replacement-rate premium.
- Direct towers use their implemented damage/cooldown. Cannon splash assumes 2.5 targets; wizard splash assumes 2. These are rough potential estimates, not guaranteed throughput.
- A Watch Tower costs for support: an 8-DPS partner benefiting from its damage mark, plus its upgraded coverage. It has no direct damage.
- Prices and attacks share `combat-stats.ts`, so range, fire rate, damage, training and garrison upgrades affect prices consistently. Ambush snapshots Armory levels for the level; upgrades bought elsewhere take effect on retry or the next level.
- Defend specialty abilities are not implemented in these campaigns yet. Variants with identical implemented attacks therefore share a price; the table does not charge for unavailable powers. Max-Armory prices below include every relevant current Armory rank.

## Initial price table

| Building | Base potential DPS | Base cost | Max-Armory cost |
|---|---:|---:|---:|
| Melee Guild | 10.0 | 170 | 1210 |
| Ranged Guild | 5.0 | 110 | 790 |
| Spearmen hall | 10.0 | 180 | 1240 |
| Phalanx | 8.2 | 160 | 1120 |
| Javelin camp | 9.0 | 180 | 1450 |
| Lancer stable | 10.0 | 180 | 1280 |
| Assassins' den | 22.9 | 330 | 2630 |
| Blood hall | 22.9 | 330 | 2630 |
| Veil house | 22.9 | 330 | 2630 |
| Poison den | 22.9 | 330 | 2630 |
| Sniper lodge | 12.2 | 260 | 2250 |
| Gunner hall | 8.9 | 170 | 1400 |
| Musket hall | 10.8 | 210 | 1780 |
| Machine-gun nest | 14.5 | 260 | 2290 |
| Gatling emplacement | 57.1 | 900 | 8860 |
| Revolutionary | 40.0 | 820 | 7830 |
| Shadow | 28.0 | 510 | 4140 |
| Hero | 76.2 | 1140 | 9630 |
| Rocket battery | 8.7 | 180 | 1490 |
| Barracks | 15.0 | 240 | 1790 |
| Chapterhouse | 15.0 | 240 | 1790 |
| Berserker lodge | 15.0 | 240 | 1790 |
| Halberd yard | 15.0 | 240 | 1790 |
| Archer barracks | 9.1 | 170 | 1210 |
| Javelin bow lodge | 9.1 | 170 | 1210 |
| Skyranger lodge | 9.1 | 170 | 1210 |
| Skirmish camp | 9.1 | 170 | 1210 |
| Archer tower | 5.5 | 120 | 920 |
| Brazier tower | 5.5 | 120 | 920 |
| Hawk tower | 5.5 | 120 | 920 |
| Wisp Tower | 5.5 | 120 | 920 |
| Cannon tower | 17.9 | 320 | 1700 |
| Gun battery | 17.9 | 320 | 1700 |
| Mortar tower | 17.9 | 320 | 1700 |
| Minelayer | 17.9 | 320 | 1700 |
| Ultimate Archer Tower | 5.5 | 120 | 920 |
| C4 nanobots | 17.9 | 320 | 1700 |
| Watch tower | 8.0 support equiv. | 160 | 180 |
| Wizard tower | 20.0 | 330 | 940 |
| Pyre tower | 20.0 | 330 | 940 |
| Frost tower | 20.0 | 330 | 940 |
| Storm tower | 20.0 | 330 | 940 |
| Mage Guild | 12.0 | 230 | 1950 |
| Inferno hall | 12.0 | 230 | 1950 |
| Frost hall | 12.0 | 230 | 1950 |
| Storm hall | 12.0 | 230 | 1950 |
| Valkyrie palace | 17.8 | 300 | 2340 |
| Dark wizard keep | 30.0 | 540 | 5080 |

## Kill gold

`difficulty = maxHP / 12 + (damage / cooldown) / 2 + speed / 1.2`

`bounty = round10(4 × difficulty)` (minimum 10)

The bounty is calculated from each enemy’s actual spawn stats. Current weak road enemies generally pay 10 gold; tougher late-wave/level enemies pay 20 or more. Higher HP, DPS or speed increases the underlying reward before rounding. Every enemy gets a bounty. Only the friendly killing hit pays it, once; hits, escaped enemies and defeated friendly troops never pay. Gold is awarded immediately so it can fund another building during that wave. Siege gives no Ambush gold.

The coefficient choices are initial balance estimates. Check actual level outcomes and adjust starting gold, prices or reward coefficients together rather than tying this budget to the player’s persistent metal wallet.

Regenerate: `node --experimental-transform-types --import ./tests/pin-random.ts tools/ambush-prices.ts > docs/design/AMBUSH_ECONOMY.md`
