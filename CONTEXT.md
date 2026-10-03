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

**Mother**:
A black enemy that splits into three broodlings when she dies.

**Broodling**:
A small, quick enemy hatched only from a fallen Mother.

**Best wave**:
The highest wave the player has held.

**Bonuses**:
The multipliers the Smithy and the skill trees lay over a defense (troops, towers, walls, the keep, rebuilding, bombs).

### Progress

**Armory**:
The Defend tab's shop: city elements, bombs, battle speed and the universal upgrades (one level for every building of a type), bought with copper, silver and Gold.

**Gold**:
Paid by kills, by every wave held and by gold the mine digs; spent in the Armory and on hiring miners.

**Copper** and **silver**:
Paid for each wave held (copper) and each boss wave held (silver). Spent, with Gold, in the Armory. (They were once iron and steel bars.)

**Knowledge**:
Earned by the Library, an hour's worth being its built bookshelves times its librarians (idle too), and paid for each wave held past the best wave; spent on the skill trees. Once called Valor.

**Freak accident** (Library):
A table's candle catching it alight: a small chance each minute, lowered by Fireproof Wood. The fire burns whatever it reaches until it burns out or the librarians put it out (Fire Training).

**Upgrade point**:
One for every new best wave held in Defend, shown in the currency bar; banked for what the meta game brings later. (It replaced the Commander level and its experience.)

**Smithy** (the Upgrades tab; Training in code):
Ranks of a few percent each on one row (troop HP, tower damage, Gold found…). A rank costs one Smithy point and is worked by the mine's smiths: one smith takes its whole time, more smiths share it. A smith on a rank stays at the smithy until it's done; taking the last one off cancels the rank and returns its point.

**Smithy point**:
Copper, silver or gold: every hundred bars of a metal the mine's smiths work make a point of it. A row's first ten ranks cost copper, the next fifteen silver, the rest gold.

**Smith**:
A miner put to the smithy. The smiths are the Smithy's hands: how many ranks can be worked at once, and how fast.

**Skill tree**:
Command and Stewardship (for Defend), Mine and Library: ranked skills bought with Knowledge, each needing the skills above it.

### Presentation

**Park life**:
The city's live dressing, never part of the battle: grass swaying and parting around walkers, and on the ponds rain rings, reflections and ducks.

**Wizard tower**:
A structure alternating a flamethrower (a cone of fire) and an ice wave (a fan of shards that chills what it crosses).

**Chill**:
A wizard's ice slowing an enemy for a few seconds.

**Mage Guild**:
A structure inside the city that trains fire mages, as a barracks trains swordsmen.

**Fire mage**:
A red-robed troop who roams the streets and hurls fireballs: each bursts with splash damage that spares your own people and leaves a blaze.

**Blaze**:
Burning ground a fireball leaves, hurting every ground enemy inside it each second until it dies down.

**Ground relief**:
The flagstones' bump map outside the city: lights brighten the stone edges facing them and darken the far ones.

**Torch light**:
A flame's flickering, swaying, occlusion-aware glow: lanterns, braziers, tower fires and hand torches.

### The mine

**Mine**:
The idle side view of the ground under the city, worked by miners whatever tab is open and while the game is closed. Its world comes from a seed.

**Prospect**:
One world the mine works, with only so much ore in it. Once the shaft is at the bottom and the work there is done it is **worked out**, and the player moves the crew, the buildings and the stock to a **new prospect**: fresh ground from a new seed.

**Miner**:
A worker the player hires with Gold and puts to one of three **trades**: the face (digging, shoring, laying track, hanging torches and lamps, building carts, carrying ore up), the forge, or the smithy. A miner at the face wears a yellow hat, a forge hand a grey welder's mask, a smith a brown leather apron. Each miner has a name for life.

**Crew list**:
The miners by name in a box for each trade, opened beside the mine's view: a name dragged to another box changes that miner's trade, and one tapped is followed by the camera. A miner lost stays in the list crossed out under a skull until tapped away or replaced by the next hire.

**Shaft**, **level** and **tunnel**:
The laddered shaft is sunk through the dirt into the stone; at every level a tunnel with track and torches runs out either side.

**Shoring**:
Timber a miner sets into loose dirt beside a hole so it doesn't slide in.

**Spoil**:
Dirt and rubble carried up and tipped onto the heap.

**Cart** and **hoist**:
A level's mine cart takes miners' ore to the shaft, where the hoist lets its bucket down for the load and winds it up to the surface.

**Yard**:
The ground by the shaft house where ore brought up is tipped, until the forge's hands carry it into the forge.

**Copper**, **silver** and **gold ore**:
What the miners dig: copper near the top of the stone, silver lower, gold deepest. Brought up, it waits in the yard, then in heaps and on shelves in the forge.

**Buildings**:
Along the surface: the **shaft house** over the shaft's mouth, with a lantern by its door; the **barracks**, where the crew sleeps in bunks (a bay of six a level) and sits in the **lounge** to eat or wait out a storm; the **warehouse** of supplies; the **forge**; and the **smithy**. A building's front wall fades to show whoever is inside.

**Building level**:
Each building has five, bought with Gold, and grows wider with each: the barracks bunks five more of the crew a level, the forge makes room for two more hands, the smithy for another smith, the shaft house keeps out more rain, and the warehouse holds and brings in more supplies. No other building rises more than one level past the warehouse.

**Rebuild**:
An upgraded building is rebuilt, and so is any it pushes along: taken down where it stood, then raised in its new place, inside scaffolding. It is shut while the work goes on, and the work uses supplies.

**Supplies**:
Timber, rails and lights the warehouse brings in over time, up to what it holds. A miner fetches them before fitting out the workings or shoring them, and rebuilds use them too; with none, the shaft can't be sunk further.

**Forge** and **smithy**:
Forge hands smelt the ore piles into copper, silver and gold bars (four copper ore, two silver or one gold to a bar); smiths work the bars, and every hundred of a metal make a Smithy point of it. Too few at the forge leaves a backlog of ore; too few smiths leaves bars waiting. A trade nobody is put to still gets done, slowly.

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
