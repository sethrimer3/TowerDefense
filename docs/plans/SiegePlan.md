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
| `src/campaign/siege-ui.ts` (`SiegePage`) | Profile header (flag, name, Edit profile), an opponent `<details>` (bot name, a `BOT` tag, defense rating and the player's MMR), the roster, Retry/Next, and the shared strike `SpellBar` (`src/ui/spell-bar.ts`) on cooldowns. |
| `src/campaign/sim.ts` (`CampaignSim`) | The 240-second limit, win on keep destroyed, and a defense scale `2**((rating-1000)/800)*.65` applied as flat multipliers on tower/troop damage, troop HP and keep/wall HP. Uncalibrated. |
| `src/campaign/raid.ts` (`RaidBattle`) | Two native `DefendSim` sides on one map. The defense side runs on `defaultDefendSave().levels`, so a castle has no upgrade levels of its own today. |
| `src/campaign/battlefield.ts` (`siegeField`) | Lays the castle in the upper half: the keep at a fixed spot, towers picked by seed from archer, cannon, wizard, hawk, brazier and wisp, plus a barracks and an archer barracks, and a south gate. Muster rows lie below, with an invisible attacker keep (uid 200000). |
| `src/campaign/castles.ts` | `CastleSnapshot` revision 1, ruleset `siege-v1`: an abstract `Defense[]` list (keep/tower/barricade with HP, damage, range) and guards. `castlePower` = sqrt(endurance × DPS) × overlap. The rating is `1000 + 400·log2(power/170)`. Bot names come from FIRST/LAST lists plus digits. There is no bot flag. |
| `src/campaign/siege-rating.ts` | Elo: `INITIAL_MMR` 1000, `MIN_MMR` 100, `MAX_MMR` 3000, K 48 for the first 10 games, then 24. |
| `src/campaign/siege-progress.ts` | `SiegeSave {mmr, games, wins, sequence, raid}`. `nextOpponent` picks a castle at MMR ± 80. `settleRaid` is idempotent. A started raid found on reload counts as a loss. |
| `src/campaign/economy.ts`, `price-estimates.ts` | Ambush's rough native DPS per **base** kind (`ambushPrice`: full garrison, cannon splash × 2.5, flame × 2). A useful seed for Siege's estimator, but it covers no attuned, branch or ultimate kinds and no path ranks. |
| `docs/design/SIEGE_MATCHMAKING.md` | Two ratings (attack MMR and castle defense rating), the calibration command and the multiplayer roadmap. |

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
2. **Defensive DPS estimator.** `src/campaign/castle-dps.ts`: `castleDps(snapshot)` is the sum, over every defender, of sustained damage per second against a standard target set (one tough single target plus a crowd, weighted), including garrison size, splash, chains, burning ground and path effects, plus the keep's own Arrow loops and Boiling oil. Hand formulas cannot cover more than 100 kinds and paths reliably, so the per-kind, per-path, per-rank numbers come from a **measured table**. A headless tool (`tools/measure-siege-dps.ts`) builds a tiny native `DefendSim` per (kind, path, rank, levels band), lets it fire at a fixed dummy crowd for N seconds (with pinned seeds), records damage per second, and writes `src/campaign/siege-dps-table.ts` (generated, checked in). A Node test hashes the catalog inputs the table was measured from and fails when they change, so the table can't silently drift. Forge levels apply as the catalog's own multipliers on the measured base.
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

### Phase 1: ranks ☐
- `siege-ranks.ts`: `RANKS`, `DIVISION_WIDTH`, `rankOf(mmr)`, `rankLabel` (`t()`, for example "Gold III").
- `src/ui/rank-emblems.ts`: seven procedural pixel emblems plus division numerals, with a gallery fixture.
- **Tests:** `tests/siege-ranks.test.ts` (every MMR from 100 to 3000 maps to exactly one tier, bands are contiguous, 1000 is Gold III, edges are inclusive at the floor); `node tests/siege-emblems.mjs` gallery screenshot to show Seth.

### Phase 2: bot identities ☐
- `bot-names.ts` and `bot-identity.ts` (`botName(seed)`, `botFlag(seed)`).
- Add `owner.flag` to the snapshot (still revision 1 until phase 5; optional field, so old saves decode).
- **Tests:** names are deterministic, valid for `decodeCastle` and `cleanName`, and clear of the blocklist across 100,000 seeds; flags are deterministic, decode, and have readable contrast.

### Phase 3: entry screen and board name plates ☐
- Entry screen with the rank emblem, MMR, progress bar, Find Match, reveal, match card (with castle preview), Attack/Back, and rank-up/down on the result panel.
- Top and bottom name plates over the board.
- Remove "defense rating" text from the UI (the bot's MMR is shown instead) and remove the `BOT` tag from the opponent details.
- **Tests:** `node tests/siege-entry.mjs` at both sizes: entry, Find Match, reveal (and instant under Reduce Motion), Back doesn't count a loss, Attack starts a raid, plates placed top and bottom and not overlapping the spell bar, rank change after a scripted win and loss, reload mid-raid still counts a loss.

### Phase 4: defensive DPS estimator and ceiling ☐
- `tools/measure-siege-dps.ts` → `src/campaign/siege-dps-table.ts`; `castle-dps.ts` (`castleDps`).
- `tools/siege-dps-ceiling.ts` → `src/campaign/siege-ceiling.ts` (`DPS_MAX`, the ceiling castle), and `DPS_MIN`.
- Post the printed ceiling and floor to Seth as a sanity check.
- **Tests:** the table covers every attacking kind, path and rank in the catalog; its input hash matches; `castleDps` is monotonic (adding a building or a rank never lowers it); the ceiling castle is legal under `fitLayout` and the upgrade rules.

### Phase 5: native castle generation (`siege-v2`) ☐
- Snapshot revision 2, `generateCastle(seed, mmr)` as described, `siegeField` from the snapshot, and `RaidBattle`'s defense side wearing the snapshot's levels and paths. Delete `CampaignSim`'s flat scale.
- **Migration:** a saved revision-1 offered raid is regenerated at the same seed and MMR. A started revision-1 raid is settled as a loss (the existing reload rule). Completed raids keep their results.
- **Tests:** generated castles are legal (every step via `upgradeBuilding`), land within ±5% of budget, differ across seeds at one MMR, and match `tests/fixtures/siege-castles.golden.json`. Higher divisions contain more and higher-tier pieces on average. A revision-1 save decodes and migrates. `tests/campaign-native.test.ts` still passes with native castles. Browser: castles at Bronze, Gold, Diamond and Grandmaster render and fight at both sizes.

### Phase 6: rank scaling and calibration ☐
- `dpsForMmr` via the generated `DIVISION_DPS` table, with `GM_ANCHOR` and the floor/ceiling anchors.
- Replace `tools/calibrate-siege.ts` with a version for native castles: scripted attacker rosters per rank (built with the same greedy walk on the attack side's budget), N raids per division, reporting the win rate against matched castles. Adjust the curve until matched raids land near 50%.
- Rewrite `docs/design/SIEGE_MATCHMAKING.md` for one MMR, the rank table, the anchors and the measured DPS per division.
- **Tests:** the division table is strictly increasing and ends at `DPS_MAX`; a generated Grandmaster I castle's DPS is within 5% of the ceiling; the calibration tool runs a smoke sample in CI under a time budget (full runs are manual).

### Phase 7: mana experiment ☐
- `spellGate` scenario hook, `SIEGE_MANA` and `SPELL_MANA`, kill crediting through `RaidBattle`, `manaFor(unit)`, the gate interface on `SpellBar`, and the mana counter.
- **Tests:** `tests/siege-mana.test.ts`: start of 1 and cap of 8 respected; each defending unit's death gives exactly 1 (none for buildings or attacker losses, no double credit through proxies); costs 1/1/2/3; an unaffordable cast is refused and spends nothing; no cooldown starts. Defend and Ambush still use cooldowns and their replay golden is untouched. Browser: the counter rises as castle troops fall, icons light as they become affordable, Meteor and Reinforcements cast and spend, at both sizes.

### Shared items still open (OtherPlans.md)
- Fences as walls (§1): castle parks get fences the attackers must break. Lands with that shared PR, not as a Siege phase.
- New Siege tab icon (§3).

## Useful extras (not requested; ask Seth first)

- **Siege HUD** like Ambush's fixed header: the enemy keep's health, the timer and your troops alive.
- **Deploy control:** choose where each building musters, or release buildings in waves.
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
8. **Exact DPS thresholds per division.** Still unknown (Seth, 2026-10-27): phase 4's tools and phase 6's calibration must work them out and bring the table to Seth for review.
