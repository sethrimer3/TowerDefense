# Archer Tower: fire, sustained focus and a living magic arrow

Status: approved by the user. Details marked **proposed** were accepted as the initial tuning and interpretation.

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

## Wisp Tower: one persistent blue arrow

Attunement alone implements the behavior below. The user's second, third and fourth steps are **reserved for later**: no invented purchasable upgrades, bonuses or costs at those steps.

### Motion and appearance

- One blue, clearly arrow-shaped magic projectile belongs to each tower, continuously floating nearby between attacks. A pale core and multiple blue pixel trails distinguish it from ordinary arrows.
- Idle motion should resemble a jellyfish or an electron cloud: smoothly changing orbital paths, outward drift and a soft pull back toward the tower. Avoid a rigid circular orbit or disconnected random jumps.
- Use tower-centered spring attraction, velocity and damping with a reproducible local wandering signal (**proposed implementation**). The idle orbit stays mostly inside 65% of the tower's normal attack range (**proposed tuning**).
- Give the arrow **six trailing tendrils**, each with a bounded chain of **12 segments** (**proposed starting budget**). They follow with inertia and finite segment lengths. At the start of an attack, extend them smoothly and reduce damping so they sweep behind the accelerating arrow; afterward they contract and settle smoothly.
- Idle tendrils are roughly **1 simulation cell** long, extending toward **3 cells** during a slice (**proposed tuning**). These distances and segment budgets are centralized tuning values.
- Its arrowhead rotates along its movement direction. Keep the tower, arrow and trails on the game's existing pixel lattice, using consistent pixel sizes.

### Slicing attacks

- Uses the ordinary Archer Tower's range `R`, damage `D` and reload bonuses (**proposed baseline**).
- When ready, choose the nearest eligible enemy within `R` as the primary aim (**proposed target choice**). The persistent arrow accelerates through a **wide parabolic sweep** passing through that aim, then flows back into its orbit. A quadratic curved trajectory provides the parabola; collision follows the actual swept curve.
- A slice lasts approximately **0.4 seconds** and has a **1-simulation-cell-wide hit band** (**proposed tuning**). It can hit **every enemy intersecting that band**, once per enemy per slice, for `D`. Ground and flying enemies are eligible, as with ordinary tower arrows.
- A new slice requires both the normal attack cooldown to be ready and the previous slice to finish (**proposed**). The same arrow persists across slices; the tower does not emit accumulating autonomous projectiles.
- Idle orbiting and cosmetic tendrils deal no damage (**proposed**). Only the active arrow's swept slicing path hits enemies. Swept collision prevents frame rate or visual quality from changing who is hit, and the attack remains bounded by the tower's range.
- Use existing ranged-arrow damage and resistance rules (**proposed**). Maintain tower attribution and the existing handling of enemies composed of multiple parts.
- If a target dies after a sweep begins, finish that sweep through its captured aim and hit any other enemies crossing it (**proposed**). If the tower is destroyed, its arrow immediately stops dealing damage and fades; a rebuilt tower receives a fresh arrow.

### Presentation settings

Use current procedural graphics and settings. Reduce Motion holds idle orbit/trail movement still and simplifies decorative trails while retaining the visible attack trajectory and hit readability. Rendering quality may shorten or simplify trails; it cannot change the simulated curve, damage or timing. No PNG sprite collection or sprite-generation guidelines are introduced.

## Costs, availability and compatibility

- Hawk attunement keeps the existing **3 Knowledge** cost. Its three subsequent upgrades keep `studyPathCost(4, index)`: **4 / 4,004 / 16,004 Knowledge**.
- Wisp attunement costs **3 Knowledge**, matching its sibling attunements (**proposed**). Later upgrades have no active nodes or prices until specified.
- The Archer Tower's own existing unlock and Fire attunement prices remain unchanged. Availability follows the current building lineage; no new wave gate is added. Knowledge comes from the Library, so affordability depends on research production rather than a promised wave number.
- Existing Hawk copies retain identity, placement and purchased tier: rank 0 gets the new initial focus; ranks I/II/III get the corresponding new upgrade. Existing Fire copies and purchased ranks retain their current effects.
- Keep normal undo, respec and refund accounting. No unrequested Archer Tower ultimate is introduced, and an attunement with no later upgrades must not satisfy a future merge by accident.
- New combat state is transient and scoped to the tower's battle snapshot. Neither counters nor arrow/trail physics are written into player saves.

## Implementation and checks after approval

Update the existing Hawk tuning and descriptions; register the new Wisp building, attunement, topic, collection/decoder entries and procedural artwork. Adapt building trees to display an attunement-only branch without fake ranks. Add focused tower-attack code for locks/ramps and persistent swept arrows, plus bounded visual trail physics. Update inspection stats, Knowledge descriptions, README, AGENTS.md, CONTEXT.md and docs/DEFEND.md.

Verify current-HP acquisition, stable locks, ties, both resets, every tier's range/cadence/damage, additive +1000% cap, independent towers, in-flight damage capture, source destruction/rebuilding, shared modifiers, save compatibility and undo/refunds. Verify a single persistent Wisp arrow, bounded idle motion, swept multi-hit arcs, once-per-slice hit deduplication, flying enemies, resistance, dead targets, finite trail links, no idle damage and bounded crowd cost. Confirm ordinary and Fire arrows retain their existing behavior. Exercise real desktop/phone tree purchases, both graphics settings and Reduce Motion, then run the full suite and production build before committing.
