# Ambush deployment economy

Level 1 starts with **800 gold**, each later level 5% more (rounded to tens). This wallet is local to the level and separate from Mine metals. A retry or reload starts a fresh wallet and empty build grid. Old saved pad layouts are discarded; best stars remain saved.

The palette offers **Melee Guild, Ranged Guild, Archer Tower, Cannon Tower and Wizard Tower** to every player. Each uses native Defend combat at base Armory levels. Defend ownership, Knowledge paths and Smithy upgrades do not enter the Ambush battle. Purchases and sales work during waves. Sales before wave 2 starts return the full investment, including local upgrades. From wave 2 onward the refund is 70%, rounded down to tens. Actual native nextSteps upgrades are bought with level gold, including merges that consume two maxed partners; their investments are retained by the resulting building.

## Rough base pricing

    cost = round10(40 + 12 × potentialDPS × (1 + min(range, 20) / 20) × replacementMultiplier + durabilityAllowance)

Infantry assumes a full native base garrison. Cannon splash assumes 2.5 targets; wizard splash assumes two. These are pricing estimates only; all damage, fire rates, special abilities and projectiles run through DefendSim. Prices round to the nearest ten, minimum 10.

| Building | Base potential DPS | Gold |
|---|---:|---:|
| Melee Guild | 10.0 | 170 |
| Ranged Guild | 5.0 | 110 |
| Archer tower | 5.5 | 140 |
| Cannon tower | 17.9 | 370 |
| Wizard tower | 20.0 | 330 |

## Local upgrade fees

Attunement: 55% of the current kind’s catalog price; branch attunement: 70%; path ranks I/II/III: 40/65/100%; merge: 150%; beyond-ultimate: 200%. Each fee rounds to tens, minimum 20 gold. These bounded tier estimates do not use native Knowledge costs, which span six orders of magnitude. The selected native building panel offers every valid next step and displays its total investment refund. No global research enters combat.


## Kill gold

    wave gold = 0.2 × the wave's total enemy HP
    bounty = wave gold / the wave's enemies

Native enemy deaths pay once, at their wave's bounty (the young of the fallen at the current wave's). Escapes and fortress body parts pay nothing. Gold arrives immediately and can fund an in-wave purchase. Siege never uses this wallet. The 30-level scripted balance checks use these opening budgets, base prices and tier fees. Measurements and reproducible opening/final-level probes are in AMBUSH_BALANCE.md; these remain rough, adjustable estimates.

Regenerate:

    node --experimental-transform-types --import ./tests/pin-random.ts tools/ambush-prices.ts > docs/design/AMBUSH_ECONOMY.md
