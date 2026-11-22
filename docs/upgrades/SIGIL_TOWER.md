# Sigil tower: the Wizard tower's fourth branch

Requested by Seth (2026-11-22): a wizard branch with a "wireless" ranged attack. The tower glows and gathers firefly-like specks round its roof as it charges; a pixel-art magic circle draws itself where the targeted enemy was (it doesn't follow the enemy) and, completed, sets off a massive area effect. Upgrades stack the effect: a simple explosion, then an explosion that sets enemies on fire, then a blue-fire explosion that sets them on blue "ice fire" and slows them. It doesn't target air units but its area hits them. Values marked **assumed** were chosen while implementing.

| Step | Name | Effect |
| --- | --- | --- |
| Attune (8 Knowledge, **assumed**, as the Storm tower) | Sigil tower | Charges 3.5 s, then draws a circle (1.4 s) where the nearest ground enemy stood; it bursts for 2.5 × the wizard flame's damage a second on everything within 2 cells, fliers too (**assumed**). |
| I | Kindled sigil | The burst sets enemies burning for 3 s at 25% of the burst a second. |
| II | Greater circle | Radius 2.75 cells (40% wider) and a 2.8 s charge (20% faster) (**assumed**: the middle rank strengthens, so the climax stays at III). |
| III | Ice-fire | The burst turns blue and hits 50% harder; it sets a blue burn (4 s at 30% of the burst a second) in place of the orange one, slowing enemies to half pace. Ice-fire is its own status, so ice doesn't put it out (**assumed**). |

- Path costs: `studyPathCost(5, rank)`, as Stormcalling (**assumed**).
- Range: the wizard flame's range + 1 cell; damage follows the Flamethrower Forge level and tower damage.
- Merge (**assumed**): the Dark wizard keep keeps its three-branch recipe (Pyre, Frost, Storm). The Sigil tower is an extra branch outside it, so the ultimate costs no more than before.
- Art: the wizard roof in deep arcane slate with chalk-violet runes and a standing stone at each corner (procedural placeholder, no baked outlines). The circle is violet at attunement, ember gold at I and II, ice blue at III.
