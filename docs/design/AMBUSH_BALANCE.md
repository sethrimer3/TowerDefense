# Ambush balance checks

These deterministic runs use native Defend combat, synthetic saves and the committed policy in tools/ambush-balance.ts. They never read player saves. The 30-level sweep has no star upgrades or spells, starts with two Archers and a Melee Guild, buys native local upgrades and caps itself at 14 buildings. It mixes Archer branches and guards the keep with the third paid building. This measures one deliberately simple strategy, not optimal human play.

The script stops after 1800 simulated seconds. A **script cap** below means the battle was still running; Ambush itself has no time limit. All twenty waves contain enemies, and waves 10/20 force the toughest affordable native zone kind without exceeding the budget.

## Tuning

- Mossbound’s starting wave budget fell from 16 to 8, allowing a small opening army to earn upgrades before tougher species arrive.
- The zone budget table is 8/18/28/36/46/60/75/90/180/140. Astral starts at 180 because its cheapest native enemy costs 150; the old curve produced empty early waves.
- Starting gold stays 500/600/700. Base DPS prices, local tier fees, native-stat kill bounties and 2/3/5-star branch prices remain the initial estimates. The measured opening can afford native upgrades without extra starting money.
- A separate three-building opening, using the first Fire Arrow branches near the entrance, clears Mossbound I: 20 waves, 2 stars, 649 simulated seconds. It uses no star upgrades or spells.
- Nadir III clears with 85 earned stars (obtainable before its first completion): 20 waves, 3 stars, 1444 simulated seconds. The script uses 14 buildings and no spells. Its ranks are bought through the real star-pool rules, leaving Bounty’s last rank unbought.
- Balance remains provisional. Placement, anti-air coverage, armor, regeneration, native unit abilities and branch choices matter. The simple mixed policy is intentionally left unchanged across the sweep so failures remain visible.

## Thirty-level sweep

| Level | Result | Stars | Wave | Seconds | Kills | Gold earned |
|---|---|---:|---:|---:|---:|---:|
| moss-1 | Script cap | 0 | 16 | 1800 | 70 | 2090 |
| moss-2 | Script cap | 0 | 15 | 1800 | 79 | 2010 |
| moss-3 | Cleared | 2 | 20 | 640 | 128 | 3530 |
| desert-1 | Cleared | 1 | 20 | 1095 | 105 | 3890 |
| desert-2 | Cleared | 1 | 20 | 1547 | 120 | 4650 |
| desert-3 | Cleared | 1 | 20 | 1307 | 122 | 4990 |
| ember-1 | Cleared | 1 | 20 | 1537 | 74 | 2990 |
| ember-2 | Cleared | 1 | 20 | 1612 | 109 | 4010 |
| ember-3 | Defeat | 0 | 1 | 72 | 1 | 30 |
| drowned-1 | Cleared | 2 | 20 | 1386 | 127 | 3610 |
| drowned-2 | Cleared | 2 | 20 | 821 | 144 | 4100 |
| drowned-3 | Cleared | 1 | 20 | 999 | 93 | 2870 |
| fungal-1 | Defeat | 0 | 2 | 949 | 15 | 350 |
| fungal-2 | Script cap | 0 | 17 | 1800 | 202 | 5090 |
| fungal-3 | Defeat | 0 | 2 | 716 | 14 | 350 |
| frozen-1 | Script cap | 0 | 8 | 1800 | 49 | 1980 |
| frozen-2 | Script cap | 0 | 3 | 1800 | 16 | 470 |
| frozen-3 | Script cap | 0 | 5 | 1800 | 38 | 1290 |
| crystal-1 | Defeat | 0 | 1 | 49 | 8 | 160 |
| crystal-2 | Defeat | 0 | 2 | 417 | 16 | 410 |
| crystal-3 | Cleared | 1 | 20 | 765 | 245 | 6800 |
| obsidian-1 | Defeat | 0 | 1 | 82 | 6 | 120 |
| obsidian-2 | Script cap | 0 | 5 | 1800 | 68 | 1370 |
| obsidian-3 | Script cap | 0 | 16 | 1800 | 180 | 4300 |
| astral-1 | Defeat | 0 | 6 | 244 | 5 | 350 |
| astral-2 | Cleared | 2 | 20 | 671 | 35 | 2480 |
| astral-3 | Script cap | 0 | 10 | 1800 | 16 | 1100 |
| nadir-1 | Defeat | 0 | 1 | 135 | 2 | 70 |
| nadir-2 | Defeat | 0 | 1 | 182 | 7 | 210 |
| nadir-3 | Cleared | 2 | 20 | 765 | 294 | 11990 |

The mixed policy clears 12 levels, loses 9, and reaches its script cap on 9. The separate three-building and 85-star probes bracket the opening and final level. No difficulty claim is inferred from this policy alone.

The final audit also checks that damage credit cannot change native directional armor. Burn, venom, bleed and ground-fire parity tests compare statistics on/off, and the four levels whose waves can include Siege Beetles were rechecked after that fix.

## Reproduce

    node --experimental-transform-types --import ./tests/pin-random.ts tools/ambush-balance.ts
    node --experimental-transform-types --import ./tests/pin-random.ts tools/ambush-balance.ts --levels=0 --buildings=3 --simple --seconds=1800
    node --experimental-transform-types --import ./tests/pin-random.ts tools/ambush-balance.ts --levels=29 --earned-stars=85 --seconds=1800

Use --seconds=1800 to match the sweep’s cap (the default is 900). --levels selects comma-separated zero-based indices, --max-stars grants a synthetic 90-star pool, and --earned-stars sets a bounded synthetic pool. The raw deterministic results are in ambush-balance.json. CPU timings printed by the tool are machine-dependent and excluded from the committed data.
