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

**Outlying district**:
A group of city tiles standing apart from the keep's, walled and streeted on its own. Allowed by the Study's Outlying districts skill.

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

**Walking fortress**:
An enemy castle on legs (Walking Watchpost, Walking Outpost, Walking Fortlet, Walking Stronghold, Walking Bastion, Living Fortress, Walking Citadel, Dread Colossus). Its turrets, legs and armor are separately destructible; lost legs slow it, and destroying all armor exposes its core.

**Siege engine**:
An enemy machine with no crew (rolling cannon, ballista, firework launcher, trebuchet, great bombard, dragonfire battery): it drives itself toward the keep and stops to shoot what blocks its way, or the keep, from range.

**Magic boat**:
An enemy ship (Runed Dinghy, Charmbound Sailboat, Mystic Cutter, Arcane Cog, Enchanted Skiff, Spellbound Sloop, Arcane Galleon, Deluge Ark) that sails straight through the ground toward the keep in a pool of conjured water, which dries up in a trail behind it.

**Flood**:
A magic boat's water. The four small boats have decorative water that dries behind them without affecting combat. Larger boats' water sinks the buildings it reaches (the larger boats also wall stones and the keep), leaving their rubble when it dries; it hurts only fire mages, puts out fires and stops splash damage.

**War banner**:
A reusable Skill: planted anywhere on the board mid-defense, it rallies every mobile troop (swordsmen, archers, fire mages, valkyries, the dark wizard) to fight round it. Planting it again moves it; a tap takes it down.

**Best wave**:
The highest wave the player has held.

**Bonuses**:
The multipliers the Smithy and the skill trees lay over a defense (troops, towers, walls, the keep, rebuilding, bombs).

### Progress

**Armory**:
The levels for every building of a type, and the city elements and battle speed, now sold in the Smithy below the Mine for the mine's metal; `UPGRADES` in code.

**Gold**:
Battle Gold, the coin: paid by kills and every wave held; spent on the mine's and the library's buildings and hires, and on bombs. Not the mine's gold bars.

**Copper** and **silver**:
The mine's metal, as Smithy points: every ten bars the smiths work make a point. Spent in the Smithy and the Tiles shop. (They were once battle coins, and before that iron and steel bars.)

**Time away** (welcome back):
The time since the game was last saved, up to a day, banked for each of the Mine and Library. On returning, both automatically fast-forward their work, earning gains as they go. Remaining idle time survives closing the game, and the welcome-back screen shows the running gains.

**Knowledge**:
Earned by the Library, an hour's worth being its built bookshelves times its professors (idle too), and paid for each wave held past the best wave; spent on the skill trees. Once called Valor.

**Freak accident** (Library):
A table's candle catching it alight: a small chance each minute, lowered by Fireproof Wood. The fire burns whatever it reaches until it burns out or the librarians put it out (Fire Training).

**Night watch** (Library):
Librarians detecting fires earlier and fetching and throwing buckets faster during the night. It protects the same fires that can happen while fast-forwarding.

**Charred book** (Library):
A book ruined by heat, kept as debris until a shelver carries it outside. Intact books remain usable.

**Shelf repair** (Library):
Shelvers filling the burned holes in a purchased bookshelf with new planks, keeping its surviving wood and books.

**Upgrade point**:
One for every new best wave held in Defend, shown in the currency bar; banked for what the meta game brings later. (It replaced the Commander level and its experience.)

