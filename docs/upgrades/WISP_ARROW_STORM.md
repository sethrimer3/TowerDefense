# Wisp Tower — Arrow storm and Deep quiver

Status: requested by the user on 2026-11-04, replacing the living blue arrow
and Triple arrows. Extends [Archer Tower attunements](ARCHER_TOWER_ATTUNEMENTS.md).

## The Wisp tower

- On attuning, the Wisp tower stores one ordinary archer-tower arrow every
  second, up to **30**. It starts each battle (and each rebuild) empty and
  never banks time while full.
- Stored arrows circle the tower as if pulled toward its middle, like
  electrons round an atom, each on its own wandering, never-elliptical path.
  Some circle one way, some the other.
- The moment a targetable enemy is in range, the tower looses **every**
  stored arrow at once in a **30-degree** spray centred on the nearest enemy.
  Each arrow flies straight from where it was circling, 1.25 times the
  tower's range, striking the first enemy in its path for the archer tower's
  damage.
- Storing is sped by the Forge's archer rate levels and the tower reload
  bonus; damage and range use the archer tower's.

## Rank I: Deep quiver

- **Identity:** first rank (I) of the existing `wispArrow` path; the
  `wispTower` building and attunement IDs are kept.
- **What it does:** stores an arrow every half second instead of every
  second, up to 45 instead of 30, loosed in the same spray.
- **Cost:** `studyPathCost(4, 0)` = **4 Knowledge**, unchanged from Triple
  arrows, so saved ranks keep their price and refunds.

Ranks II ([Fire arrows](WISP_FIRE_ARROWS.md)) and III
([Lightning arrow](WISP_LIGHTNING_ARROW.md)) are unchanged and add their
living arrows alongside the quiver.

## Tuning

`WISP_STORM` in `src/knowledge-paths.ts`: `every`, `capacity`, `spread`
(degrees), `reach` (share of range), and the orbit's `orbit` (ring radius,
cells), `band`, `speed`, `pull`, `keep`, `spin`, `wander` and `step`.
