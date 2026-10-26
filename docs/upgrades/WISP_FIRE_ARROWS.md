# Wisp Tower — Fire arrows

Status: approved for implementation by the user on 2026-10-24 (America/Denver). Proposed details below are accepted initial tuning. Extends
[Triple arrows](WISP_TRIPLE_ARROWS.md) as the second purchased Wisp Arrow rank.

## Upgrade specification

- **Name:** Fire arrows *(proposed display name)*.
- **Identity:** rank II of the existing `wispArrow` path on `wispTower`.
- **Panel and placement:** the individual Wisp Tower's Knowledge tree in
  Defend, also accessible through Tiles. Requires Triple arrows (rank I).
- **What it does:** adds living fire arrows with flame tails, damaging fiery
  trails during attack passes, and an explosion after ten direct enemy hits.
- **Levels:** one new rank; final rank III is defined in [Lightning arrow](WISP_LIGHTNING_ARROW.md).
- **Cost:** `studyPathCost(4, 1)` = **4,004 Knowledge** *(proposed, following
  the existing second-rank price curve)*. Use the ordinary per-building
  purchase, saved rank, undo, respec and refund mechanisms. Apply the purchased
  rank to the next defense.
- **Availability:** after rank I, with no additional wave gate *(proposed)*.
  Affordability depends on Library Knowledge production.

## Arrow inventories and regeneration

- Interpret "add a fire arrow" as adding a **separate fire-arrow inventory**
  alongside the rank-I blue arrows *(proposed interpretation)*. A rank-II
  tower can therefore hold **three blue arrows plus two fire arrows**, all
  able to fly and attack simultaneously.
- Fire-arrow capacity is **two**. A separate shared fire refill timer
  regenerates **one fire arrow every six battle seconds** while below that
  capacity. Preserve the blue arrows' existing three-second refill timer,
  three-arrow capacity and 30-hit budgets.
- Use the established lifecycle for each inventory: defenses and rebuilt
  towers start full; refills are sequential; losing another arrow preserves
  partial refill progress; reaching capacity resets the timer; time spent
  full does not bank refills *(proposed)*.
- A fire arrow has **ten direct enemy contacts** before disintegrating.
  Existing once-per-enemy-per-pass deduplication remains; hitting the same
  enemy on a later pass consumes another contact *(proposed interpretation
  of "hitting 10 enemies")*. Shielded or resistant direct contacts count;
  misses and dead enemies do not.
- Trail damage and the final explosion **do not consume the direct-contact
  budget** *(proposed)*. Trail tick frequency and group density must not
  accidentally shorten the arrow's ten-contact lifespan.
- At the tenth direct contact, stop that arrow's flight/combat immediately
  and trigger exactly one fiery explosion at the contact position. Its
  capacity slot is immediately free; its remaining cosmetic effects do not
  occupy slots.
- Towers own independent inventories and clocks. Pause and battle speed
  affect the six-second timer normally; shared reload upgrades increase
  flight speed without changing the fixed regeneration interval.

## Fire damage and lingering trails

Let `D` be the normal Archer Tower's damage after shared tower damage bonuses.

| Fire effect | Initial tuning |
| --- | --- |
| Direct contact | **D fire damage** *(proposed)* |
| Damaging trail | **D fire damage per second**, a **one-cell-wide** ribbon that lasts **two seconds** at each point *(proposed)* |
| Final explosion | **2D fire damage** to each enemy within **two cells**, once per explosion *(proposed)* |

- Direct contact, trail and explosion all use the existing **fire damage
  element**, shields, resistances, weaknesses and tower attribution. The
  explosion is fiery damage rather than switching to the generic explosion
  damage element, as requested.
- Keep the Wisp's ground-and-flying target eligibility for direct hits,
  the suspended trail and the explosion *(proposed)*. These effects damage
  enemies, with no friendly damage *(proposed)*.
- Only active attack passes deposit damaging trail segments. Idle flame
  tails are decorative. Record the actual swept flight path so a fast swipe
  leaves an unbroken ribbon and cannot skip targets between frames.
- A trail segment's two-second lifetime begins when the arrow passes that
  point. The trail remains after the arrow moves on or explodes. Already-left
  trails finish their normal lifetime if the source tower is destroyed;
  destruction immediately stops active arrows and regeneration *(proposed)*.
- Overlapping segments from one fire arrow apply at most one trail damage
  rate to an enemy. Separate fire arrows' trails may stack *(proposed)*.
  Each explosion hits each enemy at most once. Direct-hit and blast damage
  can both affect the enemy receiving the tenth direct contact.
- Keep trail storage bounded by lifetime and distance-spaced samples;
  cosmetic particle count and rendering quality cannot affect damage.

## Flight and appearance

- Fire arrows are 25% larger than blue arrows (subsequent user request); their
  existing damage hit areas stay unchanged.
- Fire arrows retain the Wisp's aggressive consecutive passes, normal tower
  range, shared reload scaling and broad minimum turn radius.
- Use a clearly arrow-shaped warm orange/red core and **fiery flames behind
  it instead of tassels**. Give the two fire arrows distinct poses, also
  distinct from the three blue arrows *(proposed)*.
- During an attack, leave a visible fiery ribbon following the swept route.
  On the tenth direct hit, show the arrow disintegrating into a bright fiery
  explosion and embers. Visually distinguish the lasting damaging trail from
  the moving decorative tail.
- Use established procedural art, the current battle update/render loops and
  a registered ranked tower appearance. Reduce Motion restrains tail flicker,
  embers and blast movement while keeping the damaging area readable.

## Build scope and validation

Extend Wisp tuning and add rank II to its existing path. Add the separate
two-arrow fire inventory and six-second refill clock, ten-contact lifetime,
fire-element direct hits, swept lingering trails and one-shot fiery blasts.
Extend procedural arrow/tail/trail/explosion and ranked tower art. Update
inspection text, upgrade descriptions, saved-rank tests, gameplay/art/browser
fixtures, the parent specs, README, CONTEXT.md, AGENTS.md and docs/DEFEND.md.
Only purchased building ranks persist; inventories, clocks and effects remain
transient. Existing blue arrows keep their approved behavior.

Verify capacities and independent timers; full starting inventories; exactly
ten direct contacts and one explosion; trail/explosion damage not spending
contacts; elemental fire behavior, shields and resistances; ground/flying
coverage; direct and explosion overlap; per-arrow trail overlap rules and
expiry; source destruction/rebuilding; pause/speed and coarse/fine stepping;
bounded effects; rank gating, purchase/save/reload and refunds. Check distinct
blue/fire graphics and damaging ribbons on desktop/phone and Reduce Motion.
Run the relevant tests, full suite and production build before committing.

## Authorization and workflow

The user requested implementation of this specification and explicitly permits
future upgrades to be implemented first and revised afterward. Separate advance
spec approval is no longer required by the repository's add-upgrade workflow.
