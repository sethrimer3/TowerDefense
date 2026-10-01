# Tower Defense

The domain glossary: the words the game, its code and its docs use. Terms only, no implementation.

## Language

### The board

**Tile**:
The unit the player builds with: the board is 9 × 13 of them. The top row is the spawn lane.

**Cell**:
The unit the city, the walls, pathfinding and the battle work in: each tile is 7 × 7 cells.

**Layout**:
The player's design: the keep's tile, the city tiles and the placed structures. Saved; the city is regenerated from it.

**City**:
The procedural town generated from the layout and the save's seed: wall, streets, houses, parks and ponds around the structures.

**Park**:
A small block of grass the city leaves unbuilt; larger ones hold a pond, many have trees and a fence.

**Structure**:
A placed building with a job: the keep, barracks, archer barracks, archer, cannon and watch towers.

### A defense

**Defense** (or run):
One battle from the layout, wave after wave until the keep falls or the player abandons it. Never saved.

**Wave**:
One group of enemies. Every 10th is a boss wave, fought at night, with warlords.

**Best wave**:
The highest wave the player has held.

**Bonuses**:
The multipliers Training and the skill trees lay over a defense (troops, towers, walls, the keep, rebuilding, bombs).

### Progress

**Armory**:
The Defend tab's shop: city elements, bombs, battle speed and the universal upgrades (one level for every building of a type), bought with Gold, iron bars and steel bars.

**Gold**:
Paid by kills and by every wave held; spent in the Armory.

**Iron bar** and **steel bar**:
Paid for each wave held (iron) and each boss wave held (steel); spent in the Armory.

**Valor**:
Paid for each wave held past the best wave; spent on the skill trees.

**Experience** and **Commander level**:
Kills pay experience; enough lifetime experience raises the Commander level.

**Training point**:
One per Commander level, spent on Training ranks.

**Training**:
Ranks of a few percent each on one row (troop HP, tower damage, Gold found…). A rank takes time on the wall clock; a few can be in training at once (Training slots).

**Skill tree**:
Command and Stewardship: ranked skills bought with Valor, each needing the skills above it.

### Presentation

**Park life**:
The city's live dressing, never part of the battle: grass swaying and parting around walkers, and on the ponds drips, rain rings, splashes and reflections.

**Torch light**:
A flame's flickering, swaying, occlusion-aware glow: lanterns, braziers, tower fires and hand torches.
