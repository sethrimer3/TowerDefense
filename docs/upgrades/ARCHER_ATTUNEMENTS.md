# Archer Barracks: three attunements

Requested scope: the **Archer Barracks and its troops**, not the Archer Tower. The ordinary Archer Barracks remains the single-arrow starting building. Its three mutually exclusive attunements each have an unupgraded form and three Knowledge upgrades. Existing placed-building research, undo/respec, snapshots, construction and graphics settings apply.

The user specified the main behaviors. Approved by the user. Values initially marked **proposed** below are the accepted initial tuning.

| Attunement | Before upgrades | Upgrade I | Upgrade II | Upgrade III |
| --- | --- | --- | --- | --- |
| Skirmishers | 1 arrow per attack; existing quick-draw base | 3 arrows; existing tier-I shooting speed | 5 arrows; +30% movement and shooting while moving | 7 arrows; existing tier-III shooting speed |
| Javelin Bowmen (replaces Rangers) | Huge, slow arrow; up to 2 enemies in a straight line, carrying susceptible enemies back 3 city tiles | Up to 3 enemies; knockback 4 tiles | Unlimited enemy penetration; knockback **5 tiles (proposed)**; explosive finish grows with unique enemies pierced | Unlimited penetration; knockback **6 tiles (proposed)**; stronger, larger explosive finish |
| Skyranger | Unlimited battlefield range; arrow rises vertically, fades away, then appears above its target and falls vertically | Arrow rain every 10 ordinary shots: **12 arrows in a 2-tile radius (proposed)** | Every 7 shots: **20 arrows in a 3-tile radius (proposed)** | Every 5 shots: **28 arrows in a 3-tile radius (proposed)**, allocated evenly among live enemies in that area instead of random ground points |

## Behavior and tuning

- Skirmisher multishot distributes arrows among live targets in sight, reusing targets evenly when fewer enemies are available (**proposed**). Arrow counts apply per ordinary attack, not per upgrade purchase. The unattuned Barracks still fires one arrow.
- Javelin Bowmen fire every **3 seconds**, for **6 times an ordinary arrow's damage (proposed)**. The javelin flies straight, not homing around corners. Eligible enemies remain visibly carried along the same shaft; subsequent enemies on that line join the group until the penetration limit is reached. Each is damaged once per javelin. Knockback is distance **after first impact**, not extra distance added for every enemy picked up.
- Here, a tile means a full **8-cell city tile**, rather than a simulation cell. Knockback stops at solid ground obstacles or the board edge; fliers stop at the board edge. The group must not be teleported through walls.
- Bosses, fortresses, boats and unyielding enemies retain existing knockback immunity. Shield-blocked or physically resistant targets do not get carried; a resistant target stops penetration (**proposed resistance mapping**, because the game currently has no separately named Pierce resistance stat). Existing armor/shields retain their normal damage protection. Explosive javelins have no numeric penetration cap, but do not bypass resistance or walls.
- Explosive finish occurs once when the javelin stops/expires/reaches the end of its push. Radius is **1 tile + 0.15 tile per unique enemy pierced at II; 1.5 tiles + 0.2 tile per enemy at III (proposed)**, naturally limited by the battlefield. Blast damage is **1× / 1.5× the javelin's direct damage (proposed)**, never harming friendly troops/buildings.
- Skyranger fires ordinary arrows at the existing archer cadence (**proposed**); rain is additional to its triggering shot. Its range ignores terrain/line-of-sight distance limits. Normal arrows follow a live target on descent; dead targets leave a landing point, without retargeting outside the rain area.
- Rank-I/II rain scatters across the disk, allowing misses. Rank III targets living enemies inside the disk at cast time; a single target receives every rain arrow, and two share them equally. For indivisible counts, allocations differ by at most one. Rain does not count toward the next rain trigger. Existing shield/armor/projectile rules still apply.
- Upward arrows disappear quickly, with a brief invisible interval before descent. Arrows become visible again above their landing point and point down. Reduce Motion keeps gameplay timing while simplifying visual motion; Pixel Art retains the established graphics-setting/fallback contract.

## Research and compatibility

- Placement: Archer Barracks Knowledge tree; three sibling building attunements. Skirmish camp stays; the Ranger lodge becomes the Javelin bow lodge; add a Skyranger lodge.
- Cost: reuse **3 Knowledge per attunement (proposed for Skyranger)** and current path pricing `studyPathCost(4, rankIndex)`: **4 / 4,004 / 16,004 Knowledge**, with existing research durations. Availability follows the existing Archer Barracks unlock, rather than a new wave gate.
- Preserve existing Ranger/Skirmisher building IDs and purchased ranks; existing Ranger purchases become equivalent Javelin Bowmen tiers (**proposed**). No spent Knowledge is lost, undo/respec remain valid, unrelated archer towers/javelineers/snipers are unchanged.
- The existing Sniper lodge crown can use the completed three Archer Barracks attunements, following the repository's three-branch merge convention (**proposed**).

## Planned implementation and verification

Catalog/building registrations; path definitions and player-facing descriptions; per-home battle snapshot lookups; archer targeting/cadence/multishot; dedicated carried-javelin and sky-arrow simulation/presentation; building appearances and graphics fallbacks; save decoding; inspection, upgrade tree/map and Tiles presentation. Add focused tests for exact counts, cadence, resistance, pickup order, once-only damage, obstacles, large timesteps, rain scheduling/distribution and old-save ranks. Run real desktop/mobile tree/battle checks, full tests and production build. Update `docs/DEFEND.md`, `CONTEXT.md`, art inventory, `AGENTS.md` and README.
