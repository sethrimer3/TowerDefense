# Siege opponents and ratings

Siege is an asynchronous raid against a versioned castle, currently generated and operated by a bot. Bot owners have player-style handles and a visible BOT badge. Ambush keeps its fixed levels. Siege has no level ladder: each completed rated raid unlocks another generated opponent near the raider's current MMR.

## Two ratings, with different jobs

- **Attack MMR** estimates the player's ability to win raids with their available army. New players start at 1000. Equipment, formation and decisions all affect actual results; this is not an equipment-independent skill rating.
- **Castle defense rating** estimates the strength of a particular castle revision under a particular combat ruleset. It is not its owner's attack MMR. Generated castles currently use an estimated prior; they have no fabricated match history.

For attacker rating A and castle defense rating D, expected attacker success is:

`E = 1 / (1 + 10^((D - A) / 400))`

Equal ratings represent a target 50% success rate. This is a model hypothesis, not a guarantee that the initial heuristic is calibrated. Winning changes attack MMR by `K × (1 - E)`; losing changes it by `K × (0 - E)`. K is 48 for the first ten rated raids, then 24. Ratings are rounded and bounded to 100–3000. Upsets earn more; losing to a weaker castle costs more. Destroying the keep wins; exhausting recruits or running out of time loses. No partial-credit draws.

## Provisional castle strength

Only functional defenses count. Current castle snapshots describe a keep, firing towers, destructible barricade targets and a finite guard roster. Barricades are durable targets, not simulated collision/line-of-sight walls; decorative enclosure does not receive an invented wall bonus.

```
H = sum(structure HP) + guard count × guard HP
F = sum(structure DPS × min(1.5, range / 5))
    + 0.6 × guard count × guard DPS
O = count of directed pairs of firing defenses within mutual range
P = sqrt(H × max(0.1, F)) × (1 + min(0.2, 0.025 × O))
D_prior = clamp(1000 + 400 × log2(P / 170), 100, 3000)
```

This separates a continuous strength score from the rating scale. It accounts for durability, damage, reach, guard numbers and limited supporting coverage. It does not claim to capture every tactical matchup. Two castles with the same estimate can perform differently against ranged or melee armies, and layout effects require simulation evidence.

The generator first chooses a seeded handle, positions, tower count, barricade count and guard count. It then solves the power budget for the requested rating by scaling HP and damage together. Because P scales linearly under this transformation, the resulting rating matches the requested budget without labeling an arbitrary castle with the requested number. A stable seed and ruleset reproduce exactly the same opponent.

The next target is selected in a ±80-MMR window around the player. The displayed target rating is recomputed from its defenses. Difficulty never changes after the opponent is offered, and never scales mid-battle to the player's current army.

## Initial calibration and its limits

Run:

```
node --experimental-transform-types --import ./tests/pin-random.ts tools/calibrate-siege.ts
```

[Recorded baseline](siege-baseline.json): a starter Melee Guild and Ranged Guild in the automatic bottom formation, without upgrades, won 7/30 raids against generated rating-1000 castles. The original manual formation won 16/30 and motivated reference power 170; the changed deployment shows why army/formation changes require further calibration. The small sample and fixed army are only an initial anchor. The same army won 30/30 at 800 and 0/30 at 1200, so the entire logistic curve is **not yet calibrated**. Do not display these model probabilities as measured chances.

Next calibration work should use held-out seeds, melee/ranged/mixed armies, multiple equipment tiers, multiple placement policies and repeated attack seeds. Fit the intercept and rating slope against actual win/loss data, then inspect calibration by rating band and army family. Treat a new ruleset as a new rating model. Castle building cost alone cannot establish its defense rating.

## Persistence and one rated result

Optional `Save.siege` stores attack MMR, match count, wins, seed sequence and the current opponent snapshot. Siege derives its muster formation from all owned infantry copies; it neither reads nor writes a saved placement layout. Older Siege layouts remain harmless unused saved data, and level unlocks no longer affect matchmaking. Every owned infantry building releases units at raid start; the finite reserve is at least 36 and at least the total garrison capacity. Enemy buildings face the attackers from the upper field. Other modes' saves stay unchanged.

The raid transitions `offered → started → won/lost`. Its castle identity, revision, stats and attacker rating are frozen before combat. Settlement is idempotent. A finished target may be practiced without further MMR changes. Finding the next opponent is available only after settlement; there is no free preview-reroll button. Forfeit/rebuild during a rated assault records a loss. Reloading a started raid records one loss on recovery; navigating to another tab just pauses it. The interface explains the reload rule before starting. This local-only policy discourages retry farming but is not anti-cheat protection.

## Later player-built castles

The bot/player-independent battle input is `CastleSnapshot` (`id`, `revision`, `ruleset`, `source`, `owner`, defenses and guards). It can support an export adapter for player castles. A real player castle must use compatible simulated mechanics; exporting a full Defend city into today's simplified Siege rules requires a deliberate conversion and fresh calibration, not merely copying its owner's MMR.

Before multiplayer:

1. Add an authenticated service, validated castle export, immutable revisions and a versioned battle ruleset. Keep attack ratings separate from each castle revision's defense rating and uncertainty.
2. Seed each new revision with a structural estimate and standardized simulated attacks. Keep it provisional until it has enough diverse real raids. Do not erase the attacker's established MMR when the castle is rebuilt.
3. Match against published castle snapshots. Freeze a server-issued match ID, defender revision, attacker army/upgrades, ratings and random seed. Validate/replay outcomes server-side and settle each match ID exactly once.
4. Update attack rating using actual raid results. Update the castle defense rating in the opposite direction: `D += K_defense × (E - result)`, with larger uncertainty/K for new revisions. Use the pre-match ratings for both updates. Counter farming through repeated pairs, collusion and selective publication with server policy.
5. Evaluate prediction error and reliability by army tier and matchup. Use a calibrated logistic/Glicko-style model and uncertainty-aware matching as evidence grows. Re-estimate changed castles by revision rather than treating every owner's historical defense as the current layout's strength.

No multiplayer matchmaking, real opponents, network service, online status, or server-verified rating is claimed by the current implementation.
