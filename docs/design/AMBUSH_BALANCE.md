# Ambush balance checks

These deterministic runs use native Defend combat, synthetic saves and the committed policy in tools/ambush-balance.ts. They never read player saves. The 30-level sweep has no star upgrades or spells, starts with two Archers and a Melee Guild, places buildings before upgrading until half its cap of 20 stand, then buys native local upgrades. Its first buildings cycle through the lanes' entries. This measures one deliberately simple strategy, not optimal human play.

The script stops after 2400 simulated seconds. A **script cap** below means the battle was still running; Ambush itself has no time limit. The bot only sends a wave once the last is clear, so a crowd still razing an outpost's houses holds it up.

## The placeholder curve

The waves are placeholders until tuned by hand (`AMBUSH_WAVES` in src/campaign/ambush-waves.ts):

- Each wave is a crowd: 50 enemies in the first level's first wave up to 500 in the last level's last, drawn from the zone's single-bodied species (no splitters, summoners, chains, fortresses, boats or regenerators). Fliers come from wave 4, at most 15% of a wave; waves 10 and 20 add the zone's toughest ground boss.
- Every enemy's HP is scaled so the wave's total is 300 × 1.07 a level × 1.11 a wave. Armor counts: a species whose shell halves physical damage counts double toward the total. Ranged shields scale with the HP.
- Every enemy's damage is scaled so the wave's average enemy deals 2 a second × 1.07 a level × 1.04 a wave, whatever its native damage.
- The keep (4× Defend's HP, with base Arrow loops), the outposts (2×) and the opening gold (800) grow 1.05 a level: a little slower than the crowds, so each level is a little harder than the last.
- Kills share 0.2 gold a point of the wave's HP.

## Thirty-level sweep

| Level | Result | Stars | Wave | Seconds | Kills | Gold earned |
|---|---|---:|---:|---:|---:|---:|
| moss-1 | Script cap | 0 | 20 | 2400 | 3052 | 3464 |
| moss-2 | Cleared | 1 | 20 | 2176 | 3398 | 4122 |
| moss-3 | Script cap | 0 | 19 | 2400 | 3196 | 3907 |
| desert-1 | Cleared | 1 | 20 | 2335 | 3592 | 4719 |
| desert-2 | Defeat | 0 | 9 | 1470 | 971 | 1080 |
| desert-3 | Script cap | 0 | 13 | 2400 | 1705 | 2025 |
| ember-1 | Script cap | 0 | 11 | 2400 | 1447 | 1760 |
| ember-2 | Script cap | 0 | 12 | 2400 | 1494 | 1893 |
| ember-3 | Script cap | 0 | 19 | 2400 | 3729 | 5862 |
| drowned-1 | Cleared | 2 | 20 | 2272 | 4171 | 7082 |
| drowned-2 | Cleared | 1 | 20 | 1993 | 4272 | 7578 |
| drowned-3 | Cleared | 1 | 20 | 2351 | 4364 | 8108 |
| fungal-1 | Cleared | 1 | 20 | 1887 | 4460 | 8676 |
| fungal-2 | Cleared | 1 | 20 | 1745 | 4558 | 9283 |
| fungal-3 | Cleared | 1 | 20 | 1702 | 4654 | 9933 |
| frozen-1 | Script cap | 0 | 14 | 2400 | 2354 | 4374 |
| frozen-2 | Defeat | 0 | 6 | 1023 | 727 | 1360 |
| frozen-3 | Defeat | 0 | 4 | 707 | 406 | 824 |
| crystal-1 | Script cap | 0 | 19 | 2400 | 4280 | 10403 |
| crystal-2 | Cleared | 1 | 20 | 2085 | 5137 | 13931 |
| crystal-3 | Script cap | 0 | 19 | 2400 | 4549 | 12299 |
| obsidian-1 | Cleared | 1 | 20 | 1523 | 5328 | 15950 |
| obsidian-2 | Cleared | 1 | 20 | 1470 | 5424 | 17067 |
| obsidian-3 | Cleared | 1 | 20 | 1526 | 5523 | 18261 |
| astral-1 | Script cap | 0 | 20 | 2400 | 5613 | 19506 |
| astral-2 | Defeat | 0 | 19 | 2268 | 5235 | 18494 |
| astral-3 | Script cap | 0 | 20 | 2400 | 5811 | 22366 |
| nadir-1 | Cleared | 1 | 20 | 1588 | 5909 | 23936 |
| nadir-2 | Cleared | 1 | 20 | 1892 | 6005 | 25613 |
| nadir-3 | Cleared | 1 | 20 | 1527 | 6102 | 27406 |

The mixed policy clears 15 levels, loses 4 and reaches its script cap on 11, most of those past wave 18. It never keeps an outpost, so its clears are one star. The losses (Amber Desert II, Frozen Vault II and III) haven't been looked into yet. Species still differ in speed, range and abilities that the HP and damage scaling doesn't even out, so a hand-tuned roster per level is the next step.

## Reproduce

    node --experimental-transform-types --import ./tests/pin-random.ts tools/ambush-balance.ts --levels=0 --seconds=2400

--levels selects comma-separated zero-based indices and --seconds the cap (the default is 2400). --buildings sets the cap, --simple a three-building opening, --max-stars a synthetic 90-star pool and --earned-stars a bounded one. The curve's knobs can be overridden for experiments: --hp, --level-growth, --wave-growth, --gold-per-hp, --release, --release-per, --keep-hp, --outpost-hp, --dps, --defense-growth and --start-gold. --debug adds the bot's buildings and the lanes. The raw deterministic results are in ambush-balance.json; CPU timings printed by the tool are machine-dependent and excluded from it.
