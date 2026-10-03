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

**Siege engine**:
An enemy machine with no crew (rolling cannon, ballista, firework launcher, trebuchet, great bombard, dragonfire battery): it drives itself toward the keep and stops to shoot what blocks its way, or the keep, from range.

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

**Time away** (welcome back):
The time since the game was last saved, up to a day. The Library earns Knowledge for all of it; the Mine works through the first two hours tick by tick and is paid for the rest at its **smithy's pace** (the Smithy points an hour it has lately made). The welcome-back screen totals both when the game opens.

**Knowledge**:
Earned by the Library, an hour's worth being its built bookshelves times its librarians (idle too), and paid for each wave held past the best wave; spent on the skill trees. Once called Valor.

**Freak accident** (Library):
A table's candle catching it alight: a small chance each minute, lowered by Fireproof Wood. The fire burns whatever it reaches until it burns out or the librarians put it out (Fire Training).

**Idle fire** (Library):
While the game is closed, each hour the library may burn down: 50% an hour, lowered 5% a rank by Night watch to 5% at least. An hour it stands pays its Knowledge; once it burns down, nothing is left but a new, empty library.

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

**Tile share**:
How much of its tile a structure takes, in sixteenths: 1/16 (archer and watch towers), 1/8, 1/4, 1/2 or a whole tile. What shares a tile must add up to no more than a whole tile, and fit.

**Spot**:
Where on its tile a structure stands, picked at random; every structure on a tile is reshuffled whenever something is dropped there.

**Valkyrie palace**:
A heavenly marble palace inside the city that takes a whole tile (half with Folded halls) and trains valkyries.

**Valkyrie**:
An armoured angel with a spear who hunts enemies through the city and makes charge stabs.

**Charge stab**:
A valkyrie's attack: she blinks along a line toward an enemy, as far as her reach or until a building, the wall or a pond stops her, hurting every enemy on the line; nothing can hurt her for a second after.

**Dark wizard keep**:
A vast keep of obsidian and rubies inside the city that fills a 2 × 2 block of city tiles (one tile with Folded sanctum), with a lightning turret at each corner; it summons the dark wizard.

**Dark wizard**:
The ultimate unit, one to a dark wizard keep: a hooded figure in dark robes who hunts enemies through the city and casts black lightning.

**Black lightning**:
A bolt that strikes an enemy and leaps on to the nearest enemy it hasn't struck within its chain length, up to its chain count, hurting every enemy it strikes.

**Chain length**:
How far black lightning can leap from one enemy to the next.

**Chain count**:
How many enemies one bolt of black lightning can strike.

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

**Temperament** and **habits** (Mine):
What a miner does with itself while it waits: looking about, stretching, sitting down, whistling, yawning, tapping a foot or sifting the ground. Its temperament is the two habits it falls into most, from its name, so each miner idles in its own way. Two miners waiting side by side chat instead.

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
