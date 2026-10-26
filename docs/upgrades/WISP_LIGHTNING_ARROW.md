# Wisp Tower — Lightning arrow

Implemented from the user's request on 2026-10-24 (America/Denver). This is
the third and final rank of `wispArrow`, following [Fire arrows](WISP_FIRE_ARROWS.md).
Unspecified tuning below is an initial assumption, open to later adjustment.

- **Panel:** each Wisp Tower's Knowledge tree in Defend or Tiles.
- **Name:** Lightning arrow, rank III. No rank IV or further evolution.
- **Cost:** `studyPathCost(4, 2)` = 16,004 Knowledge, following the existing
  third-rank curve. Requires rank II, with no new wave gate; affordability
  follows Library production. Uses ordinary purchase, save, undo and respec.
- **Inventory:** one purple arrow in addition to three blue and two fire
  arrows. Starts full at battle start/rebuilding. Remains occupied throughout
  its flight; one fresh arrow regenerates nine battle seconds after map exit.
  No banked refill time while full. Blue/fire clocks remain independent.
- **Size:** fire arrow core and decorative flame tail are uniformly 125% of
  blue scale. Purple core is 175% of blue scale (assumption), larger than fire.
  Graphic scaling does not enlarge existing fire collision/trail/blast areas.
- **Lock:** pick the nearest living enemy to the purple arrow inside the
  tower's ordinary acquisition range, with stable ID ties (assumption).
  Idle movement is harmless broad flight near the tower.
- **Strike:** capture aim and attack damage, then commit to a straight ray
  from the current position through that aim to the rectangular map boundary.
  Never home, turn, stop on a hit, or retarget after launch, even if the target
  moves or dies. A coincident aim chooses north deterministically.
- **Flight speed:** four times ordinary tower range per second (assumption),
  scaled by shared reload upgrades. These do not change nine-second refills.
- **Trail:** continuous, 1.5-cell-wide suspended purple lightning (assumption).
  Each point persists five battle seconds after deposition and deals **300%
  of captured tower attack per second** to all enemies touching it, including
  ground enemies, fliers and enemies beyond acquisition range. Lightning uses
  the existing physical-element lightning rules, shields and armor. No extra
  direct-hit damage, finite contact budget or final explosion (assumptions).
- **Overlap:** one arrow's segments share one DPS rate per enemy. Independent
  arrows/towers may stack. No friendly damage. Mark/venom and battle damage
  attribution use the ordinary ranged-damage pipeline.
- **Lifecycle:** map exit frees the slot; existing lightning finishes its own
  timer. Tower destruction immediately cancels flight and regeneration, while
  deposited lightning remains until expiry. Effects/inventories are transient;
  only the building's purchased rank persists.
- **Presentation:** a violet arrow, crackling tail and violent, branching
  purple/white bolts anchored within the damage ribbon. Deterministic cosmetic
  jitter consumes no combat RNG. Reduce Motion keeps stable visible bolts and
  idle poses. Existing procedural art and update/render loops; no new assets,
  animation loops or save migration.

`wisp-arrow.ts` owns three inventories. `wisp-lightning.ts` handles the locked
ray and exact exit timing. Shared `wisp-trail.ts` preserves the existing fire
ribbon behavior and integrates timed contact intervals for both elements.
`wisp-core-art.ts` scales the common arrow silhouette, and
`wisp-lightning-art.ts` draws violet cores/tails/ribbons. Inspection text,
rank descriptions, docs and desktop/phone fixtures reflect all three ranks.

Validation covers final-tier gating, save/refund, six-arrow starting capacity,
relative sizes, straight rays in all directions, dead/moved targets, ground
and flying coverage outside tower range, 3× attack DPS, shields/armor,
per-point expiry, late arrivals, independent fixed refills, reload scaling,
source destruction/rebuilding, coarse/fine equivalence, bounded samples and
deterministic Reduce Motion art. Run focused tests, the full suite, browser
checks and the production build before committing.
