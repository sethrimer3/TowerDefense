# Cannon Tower: three behavior-changing attunements

Status: approved by the user. Values marked **proposed** below were accepted as the initial tuning.

Scope: Cannon Tower building Knowledge trees. The ordinary Cannon Tower retains its current explosive shells. Its three mutually exclusive attunements change what its shots do immediately, before buying any path ranks. Each then has three Knowledge upgrades.

The user specified grapeshot on attuning, a 15% reload reduction at its first upgrade, burning mortar impacts, and the Minelayer's random firing, half range, aiming gesture, 15/30/50 capacity and walking Smart charges. Other choices below are **proposed**.

## Gun Battery (`batteryTower`, existing `gunnery` path)

| Step | Name | Effect |
| --- | --- | --- |
| Attune | Gun Battery | Every shell explodes normally and creates four smaller explosions around its landing point. No initial reload bonus. |
| I | Drilled crews | Reload time is 15% shorter than an ordinary Cannon Tower. |
| II | Powder crews | Reload time is 25% shorter than an ordinary Cannon Tower (**proposed**, replacing the now-redundant Grapeshot unlock). |
| III | Master gunners | Reload time is 50% shorter than an ordinary Cannon Tower. |

Grapeshot is retained at every rank. Keep the current four surrounding explosions: each has 35% of the main shell's damage and 50% of its radius (**proposed reuse of existing tuning**). Reload reductions replace one another, rather than multiplying. Existing cannon damage, range, flight, ground targeting and friendly-fire rules apply.

## Mortar Tower (`mortarTower`, existing `siegeShot` path)

| Step | Name | Effect |
| --- | --- | --- |
| Attune | Mortar Tower | Shells leave a burning spot covering their blast area for **4 seconds (proposed)**. Ordinary impact damage; burn damage per second is **25% of ordinary shell damage (proposed)**. Retain a 25% longer reload (**proposed**). |
| I | Incendiary shot | Impact damage and burning damage both increase by 80% relative to the unupgraded mortar. Reload time becomes 50% longer than the ordinary cannon (**proposed retention of the existing tier-I tradeoff**). |
| II | Powder charge | Explosion radius and burning-ground radius both increase by 50%. Retains tier-I impact and burn damage. |
| III | Earthshaker | Impact damage and burning damage both become 3 times the unupgraded mortar's values. Retains enlarged burning ground; range increases by 3 simulation cells. |

Let D be an ordinary shell's damage including its cannon Forge/Training bonuses. Across attuned / I / II / III, impact damage is D / 1.8D / 1.8D / 3D, and burn DPS is 0.25D / 0.45D / 0.45D / 0.75D (**proposed**). All burns last 4 seconds. Descriptions explicitly say that damage improvements affect both impact and burning ground.

Use the existing Blaze system and its ground-fire artwork, fire resistance, water extinguishing and ice/rime interactions. Burning ground damages ground enemies only and follows the existing enemy-only ground-fire rule; the shell's impact retains cannon friendly fire unless cannon safety is researched (**proposed**). Separate impacts may overlap and deal damage independently, matching current burning ground (**proposed**). Mortar burns must not inherit unrelated Mage Guild research.

## Minelayer (`minelayerTower`, new `minelaying` path)

| Step | Name | Effect |
| --- | --- | --- |
| Attune | Minelayer | Fires mine-carrying shells at random ground positions throughout its range, even without enemies. Range is 50% of ordinary cannon range: **5.5 simulation cells**. At most **15 mines** per tower. |
| I | Directed laying | Unlocks selecting the tower and dragging from it to place an aiming crosshair. Mines land in that local area. Dragging back onto the tower restores random coverage of its full range. Capacity remains **15**. |
| II | Expanded magazine | Increases capacity to **30 mines**. Retains directed laying. |
| III | Smart charges | Increases capacity to **50 mines**. Mines detect enemies farther away and slowly walk toward them until close enough to detonate. |

### Laying, capacity and detonation

