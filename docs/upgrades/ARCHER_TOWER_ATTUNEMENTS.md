# Archer Tower: fire, sustained focus and a living magic arrow

Status: approved by the user. Details marked **proposed** were accepted as the initial tuning and interpretation. Wisp motion and tassels were revised at the user’s request on 2026-10-24.

## Scope and progression

- These are the **Archer Tower building's** attunements, separate from Archer Barracks troops.
- Keep the ordinary Archer Tower and the entire Brazier Tower / Fire arrows path as they are.
- Replace the Hawk Tower / Sharpshooters behavior with sustained focus on a strong enemy. Keep its saved `hawkTower` / `sharpshooters` IDs and existing purchased ranks.
- Add a third sibling attunement, **Wisp Tower**, carrying a **Wisp Arrow** (`wispTower` / `wispArrow`; names and IDs **proposed**).
- The user's four steps mean **initial attunement plus three subsequent upgrades**, matching the building trees' existing rank-0/I/II/III convention. Attunement immediately changes behavior.
- Panel: each individual Archer Tower's Knowledge tree in Defend, also reached through Tiles. Different towers can take different attunements. Purchases use existing per-building progression and apply to the next defense.

## Hawk Tower: sustained focus

Let `R`, `D` and `F` denote an ordinary Archer Tower's range, arrow damage and shots per second after the applicable shared upgrades. The old Hawk range additions, every-third-shot critical and final +60% damage are replaced by these effects.

| User's step | Tree step | Name | Result |
| --- | --- | --- | --- |
| 1 | Attune | Hawk Tower | Acquires the enemy with the most current HP within range. Range is `0.7 × R` (30% shorter). |
| 2 | Upgrade I | Relentless aim (**proposed name**) | Fires at `0.5 × F`. Each further shot at the same enemy adds 2 percentage points of ordinary arrow damage, capped at +1000%. |
| 3 | Upgrade II | Far horizon (**proposed name**) | Range becomes `4.3 × R`: +330% relative to an ordinary Archer Tower, replacing the earlier penalty (**proposed interpretation**). Keeps the damage ramp and half-rate base. |
| 4 | Upgrade III | Gathering storm (**proposed name**) | Consecutive shots also increase a fire-rate multiplier from 1× through 10×, one multiplier step per further shot (**proposed interpretation**). Changing enemies resets this multiplier and the damage bonus. |

### Target lock and damage sequence

- Measure strongest by **current HP**, as requested. When several enemies tie, prefer the nearer, then stable enemy ID (**proposed tie-break**).
- Acquire the strongest enemy when a lock is needed, then keep shooting it while it is alive and in range (**proposed**). Continuously re-ranking current HP after each hit would otherwise break the requested sustained-target ramps as the victim loses health.
- If the lock becomes invalid, acquire the strongest eligible enemy again. Starting a new lock resets damage and speed (**proposed reset boundary**). No shooting or counter growth without a valid target.
- Count shots **fired at that enemy**, rather than impacts. Capture the shot's damage when firing, so later targeting changes cannot alter arrows already flying (**proposed**).
- At Upgrade I and above, the first shot at a fresh lock deals `D`. Shot `n` deals `D × (1 + min(10, 0.02 × (n - 1)))`: 100%, 102%, 104%, …, up to **1100% total damage (11×)**. There is no compounding. Shot 501 first reaches the cap.
- At Upgrade III, shot `n` uses `min(10, n)` times the half-rate cadence: 1×, 2×, …, 10×. This means a maximum of **5× an ordinary Archer Tower's fire rate**, because Upgrade I's half-rate penalty still applies (**proposed stacking**). The interval after each shot uses the next shot's multiplier; a new lock starts at the half-rate cadence again.
- Each tower owns its own lock and counters. A fresh battle or destroyed/rebuilt tower starts fresh (**proposed**). Other towers, Fire arrows and Archer Barracks cannot add to these counters.
- Existing ranged-arrow damage, shield and resistance rules apply. Shared damage/reload/range bonuses are incorporated before these attunement multipliers.

## Wisp Tower: living blue arrows

Attunement implements the flight below with capacity one. The first subsequent rank, **Triple arrows**, raises capacity to three for **4 Knowledge**. Each arrow has **30 hits**, then dissipates into blue sparks; the tower regenerates one arrow every **3 battle seconds** while below capacity. All arrows can attack simultaneously, and each defense/rebuilt tower starts full. Fire arrows (rank II, 4,004 Knowledge) adds two independent flaming arrows with a six-second refill clock, ten direct contacts, damaging two-second trails and a fiery final explosion. Final rank III adds a larger purple Lightning arrow with one slot and a nine-second refill after exiting the map. Its committed straight ray leaves five-second lightning at 300% attack per second. Fire arrows are 25% larger than blue arrows. See [Triple arrows](WISP_TRIPLE_ARROWS.md), [Fire arrows](WISP_FIRE_ARROWS.md) and [Lightning arrow](WISP_LIGHTNING_ARROW.md).

### Motion and appearance

