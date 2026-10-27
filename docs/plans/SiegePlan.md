# Siege plan (started)

Siege is the attack mode: the player's infantry buildings muster below a generated bot castle and their troops storm it; destroying the keep within four minutes wins, and results move the player's MMR. This file is a starting point. Seth's 2026-10-27 brief gave Siege two shared items (below); the rest is a backlog of suggestions to discuss with him before building.

Follow the architecture guidelines in [AmbushPlan.md](AmbushPlan.md#architecture-guidelines): combat stays Defend's, exact arithmetic in battle code, deterministic seeds, pure modules with thin UI, saves through `save.ts`, theme tokens, `t()`, phone and desktop browser tests, AGENTS.md kept current.

## Where Siege stands today

| File | What it does |
|---|---|
| `src/campaign/raid.ts` | `RaidBattle`: two native `DefendSim` sides on one map; targeting adapters let each side hit the other's soldiers and buildings; walls, gates and repairs sync. |
| `src/campaign/battlefield.ts` | `siegeField`: the castle in the upper half (keep, towers chosen from the castle's seed, a barracks and an archer barracks, a south gate), the player's muster rows below, an invisible attacker keep. |
| `src/campaign/castles.ts` | Seeded bot castles and their estimated defense rating. |
| `src/campaign/siege-rating.ts`, `siege-progress.ts` | MMR, offers, idempotent rated results, started raids counted as losses on reload. |
| `src/campaign/sim.ts` | Four-minute timer, win on keep destroyed, defense scaled from the castle rating. |
| `docs/design/SIEGE_MATCHMAKING.md` | Rating rules. The defense budget still needs fresh calibration (AGENTS.md). |

## From the brief (shared work, see OtherPlans.md)

1. **Strike spell quick bar** in the board's bottom left, replacing `.campaign-spells`' text buttons. OtherPlans.md §2.
2. **Fences as walls** at about 10% of a wall stone's HP: the castle's parks get fences that the attackers must break. OtherPlans.md §1.
3. **Remove the "How to play" box and the mode title** from the page header (Seth confirmed this on 2026-10-27).
4. **New pixel-art Siege tab icon.** OtherPlans.md §3.

## Known gaps worth fixing first

- `campaign/sim.ts` and `battlefield.ts` use `Math.hypot` and `**` in battle-adjacent code; replace with `src/exact.ts` helpers so raids replay identically across engines.
- The defense budget per castle rating is uncalibrated (AGENTS.md). Write a headless script that runs many raids per rating band with scripted rosters and fits the scale so a matched MMR wins about half the time.
- The UI is shared with Ambush in one `CampaignPage`. Once Ambush gets its own page (AmbushPlan.md phase 1 to 3), give Siege its own `campaign/siege-ui.ts` and drop the Ambush branches.

## Suggestions to discuss with Seth (not requested yet)

- **Siege HUD in the same style as Ambush's fixed header:** the enemy keep's health bar with a number, the timer, and your troops alive, at the top of the side menu.
- **Deploy control:** choose where along the bottom each building musters, or release buildings in waves (a "Send" button per building) instead of all at once.
- **Star rating** for raids (win, win with time left, win without losing a building) to give practice raids a goal.
- **Castle preview** before starting: a small render of the castle with its towers marked, like Ambush's level cards.
- **Siege engines for the player:** let the existing enemy siege engines (`siege.ts`: rams, trebuchets, cannons) be player units bought for the raid.
- **Replay of the last raid** at 2× speed after a defeat, so the player sees which tower stopped them.
