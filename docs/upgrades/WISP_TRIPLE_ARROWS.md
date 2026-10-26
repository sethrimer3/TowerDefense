# Wisp Tower — Triple arrows

Status: approved by the user on 2026-10-24. Proposed details below were accepted. Extends the Wisp Arrow behavior in
[Archer Tower attunements](ARCHER_TOWER_ATTUNEMENTS.md).

## Upgrade specification

- **Name:** Triple arrows.
- **Identity:** first rank (I) of the existing `wispArrow` path; keep the
  `wispTower` building and attunement IDs.
- **Panel:** the individual Wisp Tower's Knowledge tree in Defend, also
  accessible through Tiles. Requires the Wisp attunement.
- **What it does:** the tower can hold up to three living blue arrows. Each
  arrow delivers 30 hits, then dissolves into a shower of blue sparks. While
  below capacity, the tower regenerates one arrow every three battle seconds.
- **Levels:** one new rank in this specification. Rank II is subsequently defined in [Fire arrows](WISP_FIRE_ARROWS.md); final rank III is defined in [Lightning arrow](WISP_LIGHTNING_ARROW.md).
- **Cost:** `studyPathCost(4, 0)` = **4 Knowledge** *(proposed, matching the
  first rank of the sibling Archer Tower attunements)*. Existing attunement
  cost remains 3 Knowledge. Use ordinary per-building purchase, save, undo,
  respec and refund behavior; the purchased rank applies to the next defense.
- **Availability:** immediately after attunement, with no additional wave
  gate *(proposed)*. Affordability follows Library Knowledge production,
  rather than a specific wave.

## Arrow lifecycle and capacity

- **Base versus upgraded tower:** interpret "this first upgrade simply makes
  it so that the tower can store up to three" as a capacity-only upgrade.
  Therefore the initial attunement has capacity **one**, with the same
  **30-hit life and three-second regeneration**; rank I raises capacity to
  **three** *(proposed interpretation; changes the formerly unlimited base
  arrow's lifecycle)*.
- Each tower starts a defense, or finishes rebuilding, at full capacity
  *(proposed)*. All its arrows can attack simultaneously; capacity includes
  arrows currently flying and attacking, rather than a separate ammunition
  queue *(proposed interpretation of storing living arrows)*.
- Each arrow owns its own remaining-hit counter. A resolved enemy contact
  uses **one hit**; passing through a group can spend many hits quickly.
  Existing once-per-enemy-per-pass deduplication remains. The same enemy can
  be hit again on a later pass. Ground and flying enemies count equally.
- Shielded or damage-resistant contacts still spend a hit, using existing
  ranged damage rules *(proposed)*. Misses, idle flight, dead enemies and
  out-of-range enemies spend none. Preserve ordinary per-hit damage and tower
  attribution.
- At exactly the 30th hit, stop that arrow's combat immediately, including
  further contacts in the current sweep. Dissipating artwork cannot deal
  damage or occupy a capacity slot.
- One shared refill timer runs per tower while active-arrow count is below
  capacity. Every **3.0 battle seconds**, generate **one** fresh 30-hit arrow
  until full. Losing additional arrows does not restart that timer, and
  replacements are sequential rather than three parallel timers *(proposed)*.
- Time at maximum capacity does not bank refills. Reset refill progress on
  reaching capacity; the next missing arrow starts a fresh three-second wait
  *(proposed)*. Refill also works between enemy groups while the defense is
  running. Battle pause/speed settings affect it normally; shared reload
  upgrades continue to affect flight speed, without changing this fixed timer.
- Each tower owns independent arrows and refill progress. Source destruction
  immediately ends their damage and refilling. Runtime hit counters, arrows,
  sparks and timers are transient and are not written into player saves.

## Flight and appearance

- Keep the existing aggressive consecutive slices, broad minimum turn radius,
  quiet path-following tassels, one-second post-attack length hold and gradual
  shortening. Give the three arrows distinct starting positions/phases so
  they remain visible instead of overlapping *(proposed)*.
- On exhaustion, emit a short, bounded shower of blue/cyan pixel sparks at the
  arrow's final contact. Sparks are cosmetic and fade in about half a second
  *(proposed tuning)*. Reduce Motion uses a brief restrained blue flash.
- Use existing procedural drawing and the current battle update/render loops.

## Build scope and validation

Extend Wisp tuning and its first Knowledge rank; adapt tower-owned transient
state to multiple arrows, individual hit budgets, shared refill timing and
exhaustion effects. Update inspection text, the upgrade tree/icon, saved-rank
coverage, the combat/gallery fixture, README, CONTEXT.md, AGENTS.md,
docs/DEFEND.md and the parent Archer Tower specification.

Verify base/rank-I capacity, simultaneous attacks, exactly 30 contacts per
arrow, dense-group exhaustion, later-pass repeat hits, shields, dead targets,
independent towers, sequential three-second refills, full-capacity timer reset,
pause/speed behavior, source destruction/rebuilding, coarse/fine stepping,
bounded spark/history state, preserved turning/tassel behavior, saved ranks,
purchase/undo/refunds and unavailable future ranks. Check desktop/phone art,
graphics settings and Reduce Motion, then run the suite and production build.

## Approval

The user approved this specification with “Proceed.” The capacity-only
interpretation, full starting capacity, first-rank price and other proposed
choices above are accepted behavior.