- One blue, clearly arrow-shaped magic projectile belongs to each tower, continuously floating nearby between attacks. A pale core and multiple blue pixel trails distinguish it from ordinary arrows.
- Idle motion should resemble a jellyfish or an electron cloud: smoothly changing orbital paths, outward drift and a soft pull back toward the tower. Avoid a rigid circular orbit or disconnected random jumps.
- Idle wandering follows smooth tangent arcs toward a reproducible local wandering aim, usually inside 65% of normal attack range. Returning from an outer attack may use the full range before settling inward.
- Give the arrow **six quiet trailing tassels**, each a bounded **12-point** ribbon following recorded flight positions. Keep lateral separation narrow and free motion to a subpixel ripple; fading tips leave a shadow-like trace of the arrow's actual route.
- Idle tassels are roughly **1 simulation cell** long, extending toward **3 cells** during attacks. Hold that extension for **one simulation second after the final pass**, then shorten gradually (1.5-second exponential decay time). Repeated attacks refresh the hold. These values are centralized tuning.
- Its arrowhead rotates along its movement direction. Keep the tower, arrow and trails on the game's existing pixel lattice, using consistent pixel sizes.

### Slicing attacks

- Uses the ordinary Archer Tower's range `R` and damage `D`. Shared reload bonuses increase attack flight speed.
- Immediately acquire an eligible enemy and chain another pass when the current pass finishes, without an idle reload gap. Prefer a different live aim on the next pass when one is available, then the nearest to the arrow, with stable enemy-ID ties.
- Fly through captured aims along tangent circle/straight/circle routes, always preserving the previous heading. **Minimum turn radius is `0.24 × R`**, including between attacks and idle flight. Reject out-of-range routes instead of clipping the curve; there are no sharp snaps or reversing micro-slices.
- Base attack speed is **`2.5 × R` cells per second**, scaled inversely by the ordinary tower's researched reload factor; idle speed is **`0.4 × R`**. Pass duration follows its actual route length. The **one-cell hit band** damages every intersecting ground or flying enemy once per enemy per pass for `D`.
- Each arrow persists across passes until its 30-hit budget is spent. Idle flight and cosmetic tassels deal no damage. Fixed distance-spaced samples drive swept collisions and bounded flight history, independently of drawing frequency and quality.
- Use existing ranged-arrow damage and resistance rules (**proposed**). Maintain tower attribution and the existing handling of enemies composed of multiple parts.
- If a target dies after a sweep begins, finish that sweep through its captured aim and hit any other enemies crossing it (**proposed**). If the tower is destroyed, its arrow immediately stops dealing damage and fades; a rebuilt tower receives its full fresh inventory.

### Presentation settings

Use current procedural graphics and settings. Reduce Motion freezes idle wandering and removes the tassel ripple, retaining the attack trajectory, hit readability and post-attack length hold/shortening. Rendering quality may shorten or simplify trails; it cannot change the simulated curve, damage or timing. No PNG sprite collection or sprite-generation guidelines are introduced.

## Costs, availability and compatibility

- Hawk attunement keeps the existing **3 Knowledge** cost. Its three subsequent upgrades keep `studyPathCost(4, index)`: **4 / 4,004 / 16,004 Knowledge**.
- Wisp attunement costs **3 Knowledge**, matching its sibling attunements (**proposed**). Triple arrows costs **4 Knowledge**; Fire arrows costs **4,004 Knowledge**. The final Lightning arrow costs **16,004 Knowledge**; see [Lightning arrow](WISP_LIGHTNING_ARROW.md).
- The Archer Tower's own existing unlock and Fire attunement prices remain unchanged. Availability follows the current building lineage; no new wave gate is added. Knowledge comes from the Library, so affordability depends on research production rather than a promised wave number.
- Existing Hawk copies retain identity, placement and purchased tier: rank 0 gets the new initial focus; ranks I/II/III get the corresponding new upgrade. Existing Fire copies and purchased ranks retain their current effects.
- Keep normal undo, respec and refund accounting. No unrequested Archer Tower ultimate is introduced, and an attunement with no later upgrades must not satisfy a future merge by accident.
- New combat state is transient and scoped to the tower's battle snapshot. Neither counters nor arrow/trail physics are written into player saves.

## Implementation and checks

Update the existing Hawk tuning and descriptions; register the new Wisp building, attunement, topic, collection/decoder entries and procedural artwork. Display Triple arrows, Fire arrows and the final Lightning arrow. Add focused tower-attack code for locks/ramps and persistent swept arrows, plus bounded visual trail physics. Update inspection stats, Knowledge descriptions, README, AGENTS.md, CONTEXT.md and docs/DEFEND.md.

Verify current-HP acquisition, stable locks, ties, both resets, every tier's range/cadence/damage, additive +1000% cap, independent towers, in-flight damage capture, source destruction/rebuilding, shared modifiers, save compatibility and undo/refunds. Verify one/three blue Wisp arrows, the added two-fire-arrow inventory, independent 30/10-contact budgets, sequential three/six-second refills, blue sparks/fire blasts, timed ribbons and elemental fire damage, bounded idle motion, swept multi-hit arcs, once-per-slice hit deduplication, flying enemies, resistance, dead targets, finite trail links, no idle damage and bounded crowd cost. Confirm ordinary and Fire arrows retain their existing behavior. Exercise real desktop/phone tree purchases, both graphics settings and Reduce Motion, then run the full suite and production build before committing.