- Fire at the ordinary cannon cadence, modified by existing cannon reload bonuses; no enemy is required (**proposed**). A shell places one mine on landing and causes no impact damage (**proposed**).
- Scatter uniformly by area within the range disk; use the gameplay's deterministic random stream. No cannon minimum firing distance (**proposed**).
- Each tower's limit includes active mines and shells in flight, reserving a slot when fired. At capacity, wait for a slot rather than replacing existing mines (**proposed**).
- Only place mines on valid open, dry ground, including streets; avoid solid structures, impassable terrain and water. If no valid landing exists, wait and retry without consuming a slot (**proposed**).
- Mines arm **0.5 seconds** after landing. A ground enemy within **0.75 simulation cells** triggers a single explosion; aerial enemies do not trigger them (**proposed**).
- Explosion damage and radius equal an ordinary cannon shell with its current damage bonuses (**proposed**). Retain cannon safety/friendly-fire behavior; friendly troops do not trigger mines (**proposed**).
- Mines remain until detonated or the battle ends; there is no additional lifetime or ammo cost (**proposed**). A destroyed tower stops laying, but already-laid mines remain and keep their original owner for the cap (**proposed**).
- Smart charges acquire the nearest living ground enemy within **3 simulation cells** and walk at **0.5 cells per second**, retaining the 0.75-cell trigger distance (**proposed**). They stop if there is no nearby target, retarget after death, respect obstacles, avoid water and stay within their owner's laying range (**proposed**). Small procedural feet communicate walking; Reduce Motion simplifies the feet without changing movement or gameplay.

### Selection and directing

- Battle: tapping a Minelayer selects it and reveals its crosshair and range. From rank I, dragging from the tower moves the aiming crosshair, with live preview. Release commits; pointer cancellation restores the previous target (**proposed**).
- Directed mode scatters mines within a **1-cell-radius disk** around the crosshair, clipped to the tower's range and valid ground (**proposed**). Existing mines stay where they are; the crosshair controls future shots.
- Dragging onto the tower's footprint clears directed mode. The crosshair expands to the perimeter of the entire laying range, clearly indicating random mode, as requested. Reduce Motion switches directly to that display.
- Crosshairs appear only while that tower is selected, including a full-range crosshair for random mode. A rank-0 tower shows its coverage but cannot direct it (**proposed**).
- Preserve build-mode building dragging and long-press upgrade access. The new tower-origin aiming gesture operates during battle; no aiming gesture should relocate a building. Empty-space drags still pan, two fingers still pinch-zoom, and the war banner remains draggable. Selecting another tower or tapping empty space clears selection (**proposed**).
- Aiming is per tower and battle-local, resets to random at the next battle, and does not add persistent target coordinates to saves (**proposed**).

## Knowledge, progression and compatibility

- Panel: individual Cannon Tower Knowledge tree, reached through Watch Tower → Cannon Tower. Gun Battery, Mortar Tower and Minelayer are sibling attunements. Each has three sequential ranks.
- Cost: retain **4 Knowledge** for the two existing attunements; also charge **4 Knowledge for Minelayer (proposed)**. Each path uses the current `studyPathCost(4, rankIndex)`: **4 / 4,004 / 16,004 Knowledge**. Retain existing research/work and unlock rules; no new wave gate (**proposed**).
- Keep saved `batteryTower`/`gunnery` and `mortarTower`/`siegeShot` IDs and owned ranks. Existing ranks receive the redesigned effect at the same tier, with existing undo/respec and refund accounting (**proposed**).
- C4 Nanobots remains the ultimate. Require one maximally upgraded building from each of the three branches for future merges, following the existing three-branch convention (**proposed**). Existing owned C4 Nanobots remain owned.
- Procedural building, shell, mine and effect graphics fit the existing simulation grid. No replacement PNG sprite system or sprite-generation guidelines are reintroduced.

## Build and verification after approval

Add the Minelayer to building/catalog/save decoding, topics, Knowledge trees, collection/palette and procedural artwork. Centralize all tuning beside the existing path tables; read per-building battle snapshots, never the live save during combat. Extend cannon shells for mortar burns and mine placement; add bounded per-owner mine state and spatial proximity checks. Add battle selection/aiming and its overlay to pointer/render integration without a separate animation loop.

Verify grapeshot at rank 0 and all reload tiers; mortar impact/DPS scaling, radius, fire/ice/water interactions and independence from mage upgrades; target-free laying, random disk bounds, valid ground, cap reservation including in-flight shells, arming, detonation, friendly fire, walking collisions/retargeting and cleanup. Verify save compatibility, third-branch purchases and C4 merging/undo. Exercise mouse/touch selection, dragging, reset, cancellation, panning, pinch zoom and banner controls in browser tests. Run relevant Defend tests, then the full test suite and production build. Update README, AGENTS.md, CONTEXT.md and docs/DEFEND.md to match the implementation.