**Subject** and **topic**:
How every upgrade is filed: by subject (Realm, City, Towers, Units, Mine, Library) and within it by topic (one tower, one unit building…). The Smithy and the Study each show the topics they have something for. (They were once the Upgrades tab's, each topic with a Forge and a Study.)

**Smithy** (the room):
The workshop below the Mine, reached by its ⚒ Smithy button: a topic's permanent upgrades paid with the mine's metal, its Armory levels and its Smithy rows.

**Study**:
The vault beneath the Library, reached by its ✦ Study button: what Knowledge buys for a topic, its skills, and its **paths**, drawn as a tree.

**Descent**:
The way down from the Mine or the Library to the room below it: the scene slides up, the earth and a ladder rush past, and the room rises into place.

**Tile**:
Anything owned to put into a defense: a City tile or a piece of the wall (City), a unit building (Barracks), a tower (Tower), or a **consumable** (a bomb, used up when it goes off, or the war banner, never used up). Shown in the **Tiles tab**, the keep's hall.

**Stack**:
All the tiles of one kind, shown as one tile marked with its quantity (×4); opened, it shows each copy, whether it stands in the city or waits in the palette.

**Higher tier**:
The greater building a tile becomes through its path's crown (an **evolution**): Wizard tower into Dark wizard keep, Barracks into Valkyrie palace.

**Path** (in a topic's Study):
One way a building can grow, in ranks learned in order with Knowledge: the Wizard tower's Pyromancy (flames only), Rime (ice only, then freezing solid) or Stormcalling (lightning in place of flames), the Barracks' Crusaders (hearty, healing) or Assassins (swift, with critical strikes), the Archer tower's Fire arrows (setting enemies **burning**) or Sharpshooters, the Cannon tower's Gun crews (with **grapeshot**) or Siege shot, the Archer barracks' Rangers or Skirmishers, the Watch tower's Spotters or Signal fires, the Mage Guild's Pyroclasm or Cinders, Monster bait's Oil-soaked or Fortified crates, Wall spikes' Blasting stakes (blowing up on contact), Spring stakes (the whole row shooting out) or Rimed stakes (chilling). Choosing a path's first rank **seals** the topic's other paths; **unlearning** it returns every point of Knowledge spent and opens them again.

**Evolution**:
A path's crown, turning its building into a greater one (Stormcalling's Wizard tower into the Dark wizard keep, Crusaders' Barracks into the Valkyrie palace), learned with Knowledge after the path's last rank. Every copy owned, placed or not, becomes the greater building, back in the palette to place again, and copies bought while crowned are greater ones too; unlearning the path turns them back. The greater buildings are no longer sold on their own.

**Smithy rows** (in the Smithy; Training in code):
Ranks of a few percent each on one row (troop HP, tower damage, Gold found…). A rank costs one Smithy point and is worked by the mine's smiths: one smith takes its whole time, more smiths share it. A smith on a rank stays at the smithy until it's done; taking the last one off cancels the rank and returns its point.

**Smithy point**:
Copper, silver or gold: every ten bars of a metal the mine's smiths work make a point of it. A row's first ten ranks cost copper, the next fifteen silver, the rest gold.

**Smith**:
A miner put to the smithy. The smiths are the Smithy's hands: how many ranks can be worked at once, and how fast.

**Skill tree**:
Command and Stewardship (for Defend), Mine and Library: ranked skills bought with Knowledge, each needing the skills above it, and a researcher in the Library's alchemy lab.

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
Burning ground a fireball (or bursting monster bait) leaves, hurting every ground enemy inside it each second until it dies down.

**Monster bait**:
A stack of crates of bait, a structure for anywhere: while any stands, every enemy goes for the nearest one before the keep.

**City gate**:
A gatehouse set into the city wall on the edge of a city tile: it opens for the city's own people (troops and civilians) and stays shut to the enemy, who must batter it down.

**Wall spikes**:
A row of iron-shod stakes along the outside of one city tile's stretch of wall, cutting every enemy on foot that presses against it.

**Wall ballista**:
A great crossbow on a bastion at a corner of the city wall, where the wall turns through a right angle; its bolts pierce a file of enemies.

**Wall corner**:
A tile corner where the city wall turns through a right angle: one of the four tiles round it is city (an outer corner), or three are (an inner bend).

**Palette category**:
Which kind of building the build palette shows: All, Towers (they shoot), Units (they train troops) or City (city tiles, gates, wall spikes, wall ballistas and monster bait).

**Restock**:
Civilians rebuilding fallen monster bait, which only Restocking allows, a set number of times a defense for each stack.

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

**Work lamp**, **torch** and **lantern**:
A miner sets a small temporary work lamp beside a dark face. Torches also burn out; lasting lanterns hang from the cave ceiling by a narrow chain. The crew place lighting as the workings expand.

**Stone**, **hard stone** and **dense stone**:
Three increasingly difficult layers of the mine, with hard stone around a third of the way down and dense stone around three fifths. Softer seams let miners find easier routes.

**Rail incline**:
A gentle rise or dip in the track through an uneven tunnel, followed by loaded and empty carts alike.

**Mine**:
The idle side view of the ground under the city, worked by miners whatever tab is open and while the game is closed. Its world comes from a seed.

**Prospect**:
One world the mine works, with only so much ore in it. Once less than a fifth of its ore is left (or the shaft is at the bottom and the work there is done, **worked out**) the player can move the crew, the buildings and the stock to a **new prospect**: fresh ground from a new seed.

**Miner**:
A worker the player hires with Gold and puts to one of three **trades**: the face (digging, shoring, laying track, hanging torches and lamps, building carts, carrying ore up), the forge, or the smithy. A miner at the face wears a yellow hat, a forge hand a grey welder's mask, a smith a brown leather apron. Each miner has a name for life.

**Temperament** and **habits** (Mine):
What a miner does with itself while it waits: looking about, stretching, sitting down, whistling, yawning, tapping a foot or sifting the ground. Its temperament is the two habits it falls into most, from its name, so each miner idles in its own way. Two miners waiting side by side chat instead.

**Crew list**:
The miners by name in a box for each trade, opened beside the mine's view: a name dragged to another box changes that miner's trade, and one tapped is followed by the camera. A miner lost stays in the list crossed out under a skull until tapped away or replaced by the next hire.

**Shaft**, **level** and **tunnel**:
The laddered shaft is sunk through the dirt into the stone; at every level a tunnel with track and torches runs out either side.

**Cave**:
Open ground the world leaves in the stone: winding passages and wide caverns, hung with stalactites and grown with stalagmites. When a dig breaks into one the crew learn its extent, hang torches along its floors, go after the ore on its walls and drive drifts on from its ends and its lowest point.

**Drift**:
A short side tunnel driven off a level's tunnel or a cave, level or slanting up or down after the ore, lit as it goes and ending in a small chamber. Off a tunnel it is reached by a few rungs of ladder through the roof or floor.

**Winze**:
A ladder sunk from one level down to the next, away from the shaft.

**Scaffolding** and **trestle**:
A ladder standing free in a cave is braced as scaffolding; where a tunnel's track crosses a cave it runs on a trestle of beams.

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
A dark cathedral nave the player fills with bookshelves and librarians, earning Knowledge, with the alchemy lab below it.

**Bookshelf**:
A unit of two rows of books; units stack bay by bay up the nave to just under the stained-glass window.

**Librarian**:
A scholar the player hires with Gold, put to one of three **roles** in the Staff list, each with a name for life.

**Shelver**:
A librarian who keeps the stacks: builds shelves and ladders, wheels the carts, shelves and sorts the books, fights fires, refills the water butts and sweeps up. With no shelvers, the professors do it.

**Professor**:
A librarian who reads. Each book can be read once; a book read has had its knowledge used up and goes on the **return shelf**. Knowledge an hour is built shelves times professors.

**Winter ice**:
Frozen water that makes those on foot slide. A boat's frozen wake blocks rebuilding and stays until fire or explosions melt it into water, which then dries away.

**Return shelf**:
A low stand on the nave's floor for the books the professors have read. When it fills, a shelver loads them into the cart and wheels them out, bringing back fresh books for the gaps.

**Researcher**:
A librarian who works the **alchemy lab**, a vaulted cellar under the nave reached by a ladder from a trapdoor: stoking the athanor, brewing at the cauldron, distilling, studying, chanting at the transmutation circle. With no researcher, the skill trees' Knowledge research can't be bought.

**Enchanted book**:
A book on the library's shelves that has taken on glowing runes along its spine. With the Enchanted ink skill each shelved book has a small chance a minute of becoming one; a professor who reads it gains a burst of Knowledge.
_Avoid_: magic book, rune book

**Lab level**:
How far the alchemy lab has been dug out, 1 to 5, raised with Gold. The lab has room for one researcher a level. Level 2 opens the west **annex** (a mandrake garden and a lectern), level 3 the east annex (a crucible that casts gold and an orrery), level 4 adds a salamander in its cage and level 5 a scrying orb.

**Skills**:
The battle's bomb and reusable war banner, placed by the player from the side panel.

**Banner influence**:
The circle around a planted war banner where researched damage, life, defense and regeneration bonuses apply. Troops marching toward the banner can receive its researched speed bonus before entering the circle.
