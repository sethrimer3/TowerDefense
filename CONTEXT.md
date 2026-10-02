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
Paid by kills, by every wave held and by gold the mine digs; spent in the Armory and on hiring miners.

**Iron bar** and **steel bar**:
Paid for each wave held (iron) and each boss wave held (steel); iron bars are also smelted from the mine's iron ore. Spent in the Armory.

**Knowledge**:
Earned by the Library, an hour's worth being its built bookshelves times its librarians (idle too), and paid for each wave held past the best wave; spent on the skill trees. Once called Valor.

**Freak accident** (Library):
A table's candle catching it alight: a small chance each minute, lowered by Fireproof Wood. The fire burns whatever it reaches until it burns out or the librarians put it out (Fire Training).

**Experience** and **Commander level**:
Kills pay experience; enough lifetime experience raises the Commander level.

**Training point**:
One per Commander level, spent on Training ranks.

**Training**:
Ranks of a few percent each on one row (troop HP, tower damage, Gold found…). A rank takes time on the wall clock; a few can be in training at once (Training slots).

**Skill tree**:
Command and Stewardship (for Defend), Mine and Library: ranked skills bought with Knowledge, each needing the skills above it.

### Presentation

**Park life**:
The city's live dressing, never part of the battle: grass swaying and parting around walkers, and on the ponds rain rings, reflections and ducks.

**Wizard tower**:
A structure alternating a flamethrower (a cone of fire) and an ice wave (a fan of shards that chills what it crosses).

**Chill**:
A wizard's ice slowing an enemy for a few seconds.

**Ground relief**:
The flagstones' bump map outside the city: lights brighten the stone edges facing them and darken the far ones.

**Torch light**:
A flame's flickering, swaying, occlusion-aware glow: lanterns, braziers, tower fires and hand torches.

### The mine

**Mine**:
The idle side view of the ground under the city, worked by miners whatever tab is open and while the game is closed. Its world comes from a seed.

**Miner**:
A worker the player hires with Gold and puts to one of three **trades**: the face (digging, shoring, laying track, hanging torches and lamps, building carts, carrying ore up), the forge, or the smithy. A miner at the face wears a yellow hat, a forge hand a grey welder's mask, a smith a brown leather apron.

**Shaft**, **level** and **tunnel**:
The laddered shaft is sunk through the dirt into the stone; at every level a tunnel with track and torches runs out either side.

**Shoring**:
Timber a miner sets into loose dirt beside a hole so it doesn't slide in.

**Spoil**:
Dirt and rubble carried up and tipped onto the heap.

**Cart** and **hoist**:
A level's mine cart takes miners' ore to the shaft, where the hoist's bucket lifts it to the surface.

**Iron ore** and **gold**:
What the miners dig. Brought up, it waits in piles at the forge.

**Buildings**:
Along the surface: the **shaft house** over the shaft's mouth, with a lantern by its door; the **barracks**, where the crew sleeps in bunks (a bay of six for every six of the crew) and sits in the **lounge** to eat or wait out a storm; the **warehouse** of supplies; the **forge**; and the **smithy**. A building's front wall fades to show whoever is inside.

**Supplies**:
Timber, rails and lights a miner fetches from the warehouse before fitting out the workings or shoring them.

**Forge** and **smithy**:
Forge hands smelt the ore piles into bars (twelve iron ore to an iron bar, a gold ore to an ingot); smiths work the bars into what the mine pays: iron bars, now and then a steel bar, and Gold struck from the ingots. Too few at the forge leaves a backlog of ore; too few smiths leaves bars waiting. A trade nobody is put to still gets done, slowly.

**Night shift**:
The share of the crew who work through the night (a fifth, more with Coffee); the rest sleep in the barracks.

**Waterproofing**:
How much of the rain running off the ground the shaft house keeps out of the shaft.

**Weather**:
The mine's sky: clear, cloudy, rain or storm, in spells that turn with its days and nights. Storms bring lightning, which the buildings' roofs take; miners at the surface sit a storm out in the lounge.

**Flood** and **bailing**:
Rainwater that runs down the shaft and fills the workings; miners bail it out with buckets.

**Gravel** and **loose dirt**:
Ground that slides at the slightest drop and can bury the shaft, crushing ladders and timber.

**Lava**:
Molten rock in pools deep down. It creeps, burns miners and wood, and turns to stone where water meets it.

**Lost miner** and **grave**:
A miner killed by a fall of ground, drowning, starvation, lava, fire or lightning. Losses are rare and spaced out, the last miner always survives, and each lost miner gets a grave beyond the smithy.

### The library

**Library**:
A dark cathedral nave the player fills with bookshelves and librarians. It gives nothing yet.

**Bookshelf**:
A unit of two rows of books; units stack bay by bay up the nave to just under the stained-glass window.

**Librarian**:
A scholar the player hires with Gold. Librarians put up ladders and shuffle books between shelves; some sit at the tables indexing.
