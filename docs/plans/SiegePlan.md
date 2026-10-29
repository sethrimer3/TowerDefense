# Siege plan

Siege is the attack mode. The player's infantry buildings muster below a generated castle, and their troops storm it. Destroying the keep within four minutes wins, and the result moves the player's MMR.

This plan turns Seth's 2026-10-27 Siege brief into ordered work for an AI agent: ranks and an entry screen, bots that look like players, castles generated from native towers, units and upgrades at a difficulty measured in defensive DPS, ranks anchored to the maxed-out DPS ceiling, name plates on the board, and a mana experiment for strike spells. It also keeps the earlier shared items and known gaps.

Read this whole file, [AmbushPlan.md](AmbushPlan.md#architecture-guidelines)'s architecture guidelines, AGENTS.md (the Siege paragraph and the Player profile, Strike spells and Upgrade tree sections) and `docs/design/SIEGE_MATCHMAKING.md` before starting a phase. Tick each phase here as it lands.

## Seth's brief (2026-10-27, verbatim intent)

- **Entry screen:** show the player's MMR, rank and a Find Match button.
- **Ranks:** Bronze, Silver, Gold, Platinum, Diamond, Master and Grandmaster. Each has five divisions, V (lowest) to I (highest). Determine the MMR ranges.
- **Matchmaking now:** against bots with player-like names and custom flag portraits. Use one MMR system for now.
- **Castle generation and difficulty:** a bot's MMR is tied to its castle's estimated raid difficulty, starting from overall defensive DPS. Difficulty decides which towers, units and upgrade levels a randomly generated castle includes.
- **Rank scaling:** the Grandmaster range is anchored to the theoretical maximum defensive DPS with every upgrade maxed. Lower ranks scale beneath that ceiling. The exact DPS thresholds and their MMR mapping are still to be determined.
- **Match UI:** the player's name and flag at the bottom of the board, the opponent's at the top.
- **Strike spell experiment:** in Siege, spells cost mana instead of recharging. Each enemy unit killed grants 1 mana. Every strike spell costs 1, except Meteor (2) and Reinforcements (3). Starting mana and any cap are undecided.
- **Future, documented only:** real-player matchmaking, and possibly a separate bot MMR from the real-player MMR (never shown in game yet). Later, try granting more mana for higher-level enemy units.

## Where Siege stands today

| File | What it does now |
|---|---|
| `src/campaign/siege-ui.ts`, `siege-entry.ts` | Rank entry screen, Find Match/reveal/preview/Attack/Back, rated results and rank transitions, and native battle controls. Two board plates show names, flags and ranks. The shared native strike bar uses transient Siege mana; Defend and Ambush keep cooldowns. |
| `src/campaign/sim.ts` (`CampaignSim`) | Native 240-second raid lifecycle and keep-destruction victory. Castle upgrades determine strength; the old flat defense damage/HP scale is removed. |
| `src/campaign/raid.ts` (`RaidBattle`) | Two native `DefendSim` sides on one map. The defense wears the castle's saved levels and bonuses; attackers retain the player's upgrades. |
| `src/campaign/battlefield.ts` (`siegeField`) | Generates the upper native city from the saved blueprint, with every owned infantry copy in bottom muster rows. |
| `src/campaign/castles.ts`, `castle-generator.ts` | Revision-2 `siege-v2` snapshots hold native layouts, Armory levels, training, Skills and side ranks. Seeded purchases, upgrades, merges and placement target an estimated DPS budget. |
| `src/campaign/siege-rating.ts` | One Elo MMR: initial 1000, minimum 100, maximum 3000; K 48 for the first ten games, then 24. |
| `src/campaign/siege-progress.ts` | `SiegeSave {mmr, games, wins, sequence, raid}`. Opponents are offered at MMR ±80. Settlement is idempotent; started raids found on reload lose once. Legacy offers migrate at the same seed/MMR. |
| `src/campaign/castle-dps.ts`, `src/defend/average-dps.ts` | Each building's average DPS from its own catalog numbers, summed over a castle with watch-tower marks. Replaced the measured table on 2026-10-28 (see `docs/design/SIEGE_DPS.md`). |
| `docs/design/SIEGE_MATCHMAKING.md` | One visible MMR, native castle snapshots, calibration assumptions, generated division budgets and the future player-castle boundary. |

Already done from the first brief: the quick bar replaced `.campaign-spells` (OtherPlans.md §2), and the How to play box and mode title are gone. Still shared and open: fences as walls (OtherPlans.md §1) and the new Siege tab icon (OtherPlans.md §3).

## Target design

### One MMR scale

There is one number for everyone: the player's MMR and each bot's MMR sit on the same scale. A bot's MMR **is** its castle's difficulty rating. The separate "castle defense rating" in today's UI and design doc goes away. Elo still settles each raid as attacker MMR against bot MMR.

### Ranks and divisions

Seven ranks × five divisions = 35 tiers, each a fixed MMR band, in a pure `src/campaign/siege-ranks.ts`:

| Rank | MMR | Divisions (V → I) |
|---|---|---|
| Bronze | below 400 | V <80 · IV 80–159 · III 160–239 · II 240–319 · I 320–399 |
| Silver | 400–799 | 80 each |
| Gold | 800–1199 | 80 each (a new player at 1000 is Gold III) |
| Platinum | 1200–1599 | 80 each |
| Diamond | 1600–1999 | 80 each |
| Master | 2000–2399 | 80 each |
| Grandmaster | 2400 and up | V 2400–2479 … I 2720 and up (to `MAX_MMR` 3000) |

These are a **proposal** for Seth. The reasoning: equal 80-point divisions keep Elo steps readable (a matched win at K 24 is +12, so about seven wins a division), 400 points a rank is one Elo "10× odds" step, and the existing 100–3000 range already fits. `MIN_MMR` 100 means Bronze V's floor is never reached by losing. Keep the table data-driven (`RANKS`, `DIVISION_WIDTH`, `rankOf(mmr) → {rank, division, floor, ceiling, progress}`), so phase 6 can retune the bands without touching UI code.

New-player placement: start at `INITIAL_MMR` (Gold III), as now. Whether the first ten games should show "Unranked (placement 3/10)" is an open question. The default is no: show the rank at once.

### Bots that look like players

- **Names:** player-like handles, not "First Last": lower-case and camelCase words, joined words, underscores, a few trailing digits or a year, rare `xX_…_Xx` styling. They are generated from the castle seed by hashing (no `Math.random`) and must pass `decodeCastle`'s `/^[A-Za-z0-9_]{1,32}$/` and `cleanName`'s 2–24 characters. Keep a blocklist of word pairs so no combination is offensive. Word lists live in `src/campaign/bot-names.ts`.
- **Flags:** a seeded `Flag` from `src/profile/model.ts` (a base plus 0–4 layers from `PATTERNS`, `PALETTE` and `OPACITIES`, with contrasting colours) built by `botFlag(seed)` in `src/campaign/bot-identity.ts`. Saved in the snapshot as `owner.flag` and validated with the profile's bounded flag decoder.
- **No bot tag (decided 2026-10-27):** the game does not say whether an opponent is a bot, anywhere, for now. Phase 3 removes today's `BOT` tag from the opponent details; plates, match card and results carry none. `source: 'bot'` stays in the snapshot data only, for the future split.

### Castles built from native pieces at a measured difficulty

A castle stops being an abstract `Defense[]` list. It becomes a real Defend layout with real kinds, paths, ranks and Forge levels, chosen to hit a **DPS budget**:

1. **Snapshot revision 2, ruleset `siege-v2`.** `CastleSnapshot` holds `owner {id, name, flag}`, `seed`, `mmr` and `castle`: the structures (`kind`, `path?`, `rank?`, a quarter position, as `PlacedStructure`), the defense side's `levels` (Forge/Armory levels), optional side ranks (`keepRanks`, `wallRanks`, `gateRanks`, `ballistaRanks`) and the shared ultimate trees' ranks (`nanoRanks`, `shadowRanks`, `revolutionaryRanks`, `chronoRanks`) where present. The same shape can later hold a real player's Defend castle, which is the point (see Future).
2. **Defensive DPS estimator.** `src/campaign/castle-dps.ts`: `castleDps(snapshot)` is the sum, over every defender, of sustained damage per second against a standard target set (one tough single target plus a crowd, weighted), including garrison size, splash, chains, burning ground and path effects, plus the keep's own Arrow loops and Boiling oil. Hand formulas cannot cover more than 100 kinds and paths reliably, so the per-kind, per-path, per-rank numbers come from a **measured table**. A headless tool (`tools/measure-siege-dps.ts`) builds a tiny native `DefendSim` per (kind, path, rank, levels band), lets it fire at a fixed dummy crowd for N seconds (with pinned seeds), records damage per second, and writes `src/campaign/siege-dps-table.ts` (generated, checked in). A Node test hashes the catalog inputs the table was measured from and fails when they change, so the table can't silently drift. Forge levels apply as the catalog's own multipliers on the measured base. *(Superseded 2026-10-28: the measured table took over an hour to regenerate after any building change and let the Shadow compound without limit against immortal dummies. Each building now has a simple average DPS read from its own catalog numbers, `src/defend/average-dps.ts`, which follows tweaks live.)*
3. **Generator.** `generateCastle(seed, mmr)` turns MMR into a DPS budget (`dpsForMmr`, below) and then **buys** a castle under that budget with a seeded, deterministic greedy walk:
   - Start from the keep, the city ring and a gate, and a minimum of two basic defenders.
   - Repeatedly pick one of these moves, by seeded weights, while the estimate stays under the budget: add a basic building (Watch tower, Melee Guild, Ranged Guild); attune one (Archer/Cannon/Wizard tower, Barracks/Assassins' den/Spearmen hall, Archer barracks/Mage Guild/Gunner hall); take a branch (`via` attunement); climb a path rank; raise a Forge level band; add keep, wall, gate or ballista ranks; and, above Diamond, merge three maxed partners into an ultimate (`mergePartners`' rule).
   - Every move goes through the real `nextSteps`/`upgradeBuilding` rules on a scratch `DefendSave`, so a generated castle is always one a player could build.
   - Stop when the next move would overshoot. A final pass trims or adds one small step to land within ±5% of the budget.
   - Position structures with `fitLayout`/`arrange` on the castle's fixed tile footprint (a constant `CASTLE_TILES`), so placement uses Defend's rules and needs no randomness beyond the seed's choices.
   - Variety: seeded "personalities" (tower-heavy, troop-heavy, magic, gunpowder, balanced) weight the move choices, so two castles at one MMR look different.
4. **Battlefield from the snapshot.** `siegeField` stops choosing towers itself. It lays out the snapshot's castle (tiles, structures, gates, wall pieces) in the upper half with Defend's `generateCity` pipeline, and keeps the muster rows and invisible attacker keep below.
5. **Defense side wears the castle's upgrades.** `RaidBattle` takes the snapshot's `levels` and builds the defense `Bonuses` with the same `placedBattlePaths`/side-rank snapshots Defend uses, instead of `defaultDefendSave().levels`. `CampaignSim`'s flat `2**(…)*.65` multiplier is deleted: difficulty now comes only from what is in the castle.

### Rank scaling: anchored to the maxed ceiling

- **Ceiling.** `tools/siege-dps-ceiling.ts` computes `DPS_MAX`: the highest `castleDps` reachable on the castle footprint with every Forge level, path, side tree and ultimate at its maximum. Use a bounded search over which maxed kinds fill the footprint, since the footprint's quarters, not money, are what limits a maxed castle. It writes the number and the winning castle into `src/campaign/siege-ceiling.ts` (generated) and prints both.
- **Floor.** `DPS_MIN`: the estimate of the weakest legal castle (the keep plus two basic buildings at level 0).
- **Mapping.** Log-linear between the two anchors: `dpsForMmr(mmr) = DPS_MIN × (DPS_MAX / DPS_MIN) ^ ((mmr − MIN_MMR) / (GM_ANCHOR − MIN_MMR))`, clamped. `GM_ANCHOR` is the MMR where the ceiling sits, proposed as **Grandmaster I's floor (2720)**, so a Grandmaster I bot fields a near-maxed castle and the top band above it stays at the ceiling. Geometric spacing matches Elo, where each 400 points is a constant odds ratio, and makes each rank multiply DPS by the same factor. Use `intPow` and other exact helpers only if this ever runs inside battle code. It runs at generation, so ordinary `Math` is fine there but must be deterministic: evaluate through a precomputed per-division table (`DIVISION_DPS[35]`) written by the tool, not live `Math.pow`, so every engine gets identical castles.
- **Thresholds are measured, not guessed.** The tool prints the per-rank and per-division DPS table for Seth to review. Phase 6 then calibrates: scripted attacker rosters at each rank's typical progression raid castles at each band; if a matched MMR wins far from 50%, adjust the curve (for example, a bend in the exponent below Gold) and re-run. The agreed table goes into `docs/design/SIEGE_MATCHMAKING.md`.

### Entry screen and Find Match

The Siege tab opens on an entry screen, not straight into a raid:

- Top: the player's flag and name (with Edit profile), and a **rank emblem**: pixel-art badges for the seven ranks with a Roman numeral for the division, drawn procedurally in `src/ui/rank-emblems.ts` (black outlines, lit from the upper left, Bronze to Grandmaster growing more ornate; no PNG set, per AGENTS.md). Under it, the rank name, MMR, a progress bar to the next division, and wins/games.
- Centre: a large oak **Find Match** button. Pressing it rolls the next opponent (`nextOpponent`) and shows a short reveal (the opponent's flag drops in and the name types on, about 600 ms, instant under Reduce Motion), then a match card: their flag, name, rank emblem and MMR, a small castle preview (reuse Ambush's lazy preview renderer), and **Attack** / **Back**. There is no fake "searching…" wait; see open question 6.
- A started raid that is abandoned still counts as a loss (current rule). Back on the match card before Attack does not.
- After the raid, the result panel shows the MMR change and any rank-up or rank-down with the emblem animating. Retry and Next (now Find Match) work as today.

### Match UI on the board

Two parchment name plates drawn over the board, outside the sim, as DOM over the canvas so text stays crisp and translatable:

- **Top centre:** the opponent's flag, name and rank emblem.
- **Bottom centre** (above the safe-area inset, clear of the spell bar in the bottom left): the player's flag, name and rank emblem.
- Plates are small (about 40 px tall on phones), at 85% opacity, and fade to 40% while a pointer or an armed spell aim is under them so they never block a cast.
- Reuse `flagSvg` and `escapeText`, theme tokens and `t()` labels.

### Mana for strike spells (Siege only)

- **Rules:** the attacker starts with `SIEGE_MANA.start` mana, gains 1 for each defending **unit** killed (castle soldiers, the hero, summons; not buildings, see open question 3), up to `SIEGE_MANA.cap`. Costs: Frost nova 1, Necromancy 1, Meteor 2, Reinforcements 3 (`SPELL_MANA`). Casting needs enough mana and has no cooldown. Seth's values (2026-10-27): start 1, cap 8. Both live in one constant for easy tuning.
- **Where it lives:** a new optional `ScenarioRules` hook, `spellGate`, consulted by each `cast*`. Absent in Defend and Ambush, so cooldowns and replays are untouched. In Siege, `CampaignSim` installs a mana gate on the attack side: `canCast(spell)` checks mana, `spend(spell)` deducts, and cooldown timers are not started. Kills are counted where the defense side's soldiers die from the attack side's damage, through `RaidBattle`'s targeting adapters (a kill credited once, never twice across the proxy), with a `manaFor(unit)` function returning 1 now (Future: by unit level).
- **Necromancy check:** graves come from deaths on the attack side's enemy list. In a raid the attacker's "enemies" are the defense's soldiers through proxies, so verify graves appear where castle troops fall. If not, add a raid adapter that records graves for proxied deaths.
- **Spell bar:** `SpellBar.update` takes a small gate interface (`ready`, `fill`, `badge`) instead of reading cooldowns directly. The cooldown gate keeps today's behaviour; the mana gate shows each icon's cost as pips, disables icons the player can't afford, and fills by `mana / cost`. A mana counter (a pixel crystal and number) sits beside the bar. The ready cue plays when a spell becomes affordable.
- **Experiment flag:** keep it behind a Siege-only constant `SIEGE_MANA.enabled = true`, so cooldowns can come back in one line if the experiment fails.

## Architecture guidelines

1. **Combat stays Defend's.** No Siege-only damage, targeting or projectile code. Castles are native buildings with native paths, and the defense side reads its upgrades through the same snapshot functions Defend uses.
2. **Defend's goldens stay green.** Everything new is behind absent-by-default `ScenarioRules` hooks or campaign-only code. `defend-replay`, `defend-city` and `defend-fences-save` goldens must not change in any phase of this plan.
3. **Deterministic castles.** `generateCastle(seed, mmr)` must produce the identical snapshot in every engine: hash-based choices, no `Math.random`, no live `Math.pow`/`log`/`hypot` (use generated tables and `src/exact.ts`). Add a golden (`tests/fixtures/siege-castles.golden.json`) hashing generated castles across seeds and every division.
4. **Saves through `save.ts`.** `SiegeSave` and `CastleSnapshot` changes go into `defaults()`/`decode()`. Revision-1 snapshots migrate (phase 5). Decoding never throws and drops malformed optional fields.
5. **Generated tables are reproducible.** Every generated file (`siege-dps-table.ts`, `siege-ceiling.ts`, the division DPS table) has a header naming its tool and command, and a test that fails when its inputs change.
6. **Pure modules, thin UI.** Ranks, names, flags, DPS estimates, generation and mana are pure and Node-tested. `ui.ts` (consider renaming to `siege-ui.ts` with the entry screen in `siege-entry.ts`) only renders and wires.
7. **One MMR in the UI.** Remove "defense rating" wording everywhere in game. The two-scale text in `SIEGE_MATCHMAKING.md` is rewritten in phase 6.
8. **Look and text:** theme tokens, pixel art with black outlines, `t()` messages for every new label in all nine catalogs (English text with English fallback is fine for long text, per `docs/LOCALIZATION.md`).
9. **Mobile first.** Every phase has a browser script at 390 × 844 and 1280 × 800 with an isolated save, a valid seeded profile and screenshots in `test-results/`.
10. **Keep AGENTS.md current** (the Siege paragraph, new modules and commands) and tick phases here.

## Implementation order

One PR per phase. Each lists its tests; run `npm test` and `npm run build` before committing.

### Phase 0: exact maths and cleanup ☑
- Replace `Math.hypot`, `**` and `Math.log2` in `castles.ts` and `sim.ts` with `src/exact.ts` helpers or tables. (`castles.ts` is rewritten in phase 5, but `sim.ts`'s scale runs today.)
- Rename `campaign/ui.ts` to `campaign/siege-ui.ts` and update imports. Shared host types live in `campaign/host.ts`; Siege controls use explicit `t()` catalog entries.
- **Tests:** existing campaign tests unchanged; `tests/siege-math.test.ts` checks exact helper precision, Elo symmetry and a source guard against transcendental battle calls. `tests/siege-targeting.test.ts` covers native breach/flank targeting. Existing native battle, navigation and profile browser scripts cover desktop/phone pages.
- **Related native cleanup:** a building keeps one shared damage target on a reachable exposed face, refreshed with Defend's flow field after collision changes and on half-second simulation ticks. This fixes flanking infantry aiming behind a wall and avoids additional targets that would multiply splash damage. The current castle budget remains unchanged until phases 4–6 replace it with native pieces/upgrades.

### Phase 1: ranks ☑
- `siege-ranks.ts`: `RANKS`, `DIVISION_WIDTH`, `rankOf(mmr)`, `rankLabel` (`t()`, for example "Gold III").
- `src/ui/rank-emblems.ts`: seven procedural pixel emblems plus division numerals, with a gallery fixture.
- **Tests:** `tests/siege-ranks.test.ts` (every MMR from 100 to 3000 maps to exactly one tier, bands are contiguous, 1000 is Gold III, edges are inclusive at the floor); `node tests/siege-emblems.mjs` gallery screenshot to show Seth.

### Phase 2: bot identities ☑
- `bot-names.ts` and `bot-identity.ts` (`botName(seed)`, `botFlag(seed)`).
- Add `owner.flag` to the snapshot (still revision 1 until phase 5; optional field, so old saves decode).
- **Tests:** names are deterministic, valid for `decodeCastle` and `cleanName`, and clear of the blocklist across 100,000 seeds; flags are deterministic, decode, and have readable contrast.

### Phase 3: entry screen and board name plates ☑
- Entry screen with the rank emblem, MMR, progress bar, Find Match, reveal, match card (with castle preview), Attack/Back, and rank-up/down on the result panel.
- Top and bottom name plates over the board.
- Remove "defense rating" text from the UI (the bot's MMR is shown instead) and remove the `BOT` tag from the opponent details.
- **Tests:** `node tests/siege-entry.mjs` at both sizes: entry, Find Match, reveal (and instant under Reduce Motion), Back doesn't count a loss, Attack starts a raid, plates placed top and bottom and not overlapping the spell bar, rank change after a scripted win and loss, reload mid-raid still counts a loss.

### Phase 4: defensive DPS estimator and ceiling ☑
- `src/defend/average-dps.ts` (`averageDps`); `castle-dps.ts` (`castleDps`). The measured table and `tools/measure-siege-dps.ts` were removed on 2026-10-28.
- `tools/siege-dps-ceiling.ts` → `src/campaign/siege-ceiling.ts` (`DPS_MAX`, the ceiling castle), and `DPS_MIN`.
- Post the printed ceiling and floor to Seth as a sanity check.
- **Tests:** the table covers every attacking kind, path and rank in the catalog; its input hash matches; `castleDps` is monotonic (adding a building or a rank never lowers it); the ceiling castle is legal under `fitLayout` and the upgrade rules.

### Phase 5: native castle generation (`siege-v2`) ☑
- Snapshot revision 2 (including native Smithy training and Skills so every measured upgrade is reproducible), `generateCastle(seed, mmr)` as described, `siegeField` from the snapshot, and `RaidBattle`'s defense side wearing the snapshot's levels and paths. Delete `CampaignSim`'s flat scale.
- **Migration:** a saved revision-1 offered raid is regenerated at the same seed and MMR. A started revision-1 raid is settled as a loss (the existing reload rule). Completed raids keep their results.
- **Tests:** generated castles are legal (every step via `upgradeBuilding`), land within ±5% of budget, differ across seeds at one MMR, and match `tests/fixtures/siege-castles.golden.json`. Higher divisions contain more and higher-tier pieces on average. A revision-1 save decodes and migrates. `tests/campaign-native.test.ts` still passes with native castles. Browser: castles at Bronze, Gold, Diamond and Grandmaster render and fight at both sizes.

### Phase 6: rank scaling and calibration ☑
- `dpsForMmr` via the generated `DIVISION_DPS` table, with `GM_ANCHOR` and the floor/ceiling anchors.
- Replace `tools/calibrate-siege.ts` with a version for native castles: scripted attacker rosters per rank (built with the same greedy walk on the attack side's budget), N raids per division, reporting the win rate against matched castles. Adjust the curve until matched raids land near 50%.
- Rewrite `docs/design/SIEGE_MATCHMAKING.md` for one MMR, the rank table, the anchors and the measured DPS per division.
- **Tests:** the division table is strictly increasing and ends at `DPS_MAX`; a generated Grandmaster I castle's DPS is within 5% of the ceiling; the calibration tool runs a smoke sample in CI under a time budget (full runs are manual).

Phase 6 validation: 921 Node assertions and the production build pass; native castle and entry/HUD browser checks pass at 390×844 and 1280×800. Independent seeds 1001–1002 won 35/68 matched raids (51.5%). Per-rank outcomes and the fixed-army assumptions are published in `docs/design/SIEGE_MATCHMAKING.md`. Only the Siege castle golden changed; Defend replay, city and fence goldens are untouched.

### Phase 7: mana experiment ☑
- `spellGate` scenario hook, `SIEGE_MANA` and `SPELL_MANA`, kill crediting through `RaidBattle`, `manaFor(unit)`, the gate interface on `SpellBar`, and the mana counter.
- **Tests:** `tests/siege-mana.test.ts`: start of 1 and cap of 8 respected; each defending unit's death gives exactly 1 (none for buildings or attacker losses, no double credit through proxies); costs 1/1/2/3; an unaffordable cast is refused and spends nothing; no cooldown starts. Defend and Ambush still use cooldowns and their replay golden is untouched. Browser: the counter rises as castle troops fall, icons light as they become affordable, Meteor and Reinforcements cast and spend, at both sizes.

Phase 7 validation: all 927 Node assertions and the production build pass. Desktop/phone browsers cover native melee kill rewards, cost pips, affordability, Meteor/Reinforcements spending and Reduce Motion; entry/HUD and the shared Defend/Ambush spell bar also pass. All 2,885 native damage pairs were regenerated after adding the optional cast hooks; numerical damage and the ceiling are unchanged. No golden files changed. All numbered Siege phases (0–7) are complete; the shared items and future work below retain their separate scope.

### Shared items still open (OtherPlans.md)
- Fences as walls (§1): castle parks get fences the attackers must break. Lands with that shared PR, not as a Siege phase.
- New Siege tab icon (§3).

## Part 2: the living raid (Seth's 2026-10-28 brief)

Phases 0–7 above are done. This part turns Seth's second Siege brief into ordered work. Plan against the code as it stands: `siege-ui.ts` (the battle page), `siege-hud.ts` (the corner banner plates and the remaining-troops box, `TroopBox`), `battlefield.ts` (`siegeField`, which still lays the player's muster rows in the lower half), `raid.ts` (`RaidBattle`), `sim.ts` (`CampaignSim`, the 240-second limit), `siege-mana.ts`, and Defend's renderer (`DrawOptions`, `unit-outline.ts`, `battle-art.ts`'s `rimOf`, `simple-units.ts`, `lighting.ts`, `structure-art.ts`'s `flagPixels`).

### What Seth asked for (verbatim intent)

1. **Side outlines:** enemy units get a red pixel outline, and the player's units get a slightly dark blue one, instead of black.
2. **The defender's flags:** the invaded player's flag flies from the castle (the keep) and from aesthetic-only poles around the kingdom. Poles can be destroyed, but they never slow units or affect the battle.
3. **Flag-bearers:** three defender units walk around bearing the defender's flag. Each has 1 HP, drops mana, and is never targeted by units.
4. **Victory:** on a successful siege, every enemy flag burns away and is replaced by the invader's flag. The keep falls, then the walls fall one by one, along with a few buildings still standing, in a circular wave out from the keep.
5. **Remaining units box:** a translucent black background with a gold border.
6. **Directing units:** the player should be able to direct their units. How is undecided: by unit type (ranged, melee, …), only hero and ultimate units, or every unit individually.
7. **No muster buildings:** remove the invading player's buildings from the bottom of the board.
8. **Timer:** keep it, at 2 minutes. The light goes from day to sunset to twilight/dusk to night, with night covering the last 20 seconds.

### Rules for this part

Everything in [Architecture guidelines](#architecture-guidelines) still holds. In addition:

- **Presentation stays presentation.** Outlines, flags, poles, the day cycle, the flag burn and the collapse wave never change the battle. They read the sim and draw. Only items 3 (flag-bearers), 6 (directing), 7 (no muster buildings) and the 2-minute limit change gameplay.
- **Siege-only options.** Each new renderer input is an optional `DrawOptions` field that is absent in Defend and Ambush, so their pixels, `test:render-cache` comparisons and goldens stay unchanged. New sim behaviour goes through `ScenarioRules` hooks or campaign code (`raid.ts`, `sim.ts`), never into Defend's ordinary step.
- **Time comes from the battle, not the wall clock,** for anything that must line up with the timer (the day cycle, the collapse wave's start). Pausing a raid freezes it. Purely decorative motion (a flag waving, flames) may use the wall clock, as Defend does.
- **Reduce Motion:** flags hang still, the burn becomes a quick crossfade, the collapse wave swaps everything to rubble at once, and the day cycle still changes (light is not motion) but without flicker.
- **Calibration.** The 2-minute limit and the removal of muster buildings both change win rates. Re-run `tools/calibrate-siege.ts` once, after phase 8, and update `docs/design/SIEGE_MATCHMAKING.md`. Only the Siege goldens may change.

### Target design

#### Side outlines (item 1)

- Add an optional `DrawOptions.sides`: `{ ink(unit): string | undefined }`, or simply two ids sets, `{ enemy: Set<number>, friend: Set<number> }`, from `RaidBattle` (the defense side's soldiers are the player's enemies; in the attack sim's view they are proxied as `Enemy`, so key by the original soldier id). Colours are constants in `siege-hud.ts` or a new `campaign/siege-colors.ts`: `ENEMY_INK` a clear pixel red (about `#b3202a`) and `FRIEND_INK` a slightly dark blue (about `#1d3f7a`). Both must stay readable on grass, streets and at night. Check them in a gallery screenshot with Seth before finishing.
- **Merged outlines on:** `UnitOutline` keeps one outline layer per ink (black, red, blue), so touching units of the same side still share one outline, and units of opposite sides keep their own colours where they meet. The silhouettes are already made once per sprite; tinting is done when the layer is filled (`source-in` fill with the ink), not by baking new sprites per colour.
- **Merged outlines off and Simple squares:** `rimOf` and `simple-units.ts`'s `rims` take the ink from the same option. Sprites drawn with their own baked black rim are drawn `bare` plus a coloured silhouette rim, as merged mode already does, rather than recoloured by pixel scanning each frame.
- **Who counts as a unit:** soldiers, heroes, summons, risen undead and reinforcements, plus flag-bearers (red). Castle civilians keep black, since they are not units. If Seth wants them red too, it is a one-line change. The defenders' buildings keep their black art outlines.
- **Tests:** a Node test that the outline layer for each ink receives exactly that side's silhouettes; `test:render-cache` and Defend's pixel checks unchanged; `node tests/siege-outlines.mjs`: close-ups of both sides touching, merged on and off, Simple squares, night, at both sizes.

#### The defender's flags and poles (item 2)

- **Keep flag:** the keep's banner (`flagPixels` in `structure-art.ts`, a fixed design today) gains an optional custom face: a `Flag` from `profile/model.ts` (`flagPixels(flag)` gives the 16 × 24 face), resampled to the banner's cloth and waved by the existing wave. An optional `DrawOptions.keepFlag` passes the castle owner's flag. Defend passes nothing and keeps its banner.
- **Poles:** a new presentation module `campaign/siege-flags.ts` (`SiegeFlags`, kept by the Siege page). It places 6–10 poles with the castle's seed: corners of the wall ring, beside gates, in parks and on open ground outside the walls, at least 6 cells apart and never on a building cell. Each pole is a 1-art-pixel-wide post (outlined) with the owner's flag at the top, waving on the wall clock. Poles are not buildings and not in the sim: no collision, no targeting, no flow-field cost.
- **Destroying poles:** like the forest's trees (`forest-art.ts`'s `ForestArt.update`), `SiegeFlags.update(sim)` watches what landed this frame: new `boom` effects and spell impacts within their radius, landed arrows and bolts on the pole's cell, and melee strokes (cooldown jumps) of units standing within a cell. A struck pole snaps: the top half topples away from the hit, the flag drops, and a small splinter burst follows (from `defendRandom("effects")`, none under Reduce Motion). The stump stays. Poles have no HP; one hit fells them. A pole felled during the raid stays down for the victory burn (nothing to burn).
- **Drawing:** poles draw after the units' shadows and before trees, and fade to half opacity over a unit, like park trees.
- **Tests:** placement is deterministic per seed and avoids buildings; a seeded blast fells poles in reach and only those; the sim's state hash is identical with and without poles (proving no gameplay effect); browser gallery of standing, snapped and the keep's custom flag.

#### Flag-bearers (item 3)

- **The unit:** a new defender Soldier kind `"flagBearer"` (`FLAG_BEARER` in `catalog.ts` beside the other troop stats: `hp: 1`, no attack, walking speed a little under a swordsman's). Three spawn on the defense side at battle start near the keep, homeless (`home` -1, so no deployment range), and stroll the castle's streets (reuse `strollStreets` or the civilians' street picking). They never fight, never answer the banner and never respawn.
- **Never targeted:** add `untargetable` to the candidate filter in `raid.ts`'s targeting adapters (the code that exposes defense soldiers to the attack side as enemies), so no attacker's `nearestEnemy`, hunt, patrol, tower target or homing projectile picks a flag-bearer. They still take **area** damage: blasts (`explode`), strike spells, burning ground, chain and piercing hits that pass through, cleaves, and splash. With 1 HP, anything that touches them kills them. This makes them a skill target for spells and splash, which suits mana.
- **Mana:** a flag-bearer's death credits `manaFor(flagBearer)` (see open question B; default 2) through the existing kill crediting, once, with a small pixel crystal bursting from the body. The mana counter shows the gain. Death by any cause the attacker made counts. They cannot die otherwise.
- **Look:** a small figure in the defender's colours carrying a pole with the owner's flag (the same face as the keep's, smaller), red-outlined. When one dies its flag falls and stays as a dropped flag (it burns in the victory with the rest).
- **Tests:** three spawn, stroll and stay inside the castle; no attacker type ever targets one (a fixture with every attacker kind around them for 60 s); a blast, a spell, burning ground and a piercing shot each kill one and credit mana exactly once; no double credit through the proxy; the defense side's stats and the castle DPS estimate ignore them.

#### Victory: flags burn, the castle falls (item 4)

- **Trigger:** `CampaignSim.phase` becomes `"won"` as now. The page starts a `SiegeVictory` presentation (`campaign/siege-victory.ts`) and shows the result panel only when it ends (about 4 s) or when the player taps to skip. The rating is settled at the win as now; the animation never delays or changes it.
- **Collapse wave:** a ring expands from the keep's centre at a fixed speed (about 14 cells a second). When the ring reaches a building it collapses in this order: the keep first (at t = 0), then every wall stone and gate in order of distance, then a seeded third of the standing houses and structures (by `hash(seed, building id)`), never all. Collapse is drawn by handing the renderer an optional `DrawOptions.collapsed: Set<number>` of buildings to draw as rubble (their existing `rubblePixels`/`wallRubblePixels`/`keepRubblePixels`), plus a puff of dust and a few falling stones per building, the `stoneFall`/`houseFall`/`keepFall` sounds (spaced by the existing cue gaps), and a gentle screen shake that is off under Reduce Motion. The sim is not touched: no damage is dealt, so stats and the defense side stay as the battle left them.
- **Flags burn:** at the same time, the keep flag, every standing pole's flag, and each flag-bearer's flag (carried or dropped) burn: a pixel burn line eats the cloth from the bottom up with embers (the Library fire's `charPixels` style), then the invader's flag (`Save.profile.flag`) rises up the same pole and unfurls. The keep's new flag flies over the rubble. Flags are timed from the wave: each burns when the ring reaches its pole, so the change sweeps outward with the collapse.
- **Defeat:** nothing changes on a loss.
- **Tests:** `tests/siege-victory.test.ts`: collapse order is by distance and deterministic; walls, gates and the keep always collapse; the chosen share of other buildings is stable per seed; nothing in the sim changes. Browser: frames at 0.5 s, 1.5 s, 3 s and the end, skip by tap, Reduce Motion instant, both sizes.

#### Remaining units box (item 5)

- `.siege-units` loses its oak `var(--wood)` background: use a translucent black (about `rgba(0, 0, 0, .55)`) with a gold border (the `--brass` token, 2 px, with a 1 px dark outer line so it reads on bright grass). Keep the existing layout, badges and phone/desktop sizes. If `theme.css` has no gold token suitable for borders, add one there and use it, rather than a raw colour in `style.css`.
- **Tests:** the existing HUD browser script's screenshot, updated, at both sizes.

#### No muster buildings (item 7)

- **Today:** `siegeField` places one real building per owned infantry copy in rows across the lower half (`row = 100` upward), and each trains and replenishes its native garrison there.
- **Target:** the player's homes become **hidden staging homes**: the same native structures (so `Soldier.home`, paths, ranks, drill time and replenishment all keep working), marked `hidden` like the invisible attacker keep, laid along the bottom edge rows, with their cells left open (not solid), not drawn, not shown in the inspector and never targeted. Troops leave from the home's point on the bottom edge and march up. The camera's default framing moves up to show the castle and the approach.
- Check every place that assumes a visible home: `sim.ts`'s hidden-building `continue` (line ~583) must not stop training; deployment range (`deployRangeOf`) is measured from the hidden home and must still reach the castle (give staging homes no range limit, as spells' troops have none); defenders must not aim at them (`raid.ts` targets); `ownSolid` and flow fields must treat their cells as open.
- **Replenishment** stays native by default (lost troops are retrained at the staging home and march in from the edge), because calibration assumed it. See open question C.
- **Tests:** no attacker building is drawn or selectable; troops appear at the bottom edge and reach the castle; the garrison refills after losses; defenders never shoot at empty ground where the homes are; `campaign-native.test.ts` still passes.

#### Two minutes, and day to night (item 8)

- **Limit:** replace the literal 240 in `sim.ts` and `siege-ui.ts` with one constant, `SIEGE_SECONDS = 120`, in `sim.ts`. The HUD timer reads it.
- **Day cycle by time left:** a pure `siegeSky(left)` in `campaign/siege-sky.ts` returns `{ phase, night, tint }`:

  | Time left | Phase | Look |
  |---|---|---|
  | 120 → 70 s | Day | full daylight |
  | 70 → 45 s | Sunset | warm orange tint rising, long shadows, no torches |
  | 45 → 20 s | Twilight / dusk | violet-blue tint, `night` easing from 0 to about 0.6, torches and windows lighting up |
  | 20 → 0 s | Night | `night` 1, the castle lit by its torches and the fires of the fight |

  Phase edges blend over about 3 s, so nothing snaps. These boundaries are proposals; the one fixed point is night at 20 s left.
- **Rendering:** Siege now passes `weather: null` and `night: 0`, which also leaves the lighting pass off. Pass a calm clear-weather `Weather` so `DefendLighting` runs, `night` from `siegeSky`, and a new optional `DrawOptions.tint` (a colour and strength, drawn as one `soft-light` or `multiply` rectangle over the board under the lights). Torches and hand torches already brighten with `night`. The timer box takes the phase's colour (gold by day, orange at sunset, violet at dusk, pale blue at night).
- **Tests:** `siegeSky` at each boundary and inside each band, monotonic `night`; the sim ends at 120 s; browser frames at 110, 60, 35 and 10 s left at both sizes.

#### Directing units (item 6): options, for Seth to choose

Today the attackers march on the war banner `raid.ts` plants on the enemy keep, and Defend already has two tools that work in a raid's native sim: the per-building rally point (`setRally`, dragged from a selected troop building) and the double-tap rally flag that moves everyone. With the muster buildings gone (item 7), there is nothing on the board to select, so a new control is needed.

| Option | How it plays | Cost to build | Risk |
|---|---|---|---|
| **A. By unit type** | A squad bar beside the spell bar: chips for Melee, Ranged, Mounted, Magic (and Heroes when present). Tap a chip, tap the board to plant that group's flag; tap the chip twice to send it back to the keep assault. | Medium: group the staging homes by role (`TRAINS` + catalog kind), call `setRally` for each home in the group, draw one coloured flag per group. | Low. Reads well on a phone, and the counts box already lists units by kind. |
| **B. Only hero and ultimate units** | Heroes, Shadows, Valkyrie palaces' valkyries and similar each get a portrait button; tap one, tap the board. Everyone else follows the banner. | Low to medium. | Leaves most of the army undirected; weak when the player has no ultimates (most players below Master). |
| **C. Every unit individually** | Drag a box or tap units to select them, then tap a destination (RTS style). | High: a selection model, a box-select gesture that doesn't fight panning, per-soldier orders the native AI must respect. | Fiddly on a phone, in a 2-minute battle; hard to make deterministic and testable. |
| **D. By staging home (squads)** | Each owned building's garrison is a squad with its own badge; the box of remaining units becomes the squad list. | Medium: it is exactly the native rally point per home, with no selection model. | Many squads with a large army; long lists on a phone. |

**Recommendation: A, with heroes and ultimates as their own chip.** It covers B's appeal, needs no new AI (every group is a set of native rally points), and stays one tap to choose and one tap to aim on a phone. Implement it as a `SquadBar` sharing the spell bar's armed-then-tap pattern, with an armed squad and an armed spell cancelling each other. A planted group flag uses the blue rally flag art in the group's colour; the war banner on the keep remains the default target. The plan does not start this phase until Seth chooses.

### Implementation order for Part 2

One PR per phase, as before. Tick each here as it lands.

- **Phase 8: two minutes and no muster buildings ☐.** `SIEGE_SECONDS`, hidden staging homes and troops entering from the bottom edge, the camera reframed, recalibration (`tools/calibrate-siege.ts`, `SIEGE_MATCHMAKING.md`), Siege goldens only.
- **Phase 9: day cycle and the units box ☐.** `siegeSky`, the lighting on in Siege, `DrawOptions.tint`, the timer's colours, and the translucent black and gold units box.
- **Phase 10: side outlines ☐.** `DrawOptions.sides`, per-ink outline layers, rims and simple squares, with a colour gallery for Seth.
- **Phase 11: the defender's flags ☐.** Custom keep flag, `SiegeFlags` poles, felling them.
- **Phase 12: flag-bearers ☐.** The unit, untargetable filtering, mana on death, art.
- **Phase 13: victory ☐.** `SiegeVictory`: the collapse wave, the burning and raised flags, skip, Reduce Motion.
- **Phase 14: directing units ☐.** Only after Seth picks an option (default A).

### Open questions for Part 2 (defaults in brackets)

- **A. Directing units:** which option? [A, by unit type, with heroes and ultimates as their own group.]
- **B. Flag-bearer mana:** how much does each drop, and is it on death only or also while walking? [2 mana each, on death only.]
- **C. Replenishment without muster buildings:** do lost troops still get retrained and march in from the edge, or is the army fixed at the start, which would make the units box a true countdown? [Retrained, as now; calibration assumed it.]
- **D. Civilians' outline:** should the castle's civilians get the red outline too? [No, black; they are not units.]
- **E. Which buildings fall in the victory wave:** walls, gates and the keep always fall. What share of the rest? [A seeded third.]
- **F. Day cycle edges:** are sunset at 70 s left and dusk at 45 s left right? [Yes; night at 20 s is fixed.]

## Useful extras (not requested; ask Seth first)

- **Raid stars** (win; win with a minute left; win without losing a building) for practice raids.
- **Season reset:** a soft MMR squeeze toward Gold each season, with a reward by the peak rank.
- **Replay of the last raid** at 2× after a defeat.
- **Player siege engines:** let `siege.ts`'s engines join the raid as player units.

## Future (documented only, nothing in game yet)

- **Real-player matchmaking.** Players' own Defend castles become `siege-v2` snapshots (the same schema), uploaded to a server that validates them (never trust a client snapshot) and serves opponents near the player's MMR. Raids stay local simulations against the downloaded snapshot. Results are reported to the server for rating.
- **Separate bot and player MMR.** Possibly keep a hidden bot-only MMR beside the real-player one, so bot farming can't inflate the visible rank. Do not show this split in game until Seth decides. Plan for it now by keeping `SiegeSave.mmr` as the one visible value, and by tagging every settled result with `source: 'bot' | 'player'` (already on the snapshot), so a later split can be replayed from history.
- **Mana by enemy level.** `manaFor(unit)` returns 1 now. Later, try more mana for higher-tier defenders (an attuned building's troops 2, an ultimate's 3, the hero 5).

## Decisions and open questions

Decided by the brief: seven ranks × five divisions; one MMR for players and bots; bots with player-like names and flags; castles generated from difficulty measured in defensive DPS; the Grandmaster anchor at maxed DPS; plates at the top and bottom; mana of 1 a kill with costs 1/1/2/3.

Open, for Seth (defaults in brackets; the agent builds the default and keeps it tunable):

1. ~~Starting mana and cap.~~ Decided: start 1, cap 8 (tune after phase 7 playtests if needed).
2. **Rank bands.** Are equal 80-point divisions with Gold III at the start right? [Yes; retune after calibration.]
3. **Do destroyed defending buildings give mana** (towers, guilds), or only units? [Units only, as the brief says.]
4. **Grandmaster anchor.** Should maxed DPS sit at Grandmaster I's floor (2720) or at Grandmaster V's (2400)? [GM I.]
5. ~~Show `BOT` anywhere?~~ Decided: no, nowhere in game yet.
6. **Find Match feel.** An instant reveal, or a short "searching" pause for atmosphere? [Instant reveal of about 600 ms; no fake wait.]
7. **Placement games.** Show "Unranked" for the first ten games? [No.]
8. **Exact DPS thresholds per division.** Initial measured thresholds are published in `docs/design/SIEGE_MATCHMAKING.md`, with the native floor/ceiling and all 35 division anchors. The fixed reference armies won 35/68 independent raids; real-player progression and mana play still need playtesting.
