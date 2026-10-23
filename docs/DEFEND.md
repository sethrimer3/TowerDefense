# DEFEND — city defense

A tower-defense-style simulation where the player lays out a walled city and
holds it against endless waves. Code lives in `src/defend/`.

Waves spend a difficulty budget starting at 20, growing 5% per wave (rounded
down). Enemy costs are Roach 1, Bat 2, Orc 4, Ogre 8, Mother 10 (including
three Broodlings), Warlord 100, Snake 60, Dragon 2,500, Shield Generator
10,000, and Invincible Shield Generator 1,000,000; the siege engines cost Rolling Cannon 80, Ballista 120, Firework Launcher 200, Trebuchet 2,500, Great Bombard 12,000 and Dragonfire Battery 30,000; the magic boats Enchanted Skiff 1,000, Spellbound Sloop 10,000, Arcane Galleon 100,000 and Deluge Ark 1,000,000. Affordable enemies are selected randomly;
there are no starting-wave gates or scheduled Warlord spawns. Enemy HP stays
fixed. Each wave reserves at most 5,000 enemies, including hatched offspring.
Selection favours expensive enemies when capacity is tight; any budget the
roster cannot spend is discarded. Invalid costs and cyclic offspring are
excluded, and extremely late budgets saturate at the largest safe integer.
Waves release their initial enemies over five seconds.

The console logs `[Defend performance]` every five seconds and at wave end,
including FPS, p95 frame interval, update/draw time and peak live enemies.
Recent rows are available as `window.defendPerformance`; they are not saved.

## Board

- 9 × 13 **tiles**, each subdivided into 8 × 8 **cells** (72 × 104 cells), and into 4 × 4 **quarter tiles** of 2 × 2 cells, the grid buildings and wall sections are placed on.
  Tiles are the unit the player builds with; cells are the unit the
  procedural city, walls, pathfinding and simulation work in.
- The top tile row is the enemy **spawn lane** — nothing can be built there.
- The board scales to the largest 9:13 size that fits on screen without
  scrolling. Open ground uses the mossy flagstone tiles
  (`public/assets/defend/floor-*.png`), one random variant per tile, never
  rotated (their baked-in lighting looks wrong turned) and grown 15% to close
  the gaps between them.

## Layout of the page

- One header row, never two. Building: Upgrades (opens the Upgrades tab) · Start the defense on
  the left; best wave and the ⚙ DEFEND settings (palette side, reset zoom) on
  the right. During a battle: Abandon (click twice — it asks "Confirm?") and
  the speed toggle (1× ⇄ 2×, plus 3× once War drums is bought in
  Upgrades) on the left; weather, wave, best, keep health and foes on the right.
- The board's view fills the room under the header, so the page never
  scrolls; unzoomed it fits the whole city, centred on dark ground. `☰ Build`
  (building) and `☰ Items` (in battle) slide the palette in beside the view,
  which narrows to make room while the board keeps its scale (like the Mine's
  Crew list). The palette starts open while building and closed in battle.
  Scroll-wheel or pinch zooms (up to 6×); dragging open ground pans. Messages
  float over the board's foot.

## Building (before a run)

- The **palette** (left by default; the ⚙ settings move it to the right) lists
  city tiles, the Melee and Ranged Guilds, barracks, archer barracks, Mage Guilds, Valkyrie palaces, dark wizard keeps, monster bait, city gates, wall spikes, wall ballistas and the towers with an `×N` count of
  what is owned but not yet placed; it greys out at `×0`. The button at its
  head (`☰ All`) opens a list of categories, and the palette shows only the
  one picked: **All**, **Towers** (archer, cannon, watch and wizard towers),
  **Infantry** (barracks, archer barracks, Mage Guild, Valkyrie palace, dark
  wizard keep) or **City** (city tiles, monster bait, city gates, wall
  spikes and wall ballistas;
  `ITEM_CATEGORY` in `catalog.ts`). The city tile's icon is a corner of the
  city in the board's own pixel art (`tile-art.ts`): two dirt streets
  crossing, shingled roofs and a park with a tree.
- A **city gate** goes on the edge of a city tile where the wall runs (the
  tile across it is on the board and not city): carried from the palette it
  snaps to the nearest such edge (`nearestEdge`, `EditSession.edge`), each
  one framed in gold, and a set gate lifts, moves and goes back to the
  palette like a structure. It is saved in the layout's `gates` as its tile
  and side. It takes the middle 3 cells of the edge the wall's 2 cells deep
  (`gateRect`); `fitLayout` keeps the 3 × 2 cells inside it clear, and the
  city paves them and joins them to the streets. Adding a city tile across a
  gate, or taking its own tile away, drops it back to the palette.
- **Wall spikes** go on the same edges as a gate (not one with a gate, nor a
  gate on one with spikes), saved in the layout's `spikes`: they line the
  wall's outer row of stones along the whole edge (`spikesRect`; carried,
  the edge's whole depth of wall is framed, `edgeWallRect`). A set row lifts
  from any of its stones.
- A **wall ballista** goes on a corner of the wall: a tile corner whose four
  tiles are on the board and one or three of them city (`cornerOk`), so the
  wall turns through a right angle there; straight runs, and two tiles
  meeting only at a point, don't take one. It is saved in the layout's
  `ballistas` as the corner (`CornerSpot`, `vx, vy` in tiles). Its bastion
  takes the 2 x 2 block of wall stones at the corner (`ballistaRect`): in
  the tile across the corner from a lone city tile, or in the one tile
  round an inner bend that isn't city. Carried, it snaps to the nearest
  corner (`nearestCorner`). Either goes back to the palette when its wall
  stops running there.
- Drag from the palette onto the board. While dragging, every tile that would
  accept the item gets a faint gold outline and every other tile darkens; the
  hovered tile shows exactly where the building will be fitted.
- Placed things can be dragged to another tile, or back onto the palette /
  off the board to pick them up again.
- **City tiles** can go anywhere but the top row, next to the city or apart
  from it; each group of tiles joined along their edges is walled on its own.
  The player starts with 8 — enough for a 3 × 3 city around the keep. Pressing
  a city tile away from its buildings lifts it with everything on it (its
  gates and spikes too); a tile under the dark wizard keep stays put, and
  the keep's own tile moves with the keep.
- **The keep** is placed like a city tile: dragged (by the keep or its
  tile's open ground) onto open ground it carries its tile and the gates and
  spikes in its wall, and onto another city tile the two swap. It is never
  removed.
- **The keep's upgrades** (`keep-upgrades.ts`): tap or hold the keep while
  building to open its tree. Unlike other buildings its three branches are
  climbed side by side, each three ranks of Knowledge: Bastions (30%, 70%,
  140% more HP), Arrow loops (it shoots the nearest enemy within 5 cells;
  faster, harder and 6.5 cells at II; three arrows at once at III) and
  Boiling oil (every few seconds it scalds every enemy on foot near its
  walls, setting them burning from II). A respec gives every point back,
  free, and any rank can be undone on its own (it and the ranks above it).
- **Wall sections** (`layout.ts`'s `walls`, `wall-upgrades.ts`): carried
  from the palette, the placing grid turns four times finer, and a section
  takes the quarter tile it is let go over: 2 × 2 cells of wall stone, as
  thick as the city wall, anywhere outside the city but the spawn row (not
  where it would be wall already, nor over a structure). Enemies must break
  through them like the city wall; civilians rebuild them. Pressed, they
  lift and move; carried off the board they go back to the palette. Every
  section shares one tree, its branches climbed side by side: Stonework
  (50% then 120% more HP, then stones that mend 2% a second), Trapped walls
  (each stone bursts once as it breaks, sparing your own people: 100 damage
  over 1.5 cells, then 250 over 2, then 2.5 cells out leaving the ground
  burning 4 s; a stone rebuilt whole is trapped again; Thornwork's ranks
  carry over) and Town walls (sections may
  stand inside the city, then your own troops and townsfolk slip through
  them). A respec gives every point back, free, and takes the sections
  inside the city back to the palette; any rank can be undone on its own.
- The **Melee** and **Ranged Guilds**, **barracks**, **archer barracks**, the **Mage Guild**, the **spearmen hall**, **phalanx**, **javelin camp**, **lancer stable**, the **gunner hall**, **musket hall**, **sniper lodge**, **machine-gun nest**, **Gatling emplacement** and **rocket battery**, the **Valkyrie palace** and the **dark wizard keep** must be inside the city. **Archer**, **cannon**, **watch
  and wizard towers** and **monster bait** may stand inside or outside.
- Every structure takes a fixed block of **quarter tiles** (`footprint` in
  `catalog.ts`, never rotated): 1 × 1 the archer, cannon, watch and wizard
  towers and monster bait; 2 × 2 the Melee and Ranged Guilds, Assassins'
  den, spearmen hall, phalanx, javelin camp, lancer stable, gunner hall, sniper lodge, machine-gun nest, Gatling emplacement,
  rocket battery and archer barracks; 3 × 2 the musket hall; 2 × 3 the
  barracks and Mage Guild; 3 × 3 the Valkyrie palace (2 × 3 once Folded
  halls is bought). An upgrade that changes a building's footprint takes
  it up to the palette, to be placed again.
- The **dark wizard keep** is the one structure bigger than a tile: it
  stands within a 2 × 2 block of city tiles (`span` 2), 6 × 6 quarter
  tiles. Its saved tile is the block's top left one. The pricey Folded
  sanctum folds it onto a single tile (3 × 3 quarter tiles). Taking away any tile it stands on returns it to
  the palette.
- The player places each structure on the quarter grid; the game only
  checks it (`fitLayout`): the keep stands 2 × 2 quarter tiles in the
  middle of its tile; everything else must lie inside its own tile, keep a
  clear quarter tile all round from every other building (monster bait,
  walls and the wall's defenses may touch), and, inside the city, still
  reach the keep's streets. While a structure is dragged, the quarters it
  would take are shown, gold where it fits and red where it won't, with
  its clear ring dashed round it. A save whose buildings no longer fit is
  arranged afresh (any arrangement that fits will do), and failing that
  its newest buildings go back to the palette.

## The procedural city (`citygen.ts`)

- The **wall** is 2 cells thick and sits just *outside* the city tiles, so
  every city tile keeps its full 8 × 8 interior. The board edge is
  impassable, so no wall is built along it.
- Wall art is per cell. In Mossbound Ruins each wall cell shows a 16 px
  window of the mossy cap-stone run in `wall-cap.png` (x 38–54, continuing
  down the run), and any stone with open ground or a breach to its south
  hangs a strip of the brick face from `wall-face.png`. Every later area
  draws both as pixel art in code (`area-wall-art.ts`): a dressed cap stone
  a cell and two courses of face, in the area's stone and dressing. Because
  it is per cell, breaches just show rubble with broken edges around them.
- A plaza rings the keep, avenues run to the city edge, every structure gets
  a street to its door, then deep blocks are split by straight streets until
  nothing is more than 2 cells from a road. Some small blocks become parks;
  the rest fills with houses (mostly 2 × 2 to 3 × 3), each touching a street.
- Larger parks get a pond: every park cell whose eight neighbours are all
  park becomes water, its shore the union of jittered discs for an irregular,
  natural edge. Ponds block movement but not light.
- Ponds and trees are pixel art (`park-art.ts`), painted pixel by pixel at
  8 pixels a cell and drawn up with smoothing off, to match the blocky
  roofs and grass: the pond in dithered bands (black outline, muddy bank,
  reedy shallows, open water, a deep heart) with glints and lily pads;
  trees as lumpy canopies with a one-pixel outline and four shades lit from
  the upper left. Trees stand over everyone (`park-trees.ts`): they are
  drawn after the units, each fading to half opacity while an enemy, soldier
  or civilian is under it, and darkened with the city in a battle's weather.
- Streets are packed dirt (`ground-art.ts`), pixel art at 8 pixels a cell in
  soft blotches of brown, darker along the kerbs and worn lighter down the
  middle, flecked with grit and pebbles. Where a street meets a park the
  grass grows out over it unevenly (ragged turf, a dithered band of worn
  grass, a stray tuft or two) and the dirt bites back into the park's edge
  in bare patches, which the live grass keeps off.
- Shadows (`shadow-art.ts`): one crisp pixel mask cast over a height map in
  the afternoon sun from the upper left. Houses stand as gabled roofs (low
  eaves, a higher ridge, so a gable end throws a longer pointed shadow), the
  city wall stands taller than any house with its face sloping to the
  street, then the keep's curtain, turrets and great tower, the other
  structures, and the trees' domed canopies. Everything shades whatever
  lies below it: the wall's shadow falls across the roofs beside it,
  shortened where they rise toward it and running on past the ridge. Fallen
  buildings cast nothing.
- About 60% of parks have a thin wooden fence along their street sides,
  with one gap left as a gate (`fences.ts`). Fences are purely visual: an
  enemy walking across a section, or a blast next to it, snaps it into
  splinters that scatter, settle and fade out after 5–10 s.
- Art: medieval roofs (terracotta, brick, timber, thatch, slate, straw)
  as pixel art at 8 pixels a cell inside crisp black outlines and a black
  ridge, laid in staggered shingle courses each shingle shaded a little
  differently; each house is seeded from its lot, so some stay neat while
  others weather with missing and patched shingles, moss up from the eaves,
  rain streaks and now and then a chimney (`roof-art.ts`). When zoomed in, the city
  is repainted at 2–4× resolution so edges stay sharp. The keep is pixel
  art at 8 pixels a cell, like the parks' ponds and trees: four round
  corner turrets, crenellated walls with a gate, a courtyard and a hipped
  slate roof, with a pixel red and gold swallowtail banner rippling on top
  (held still under Reduce motion). The keep shows its wounds: below 80% of
  its HP its walls crack, below 60% slates go from the roof, below 40% the
  east wall is breached and the roof burns through, and below 20% the north
  wall is down too and half the roof has caved in over smouldering rafters.
  When it falls it leaves its own rubble: wall and turret stumps round a
  heap of stone, slate and charred beams.
- Every other building shows its wounds too, in three stages below 75%,
  50% and 25% of its HP (`damageStage`): cracks, chipped edges and soot;
  then holes through the roof (to the rafters) or the floor, and scorching;
  then a burning cave-in with embers and fallen stone. The placeable
  structures are pixel art at 8 pixels a cell (a red-roofed barracks with
  a blue shield on the ridge, the archers' timber hall and target yard,
  the crenellated archer tower, the round cannon bastion, the watch tower's
  beacon in its brazier, the wizard's violet roof, the Mage Guild's dark
  wine-red hall with a fire well burning in a brass ring, ember runes and
  two red swallowtail banners over its south wall), houses damage their
  shingled roofs, and wall stones take an overlay of cracks and pits. A
  fallen building leaves its own rubble: stumps of its walls round a heap
  of stone and roofing with charred beams and embers, and a fallen wall
  stone leaves broken blocks on the gravel. The damage is seeded by the
  building's lot, so each building wears its own.
- Generation is seeded per save and keyed by position, so the same layout
  always produces the same city. `tests/defend-city.test.ts` pins both
  `fitLayout` and `generateCity` against recorded hashes.

## A run (`sim.ts`)

`DefendSim` holds the world and runs each step in a fixed order. Unit
behaviour lives beside it: `enemies.ts`, `troops.ts` (barracks, swordsmen,
archers), `civilians.ts` and `towers.ts` (towers, arrows, shells), with grid
A*, the flow field and collision in `pathing.ts`. A run is deterministic
from its seed; `tests/defend-replay.test.ts` pins it.

- Building is only possible before the run starts. Waves then roll without
  stopping (3 s breather after each) until the keep falls.
- Enemies are tiny squares that move freely (not grid-locked). They follow a
  flow field to the keep where streets are cheap and buildings/walls are
  passable at a cost (they must be smashed first) — so they walk the streets
  but break through when that's much shorter. Houses lure some enemies off
  the road to wreck them (`distraction`); bats fly straight over everything.
- **Mothers** (10 difficulty) are slow, black and violet-rimmed, with pale
  eyes and a swollen brood sac. When one dies she splits into three quick
  **broodlings** at the corners of a small triangle around where she fell
  (on the spot if that is inside a wall); broodlings never come in a wave's
  mix and don't split again. Each counts as its own kill.
- **Siege engines** (`siege.ts`) have no crew: each drives itself toward
  the keep like any ground enemy and stops to shoot once something is in
  range: the keep first, else the building its own way runs into (a wall
  stone, a house across the street), else a defender. It braces for 0.8 s
  before the first shot at a new mark, never fights hand to hand, and its
  shots hurt only the city and its people. The cheap ones: the **Rolling
  Cannon** (a lobbed iron ball, 5 cells), the **Ballista** (a bolt through
  every defender on its line, 7 cells, people first) and the **Firework
  Launcher** (six scattered rockets, 6 cells). The heavy ones: the
  **Trebuchet** (a boulder in a wide burst from 11 cells, reloading for
  7 s), the **Great Bombard** (a huge shell, 9 cells) and the **Dragonfire
  Battery** (sixteen rockets over a wide area, 10 cells). Drawn as pixel
  sprites (`siege-art.ts`) whose barrel, bow or throwing arm turns to the
  mark: a boiler puffing steam on the rolling cannon, the ballista's string
  drawn back with a bolt laid on, rockets refilling their racks, the
  trebuchet's arm swinging over; rockets wobble up on spark trails and burst
  into fireworks.
- Destruction lasts for the whole run. **Civilians** come out of houses to
  rebuild rubble one cell at a time (walls and structures first); a
  structure only works again once fully rebuilt. They avoid rubble with
  enemies close by and respawn a while after being killed.
- **Basic buildings and their upgrades.** The shop sells only three
  buildings: the **watch tower**, the **Melee Guild** and the **Ranged
  Guild**. The Melee Guild trains **brawlers**, who walk out and punch
  (no weapon, short reach); the Ranged Guild trains **stone throwers**, who
  lob slow stones at short range. Every other tower and troop building is
  one of these upgraded, one building at a time, with Knowledge: tap it
  while building (or press and hold it, or its tile in the palette, which
  upgrades that copy before it is placed) to open its upgrade tree, nodes on branches you can drag
  about. The branch a building is on carries on upward; choosing another
  building instead sits beside and below it. Choosing a branch withers the
  ones beside it and grows the upgrades only it leads to. Branches not
  shown yet trail off as lines breaking into dots (what buying a node
  would open), and the ones a choice closed off trail off behind it in
  withered brown. Tapping a node the building has offers Undo: it and every
  upgrade after it come off, their Knowledge back, free. The box in the
  tree's corner shows the Knowledge allocated to that building; a respec
  (free) gives it all back and turns the building back into its basic one. A watch tower becomes an archer,
  cannon or wizard tower; a Melee Guild a barracks (swordsmen, later
  crusaders), a **spearmen hall** (see the spearmen line below) or an **assassins'
  den** (quick, frail assassins whose every fourth strike is critical, with
  four paths: Bloodletters' huge criticals at the cost of HP, Shadowcloak's
  cloak that no enemy sees through until they strike, then an ambush;
  Venomblades' poison, making an enemy take more damage from everything and
  at III spreading when it dies; Headhunters going for the toughest enemy in
  reach, with a bounty of its HP, at III anywhere in the city); a
  Ranged Guild an archer barracks, a Mage Guild or a **gunner hall**
  (gunners with pistols: quick, short shots; its Quickdraw path reloads
  faster, then fires a second pistol at the next nearest, and its Duelists
  hit harder, reach further and make every 3rd shot hit three times as
  hard), which becomes a **musket hall**, a **machine-gun nest** (machine
  gunners spraying light bullets; its Belt feed path reloads faster and
  hits harder, and its crown makes it a **Gatling emplacement**, whose
  gunners fire at an enormous rate but barely walk; its Tripod path
  reaches further and hits harder) or a **rocket battery** (rocketeers:
  very slow to reload, every rocket bursting 1.5 cells wide, sparing your
  own; Cluster rockets burst wider, then throw 4 bomblets, then leave the
  ground burning, and Salvo racks reload faster, then loose two and three
  rockets a launch). The Gatling emplacement has Gun shield (more life,
  then a carriage pushed twice as fast), Overdrive (all damage, no push:
  bullets 40%, then 80% harder, then two and a half times as hard and
  cranking 15% faster) and Stopping power (all push, little damage: every
  bullet knocks its enemy straight back from the gun, further each rank,
  until at III the stream holds back most walkers, at 35%, 30% and 25% of
  the damage; walls stop the push, and bosses, fortresses and boats aren't
  moved). The musket
  hall's Sharpshooters path (further, harder, the toughest in reach at
  III) is crowned into a **sniper lodge** (snipers: long range, heavy,
  slow single shots, with three paths: Marksmen reaching
  3 cells further, aiming at the toughest enemy in reach from II and
  landing a 4× headshot every third shot at III; Ricochet bullets glancing
  on to the nearest enemy not yet struck within 2.5 cells, once, twice,
  then four times at 80%; Suppressing fire's hits slowing, staggering from
  II, and reloading 40% faster at III; Deadeye hitting 60%, then
  120%, then three times as hard, reaching 2 cells further at III; Piercing
  rounds flying straight on to the end of their reach through every enemy
  in the line, each hit at 40%, 50%, then 60% of the shot, reaching 2
  cells further at III). A plain sniper lodge becomes the gunner line's
  ultimate, the **Revolutionary** (100,000 Knowledge): a high-tech hall of
  laser snipers (60 damage every 3 seconds, 12 cells), whose upgrades are
  one tree shared by every Revolutionary, its five branches bought side by
  side from its own node in its upgrade tree: Squad (two, then three
  snipers), Chain laser (the laser leaps from enemy to enemy within 6
  cells of each other and the bullet follows it, striking 3, 5, then 7),
  Overclock (a 1%, 3%, 5%, then 10% chance each hit is critical), Hollow
  core (a critical does 5×, 10×, 15×, 20×, then 25× damage; 2× before it)
  and Detonator (where the bullet stops it bursts 1, 2, then 3 cells round
  its last enemy at half the hit, sparing your own). Every sniper holds a
  thin laser on its mark, red for a lodge's and cyan for a Revolutionary's
  (zigzagging through every enemy its bullet will strike), faint as it
  reloads and brightening as it locks on; the shot flashes along it and
  each bullet trails a bright streak. The musket hall's musketmen fire
  slow, heavy single balls, with four paths: Sharpshooters (above);
  Grenadiers' balls bursting over a small area, sparing your own, and
  leaving the ground burning, throwing four
  smaller bursts round them from II and setting clinging fire at III;
  Volley fire's extra balls at the next nearest enemies, and at III quicker
  reloads for each comrade of the hall standing near; Bayonets running
  through an enemy at close quarters instead of shooting it, hunting
  anywhere in the city from II and staggering what they stab at III. A
  building can also start one of its kind's paths and climb it rank by
  rank; a crowned path's last step evolves it (Stormcalling's wizard tower
  into a dark wizard keep). A building taken back to the palette keeps its
  path and rank and is placed again from its own palette entry.
- **Barracks** keep up to N swordsmen alive, training a replacement every
  few seconds after one dies. Swordsmen stay inside the walls and fight
  whatever gets in (troops can't pass walls — a palisade gate is a future
  upgrade; troop pathing is plain A* over open cells, so gates only need to
  change what counts as open).
  Their paths: Crusaders (more HP and slower, healing from rank II,
  harder hitting at III), Berserkers
  (strokes a third faster, each kill healing 30% from II, blows cleaving
  every enemy beside the target at III) or Halberdiers (0.6 cells more
  reach and 20% more damage, blows slowing from II, 2.5× on big enemies
  at III). The old Assassins path is retired (its Knowledge refunded).
  A plain barracks becomes the swordsmen's ultimate, the **Hero**
  (`hero.ts`, 100,000 Knowledge), a gilded hall the barracks' size that
  trains one hero (480 HP, 16 damage every 0.42 seconds), slow to rise
  again (three times a barracks' drill). It hunts the nearest enemies in
  the city and fights in a combo: two sweeping slashes, each cutting every
  enemy within 1.3 cells in front of it, then a spin cutting everything
  within 1.5 cells round it for 1.5×. Its paths: Whirlwind (every other
  strike a spin reaching 2 cells, then spins at 2.2×, then every strike a
  spin reaching 2.4 cells), Blade dance (each strike a flurry of 3 slashes,
  dashing from enemy to enemy within 2.5 cells, stopped by anything solid;
  then 5 slashes and a third faster; then each kill adding another slash,
  up to 12) and Legend (twice the HP, then each kill healing 5%, then the
  first time it falls it rises at once with half its HP, unhurtable for 3
  seconds). `hero-art.ts` draws the knight with its long swallowtail cape
  in its path's colours, streaming out behind it as it runs, rippling in
  the breeze and flung round it through a spin (`hero-cape.ts`: a chain of
  points with momentum, kept a link apart, rasterized on the sprite's own
  pixels), its longsword swinging through each slash and whirling round
  through each spin, the slashes' crescents, the spins' rings, the dashes'
  streaks and after-images, and the rising's pillar of gold.
- **Archer barracks** train archers (same garrison size, drill speed and
  arms upgrades as the swordsmen's barracks). Archers wander random city
  streets and stop to shoot anything within their short sight (3 cells,
  widened by Keen eyes). The pricey one-off Hunter's instinct makes them
  path toward the nearest enemy in the city instead, stopping at bow range.
  Three building attunements each have three Knowledge tiers. **Skirmishers**
  fire 1/3/5/7 arrows per attack, distributing them among enemies in sight;
  tiers retain faster draws and, from II, 30% faster movement and shooting
  while moving. **Javelin Bowmen** (formerly Rangers) fire a massive arrow
  every 3 seconds for 6× damage. The shaft carries susceptible enemies in a
  straight line: 2 enemies and 3 city tiles of push at base, 3 enemies and
  4 tiles at I, unlimited piercing and 5 tiles at II, then 6 tiles at III.
  From II it explodes once at the end, with radius growing per unique enemy
  pierced. Walls, board edges, shields and resistant enemies stop it; bosses,
  boats, fortresses, unyielding and physical resistance cannot be carried.
  **Skyranger** has battlefield-wide range. Its arrows rise vertically and
  fade, then reappear above their target and fall. Arrow rain adds 12 arrows
  every 10 shots at I (2-tile radius), 20 every 7 at II (3-tile radius), and
  28 every 5 at III. The last tier allocates rain evenly among enemies in
  the area: one takes all 28, two take 14 each. Earlier tiers scatter and
  may miss. Rain never advances its own trigger. A city tile is `SUB` = 8
  simulation cells. Existing Ranger ranks/IDs persist as Javelin Bowmen;
  Archer Towers and the separate spear-line javelineers are unchanged.
  The three completed branches merge into the existing Sniper lodge.
  [Full accepted tuning](upgrades/ARCHER_ATTUNEMENTS.md).
- **Mage Guilds** (`mages.ts`) train fire mages (same garrison size, drill
  speed and arms upgrades as the barracks). Mages wander the streets like
  archers and, when an enemy comes within 4.5 cells, stop and hurl a
  fireball at where it stands. It bursts with splash damage (full at the
  centre, 40% at the edge, fliers too) that spares your own people, and
  leaves a **blaze**: burning ground that hurts every ground enemy inside it
  each second until it dies down (fliers pass over). Upgraded by Spellpower
  (fireball damage and burst) and Lingering embers (how long and how hot
  the ground burns) in the Forge. Paths: Pyroclasm (heavier, wider
  fireballs, then two more bursting either side) or Cinders (longer, hotter
  blazes, then fire that clings to whoever walks through).
- **The spearmen line** (`spears.ts`). A Melee Guild becomes a **spearmen
  hall**: spearmen chase like swordsmen but strike from 1.1 cells off. Its
  paths: Long spears (0.4 cells more reach; from II each thrust runs on
  into the nearest enemy behind its target for 60%; at III 0.8 cells, 30%
  harder and running through at full) and Set spears (twice the damage on
  an enemy still at full health, staggering half a second from II, 3× at
  III). A spearmen hall becomes a **phalanx** (hoplites: slow, 70 HP,
  taking 60% of every blow; Testudo takes 25% more off, then 10% for each
  comrade within 1.5 cells, up to 3, then slows every enemy within reach;
  Spear wall hits 30% harder, then strikes every other enemy in reach for
  half, then full), a **javelin camp** (javelineers roaming like archers,
  throwing heavy javelins 4 cells every 2 seconds; Barbed javelins slow,
  then stagger, then hit big enemies 80% harder; Throwing arms reach 1.5
  cells further, then throw a second javelin at the next nearest, then
  throw 30% faster) or a **lancer stable** (lancers riding fast, their
  first thrust at each new enemy a charge of 2.5×; Heavy lance makes it
  3.5×, then staggering a second, then trampling everything beside the
  target for half; Winged lancers ride 25% faster, then range half again
  as far from the stable, then heal 15% with each charge, and their crown
  makes the stable a Valkyrie palace).
- **Valkyrie palaces** (`valkyries.ts`), the spearmen line's ultimate,
  grown from a lancer stable by the Winged lancers path's crown rather
  than bought, train valkyries (same garrison
  size, drill speed and arms upgrades as the barracks): armoured angels with
  spears who path toward the nearest enemy in the city, or stroll the
  streets. When an enemy comes within her reach she makes a **charge stab**:
  she blinks along the line toward it, as far as her reach (3 cells, longer
  with Long spears) or until an intact building, the city wall, a pond or
  the board's edge stops her, and her spear hurts every enemy on that line,
  fliers too. For a second after each charge nothing can hurt her
  (`guard`), blasts included. Its one path, **Cloudborne** (`sky-palace.ts`),
  lifts the palace off its lot onto clouds when the battle starts: it drifts
  west at 0.3 cells a second and, once its clouds have left the west edge,
  comes round from the east at another height (hashed from the palace and
  the lap, no random draws). Aloft, its lot is open ground and nothing can
  hurt, sink or rebuild it; its valkyries drop onto the nearest open cell
  under its middle, and none while it is off the board. From II each lands
  with a charge at the nearest enemy within twice her reach; at III it holds
  2 more and trains them twice as fast. `sky-palace-art.ts` draws it on its
  cloud bank with a ground shadow, at a tenth of its opacity over the city,
  a structure or anyone, and a mooring on its lot.
- **Dark wizard keeps** (`dark-wizards.ts`), grown from wizard towers by
  the Stormcalling path's crown rather than bought, each summon one **dark
  wizard**, the ultimate unit, on three times a barracks' drill (arms
  upgrades apply). He hunts the nearest enemy in the city like a valkyrie
  and, when one comes within 6 cells, holds his ground and casts **black
  lightning** at it every 1.6 s. A bolt strikes its target, then leaps to
  the nearest enemy it hasn't struck within the **chain length** (0.7
  cells: enemies must be packed close; Arc span adds 0.2 a level) and on,
  forking back from the latest enemy struck that still has a neighbour
  when it runs out, until it has struck its **chain count** (50, and 10
  more a level of Conduit of night, up to 250); every enemy struck takes
  its full damage, fliers too. The keep's four **corner turrets**
  (`turretSpots`) each loose their own bolt at the nearest enemy within
  7.5 cells every 1.2 s (tower damage and reload bonuses apply), chaining
  to 5 enemies (one more a level of Conduit of night). Neither draws from
  the run's random stream.
- **Patrol routes** (Armory) widens how far from their barracks swordsmen
  go after enemies; its last level sends them anywhere inside the city.
- **Cannon towers** fire slowly at the nearest ground enemy (not bats),
  lobbing a shell in an arc that bursts with splash damage (full at the
  centre, 40% at the edge).
  Paths: Gun crews (faster reloads, then grapeshot: four smaller
  blasts round each landing) or Siege shot (harder, slower, wider, further).
- **Explosions** (cannon shells and bombs) are ragged, layered fireballs —
  smoke, flame, white-hot core, flung sparks — that briefly light up their
  surroundings, then leave glowing, branching cracks that cool and fade over
  1–3 s.
- **Friendly fire:** blasts also hurt your swordsmen and civilians (60% of
  the damage) until you buy Gunnery drills (cannons) or Shaped charges
  (bombs) in the Armory.
- **Wizard towers** (`wizard.ts`) alternate two attacks, resting 1.3 s
  after each: a **flamethrower**, a cone of fire aimed at the nearest enemy
  that swings after it for 1.6 s, burning everything inside (flyers too),
  and an **ice wave**, a fan-shaped front of ice shards spreading toward the
  nearest enemy that hits everything it crosses once and chills it (half
  speed for a few seconds). Its Forge raises the Flamethrower and the Ice wave; its paths (Pyromancy, Rime, Stormcalling) change what it casts.
  Neither draws from the run's random stream; how they look is the
  renderer's (`wizard-art.ts`).
- **Archer towers** shoot the nearest enemy in range. Paths: Fire arrows (what
  they hit burns, then a volley of three) or Sharpshooters (reach, every 3rd
  arrow critical, then aimed at the strongest). **Watch towers** mark
  enemies in their radius with a gold outline; marked enemies take ×2 damage.
  Paths: Spotters (marks hit harder, wider radius) or Signal fires
  (marked enemies slowed, more at rank II, and set burning at III). Up to
  two gunners climb into each watch tower and shoot from the top.
- **Gun sight** (`gun-sight.ts`): the gunner line (gunners, musketmen,
  machine and Gatling gunners, rocketeers, snipers, laser snipers) shoots
  flat, only at an enemy with no wall stone or building on the line
  between (ponds don't block); archers, stone throwers and javelineers arc
  over. A gunner looks only when it could fire, keeps on the enemy it saw
  while reloading, and with nothing in sight walks for the nearest watch
  tower with room and climbs to its top: from there it sees everyone in
  reach, no enemy picks it out, and it drops out when the tower falls.
- **City gates** are buildings (`kind: "gate"`, numbered after the wall
  stones) with the HP of the stones they stand in for, half again: enemies
  find them solid and batter them down like the wall, and civilians rebuild
  them with the wall stones. The city's own people walk through them: the
  sim keeps `ownSolid`, its `solid` mask with the standing gates open, which
  their routes (`findPath`), steps (`followPath`, `moveToward` with `own`),
  the war banner's field and a valkyrie's charge use. Without gates it is
  the same array as `solid`, so a city without them replays exactly as
  before. Drawn by `gate-art.ts`: two crenellated stone towers either side
  of a passage under a stone lintel, barred by two oak doors with iron
  bands and studs, painted along the wall and turned to its side, then lit
  from the upper left in screen space; it takes the usual damage stages and
  leaves rubble. The doors swing inward over `GATE_FRAMES` while a soldier
  or civilian is within `GATE.reach` cells, or the sim holds the gate open,
  and close behind them (`DefendRenderer`, presentation only).
  A gate that opens lets the enemy in too (`gates.ts`, `stepGates`): while
  any of the city's people are at a standing gate it stands open, and
  shuts `gateShut` seconds after the last has gone (the Forge's Greased
  hinges, `gateHinges`, shorten it). The enemy walks `sim.foeSolid`, the
  `solid` mask with the open gates open (its flow field, `downhill`, its
  smash-or-walk choice and its steps through `IceMotion.slide`), so an open
  gate is a way in; an enemy caught in the gateway as it shuts is shoved
  out to the nearest open cell. Without gates, or with Portcullis I, it is
  the same array as `solid`. The Forge's Ironbound doors (`gateStrength`,
  `gateHpScale`) add to its HP. The gates share one tree,
  `gate-upgrades.ts` (`GATE_PATHS`, ranks in `DefendSave.gateRanks`,
  `Bonuses.gate`, bought, undone and respecced through `side-ranks.ts`):
  Portcullis (`PORTCULLIS`: I bars the enemy while the gate is open; II
  murder holes hurt every enemy on foot at the gatehouse every 1.5 s,
  `sim.gateHoleT`; III every second, harder, setting them burning), Gate
  towers (`GATE_TOWERS`: a small ballista on the gatehouse at I, two at II
  (`gateTowerSpots`), harder, further-piercing bolts at III; each turns
  and reloads under its `gateTowerKey`, `sim.gateTowerT`, and shoots
  `small` ballista bolts) and Ironbound (`IRONBOUND`: more HP, then
  mending, then a fallen gate rising whole after 12 s, `sim.gateRise`).
- **Wall spikes** (`wall-defenses.ts`, `stepSpikes`) stand on the stones
  `citygen.ts` lists in `map.spikes` (each row's stones that face open
  ground). Every `spikeEvery` seconds (`sim.spikeT`) each enemy on foot
  (not fliers, boats or a burrowed mole) within the stakes' reach of a
  standing stone takes `spikeDamage`, once a pulse, as a melee blow; the
  Forge's Iron-shod stakes (`spikeDamage`) and Barbed edges (`spikeRate`)
  raise both. A knocked-out stone's stakes go with it and come back when it
  is rebuilt. Paths (`BLAST_STAKES`, `SPRING_STAKES`, `RIME_STAKES`):
  Blasting stakes blow up a touched stone's stakes (`sim.explode`, sparing
  your own people), ready again after a few seconds (`sim.spikeArm`, keyed
  by stone); Spring stakes shoot the whole touched row out, striking every
  enemy on foot in front of it (`sim.spikeArm` under `-1 - row`,
  `sim.spikeThrusts` drawn by `drawSpikeThrusts`); Rimed stakes chill what
  they cut, bite the chilled twice as hard from II, and at III chill every
  enemy on foot near a touched stone. All three are empty or absent in runs
  without them.
- **Wall ballistas** are buildings (`kind: "wallBallista"`, numbered after
  the gates) with twice the HP of the stones they replace; they are solid,
  battered and rebuilt like the wall. Each shoots (`Towers`,
  `shootBallista`) the nearest enemy within `wallBallistaRange` every
  `wallBallistaReload` seconds, for `ballistaDamage` (the Forge's Steel
  bolts, Torsion skeins and Long stocks, `ballistaDamage`, `ballistaRate`,
  `ballistaRange`, and the Smithy's tower reload and damage apply): a bolt
  (`sim.ballistaBolts`, `stepBallistaBolts`) flies straight on at
  `BALLISTA.speed`, hurting each enemy it passes within reach of once,
  nearest first, until it has pierced its `pierce` or flown its `range`.
  The ballistas share one tree, `ballista-upgrades.ts` (`BALLISTA_PATHS`,
  `DefendSave.ballistaRanks`, `Bonuses.ballista`): Heavy bolts
  (`HEAVY_BOLTS`: harder, staggering from II, eight pierced at III), Fire
  bolts (`FIRE_BOLTS`: what a bolt strikes burns, the ground where it stops
  burns from II, it bursts on its first strike at III) and Windlass
  (`WINDLASS`: quicker, then further, then a fan of three bolts turned by
  a fixed cosine and sine, so no trigonometry). Each bolt carries what its
  ranks add (`stagger`, `burn`, `blaze`, `burst`), all absent without them.
  `sim.ballistaAim` keeps where each last shot. A city without spikes or
  ballistas has no `map.spikes`, bolts or aims, so it replays as before.
  Drawn by `wall-defense-art.ts`: the stakes on an oak beam per stone,
  their tips past the wall's face (`spikePixels`, in the city layer); the
  bastion with its parapet and turntable (`bastionPixels`, damage stages
  and rubble); and the crossbow baked at `BALLISTA_DIRS` headings, drawn
  back with a bolt on or slack just after a shot (`ballistaPixels`,
  `drawBallistas`, live each frame, facing out of the city until it first
  shoots), with its bolts in flight.
- **Monster bait** (`bait.ts`) is a stack of crates, one open and heaped
  with raw meat, a haunch lashed to another stacked on top, green slime
  seeping from the seams. While any stack stands, every enemy goes for the
  nearest one before the keep: ground enemies walk a flow field filled from
  every standing stack (so "nearest" is by the way they walk, smashing what
  lies across it as usual), fliers and boats head straight for the nearest,
  siege engines shoot one in range rather than the keep, blink imps blink
  toward it, and houses lure nobody. Bait nobody can walk to at any price
  doesn't call them. Enemies still fight defenders in their reach. A fallen
  stack stays fallen: **Restocking** (Armory) lets civilians rebuild each
  stack once a level, a defense. **Powder kegs** make a stack burst as it
  falls (sparing your own people; a stack sunk by a boat's water only
  sinks) and set the ground round it burning, a blaze like a fire mage's.
  Paths: Oil-soaked (whoever bites a stack catches fire, hotter each
  rank) or Fortified crates (more HP, then spikes hurting each biter
  thrice its bite).
- Civilians work a rubble cell standing in it; when its building's own
  rebuilt cells have walled it in, they work it from an open cell beside
  it (a corner will do).
- During a run the palette becomes the **consumables** palette. A **bomb**
  can be dragged onto the field to blast everything nearby.
- The **war banner** (`war-banner.ts`, `×∞`: never used up, never bought)
  is dragged from the same palette and planted anywhere on the board as the
  keep's waving banner over a faint gold ring. While it stands every mobile
  troop (swordsmen, archers, fire mages, valkyries and the dark wizard)
  rallies to it: each still fights whatever is within its own reach
  (swordsmen whatever is within 2.5 cells), and otherwise marches down the
  banner's walking field (refreshed each second; standing buildings cost 40
  a cell, so troops go round them, and a banner beyond the wall draws them
  up to it), stops on a ring round it, and closes on the nearest enemy
  within 5 cells of it. Swordsmen forget their leash meanwhile. Dropping
  another banner moves it; pressing the planted banner and letting go where
  it stands takes it down, as does carrying it off the board, and dragging
  it elsewhere moves it. It draws nothing from the run's random stream, so a
  run without one replays exactly as before.
- **Necromancy** (`necromancy.ts`, `×∞`), a strike spell, is dragged from
  the same palette; while it is held a small pixel skull marks every grave
  on the board, and its aim shows a green ring of 3 cells, the skulls inside
  it brighter. Let go on the board, every enemy that died there in the last
  10 seconds (20, then 30 with the Smithy's Grave time; on open ground) rises as a friendly bone warrior
  (30 HP, 5 damage, times the Smithy's Risen HP and damage) that hunts the
  nearest enemy anywhere and crumbles after 60 seconds; at most 60 stand
  at once, and the spell is ready again 30 seconds later. Its Study paths:
  Bone archers (shooting from 4, then 5 cells, harder, then two at once),
  Soul weighing (each as strong as its enemy's difficulty over an orc's,
  from a quarter up to 3×, 6× or 12×) and Amalgam (one giant of all the
  fallen, 60%, 80% or all of their summed difficulty; cleaving from II,
  never crumbling at III).
- **Meteor strike** (`meteor.ts`, `×∞`), the second strike spell, is
  dragged from the same palette; its aim shows a dashed ember ring of its
  reach with a cross where it lands. Let go on the board, a meteor comes
  down 1.2 seconds later and bursts there: 120 damage at the middle falling
  to 40% at 2.5 cells (times the Smithy's Meteor damage and blast radius),
  sparing your own people, and the spell is ready again 40 seconds after
  the cast. Its Study paths: Starfall (3, then 5, then 7 fragments a
  little apart, landing one after another, each 55%, then 70%, of the
  damage over 55% of the reach), Molten core (a crater burning 5 s at 10
  a second over 70% of the reach, then 8 s at 16 over all of it, then 12 s
  and clinging) and Frost comet (an ice comet chilling all it hits for 3,
  then 5 seconds with a 25% wider blast, then freezing them solid for 1.5
  seconds first). Meteors in flight are drawn falling from the upper right
  on a trail of fire (or frost) over a growing shadow where they will land.
- **Frost nova** (`frost-nova.ts`, `×∞`), the third strike spell, aims with
  a dashed ice-blue ring and a pixel snowflake. Let go on the board, ice
  bursts out: every enemy within 3 cells (times the Smithy's Frost nova
  radius) except the unyielding is frozen solid for 2 seconds, and a patch
  of rime stays for 6 seconds (both times the Smithy's Frost nova
  duration), chilling everything in it and biting for 4 damage a second.
  Ready again 35 seconds after the cast. Its Study paths: Shatter (the
  frozen take 50% more damage until they thaw; then each bursts as it
  thaws, 30 damage over 1.2 cells; then 50 over 1.6, and one killed frozen
  or in the rime bursts too, its shards freezing what they hit for a
  second), Wandering blizzard (the rime lasts 10 s and drifts a cell a
  second toward the nearest enemy; then 12 s, a third wider and refreezing
  all inside for a second every 3 s; then 16 s, twice as fast, biting three
  times as hard) and Rime ward (your troops and townsfolk in the rime take
  35% less damage; then buildings in it take half; then troops in it heal
  6% of their health a second). Unlike Meteor's Frost comet nothing falls
  and nothing is blasted: the nova's work is the freeze and the rime.
- **Reinforcements** (`reinforcements.ts`, `×∞`), the fourth strike
  spell, aims with a faint gold ring of the ground they will hold and a gold
  chevron on each spot a soldier will land. Let go on the board, four
  soldiers drop out of the sky round the spot (0.8 s down a shaft of gold
  light; a spot inside a building stays empty), each 60 HP and 8 damage
  (times the Smithy's Reinforcement health and damage). They hold the post:
  fighting any enemy within 6 cells of it, walking back when none is near,
  and marching off after 30 seconds (times the Smithy's Reinforcement
  stay), not counted as lost troops. At most 40 at once. Ready again 45
  seconds after the cast. Its Study paths: Hammerfall (each lands with a
  shockwave, 20 damage within a cell; then 35 over 1.4 cells, staggering
  what it hits still for 1.5 s, the unyielding aside; then a champion lands
  in the middle too, four times as tough, 2.5 times the damage, cleaving,
  with an 80-damage quake over 2.5 cells), Muster the levy (seven drop;
  then nine, every third an archer shooting from 4 cells; then each who
  falls in battle is replaced once by a fresh one dropping in at the post)
  and Oathsworn (each takes 10% less damage for every other of its squad
  within 2 cells, up to 30%; then each kill adds 2 s to the whole squad's
  stay and heals the slayer 20%; then, when its time runs out or it falls,
  each fights on unhurtable for 4 more seconds).

- **Dark art** (`dark-art.ts`, the keep in `tower-art.ts`): the dark
  wizard keep is black obsidian on a stepped plinth, glassy black curtain
  walls in crimson mortar, a round turret at each corner crowned with a
  faceted ruby, dark flagstones ringed by a glowing crimson rune circle
  round an eight-sided obsidian spire tipped with a ruby, and a ruby-arched
  gate between crimson banners; as it is hurt, crimson fissures open in
  the obsidian over the usual damage stages. The dark wizard is an 11 × 13
  hooded figure in black and charcoal robes with crimson trim, rimmed in crimson light, burning
  crimson eyes and a black staff whose ruby flares as he casts, over a
  slowly turning crimson stain. Black lightning is drawn into one
  board-sized pixel buffer at 8 pixels a cell (`BoltBuffer`): each link a
  jagged Bresenham run of black core pixels (crimson-hot for its first
  instant) ringed by three levels of crimson glow that shrink as the bolt
  fades, with short forks, a flare where it was cast and a bright crimson
  spark on every third enemy struck. Only the changed box is cleared, coloured and
  copied to the canvas, which is drawn once a frame with smoothing off, so
  a chain through hundreds of enemies costs a few pixel writes a link.
  Bolts tint the ground crimson (`darkLights`).
- **Valkyrie art** (`valkyrie-art.ts`): the valkyries are 11 × 9 pixel
  sprites (white wings spread round a steel cuirass and a gold helm, inside
  a black outline) with a gold-bladed spear pointing where they last
  charged. A charge leaves a blazing gold streak down its line, white-hot
  at the core and narrowing as it fades, with speed lines, gold
  after-images of her along the way, a star flaring at the spear's tip, a
  ring where she lands and a spark on every enemy run through; the streak
  lights the streets. A guarded valkyrie wears a shimmering gold halo.

## Weather and light (`weather.ts`, `lighting.ts`)

- Areas (`areas.ts`) change every twenty waves: Mossbound Ruins, Amber
  Desert, Ember Forge, Drowned Temple, Fungal Hollow, Frozen Vault, Violet
  Geode, Obsidian Crypt, Astral Sanctuary and Nadir, repeating after wave 200. Selected starting
  waves preview their own area. Ground and connected wall cap/face textures
  crossfade over three seconds, with matching wave button and list colors.
  `area-enemies.ts` supplies themed pools; Nadir permits every normal wave species. Offspring remain parent-only. Unspendable area-budget remainders are discarded. Nadir uses crypt masonry with a dark violet floor wash. Frozen Vault (101-120) includes all ship tiers, Ice Golems (240 HP, cost 80, double fire/explosion damage) and Sliding Ice Cubes (45 HP, cost 10, cardinal slides at 3.6 cells/second, meltable ice trails, immune to blast deflection). Both enemies have journal entries; kills award no currency.
- Every themed roster has at least 15 species; Frozen Vault has 20. The native
  additions below are affordable during their first visit and also eligible in
  Nadir. Costs are fixed difficulty:

  | Zone | Species and cost | Behavior |
  | --- | --- | --- |
  | Mossbound Ruins | Briarling 2, Moss Boar 6, Root Treant 18 | Fast sprouts, sturdy tusked raiders, slow trees releasing three briarlings |
  | Amber Desert | Dune Scorpion 6, Sun Scarab 12, Sand Vulture 5 | Short-range venom, a finite swarm shield, flying wall bypass |
  | Drowned Temple | Brine Crab 60, Lantern Jelly 40, Coral Guardian 240 | Tough crawlers, floating stinging jellies, finite shield support |
  | Fungal Hollow | Sporeling 30, Fungal Brute 180, Spore Moth 80 | Small poison clouds, brutes releasing three sporelings, airborne spores |
  | Violet Geode | Shardling 40, Crystal Sentinel 600, Prism Ray 200 | Fast crystals, shield support, flying shield support |
  | Astral Sanctuary | Star Wisp 150, Comet Hound 500, Astral Warden 5,000 | Fast fliers, fast ground hunters, heavy shield support |
  | Mossbound Ruins | Fern Mantis 3, Moss Troll 18, Lantern Hornet 9 | Fast melee hunter, regeneration, flying venom |
  | Amber Desert | Glass Jackal 10, Dune Tortoise 40, Dust Djinn 45 | Fast hunter, armored shell vulnerable to explosions, flying shield support |
  | Ember Forge | Cinder Imp 8, Slag Golem 60, Ember Moth 12 | Fire resistance, fire immunity with explosion weakness, flying fire resistance |
  | Drowned Temple | Kelp Stalker 80 | Regenerating kelp hunter |
  | Fungal Hollow | Cap Crawler 50, Mycelium Hulk 400, Rot Mite 10 | Spore clouds, regenerating heavy fungus, fast venomous mites |
  | Violet Geode | Geode Crab 300, Prism Moth 100, Shard Brood 450 | Armored shell vulnerable to explosions, fast flier, brood releasing three shardlings |
  | Obsidian Crypt | Crypt Hound 350, Grave Wisp 500 | Fast ground hunter, regenerating flying spirit |
  | Astral Sanctuary | Nova Moth 800 | Flying brood releasing two star wisps |

  Split parents reserve all their children against the wave cap. The small
  species can also appear directly in their zone's waves. Poison harms people,
  sparing buildings; finite shields absorb ranged hits within their radius,
  while melee bypasses them. Moss Trolls and Kelp Stalkers regenerate 3 HP per
  battle second, Grave Wisps 4 and Mycelium Hulks 6, up to their maximum health.
  Dune Tortoises and Geode Crabs halve physical damage, including lightning;
  explosions deal 1.5 times damage to tortoises and slag golems, twice to crabs.
  Cinder Imps take one quarter fire damage, Ember Moths half and Slag Golems
  none. These multipliers apply after ranged shields. An unspendable budget
  remainder is discarded without preventing random species selection.
  Each has distinct native pixel art, a journal
  portrait, counterplay notes and persistent discovery. No kill currency is added.
- Weather rolls at the start and on entering an area: Mossbound Ruins has
  30% rain, Drowned Temple 75%, Frozen Vault snow (a 30% stormy roll, and
  every boss night, make it a blizzard: dense wind-streaked flakes drawn
  under the units, so enemies stay clear), Amber Desert a sandstorm, Fungal
  Hollow mist, and the other dry or underground areas no rain.
- Ground weather (`atmosphere.ts`, drawn by `atmosphere-art.ts`): in the
  desert and the Fungal Hollow a per-cell field steps ten times a second.
  The wind (`windAt`) holds a compass heading, then eases to the next.
  Mist is fed outside the walls, drifts with the wind, swirls round blasts
  and moving projectiles (blasts also blow holes in it), and seeps through
  wall stones below 75% HP. Sand lies in great transverse dunes, crests
  about three tiles apart (`duneAt`, a field tiling every `DUNE_PERIOD`
  cells), that creep downwind at `DUNE_SPEED` (a twentieth of a cell a
  second, so a dune takes minutes to pass) and wrap round the board; walking
  units push the sand about, and outside the city it settles back into the
  dunes. It never passes standing wall, but pours through a breach,
  and sand banked deep enough against a house or structure (`SAND_PRESS`)
  crushes it a little each second until it collapses; walls, gates, ballista
  bastions and the keep stand firm. The
  dunes are drawn from one baked, black-outlined sprite tiled at the drift,
  recomposed only when it moves a whole pixel.
  Sand in the city at `CLEANUP_DEPTH` or more is a civilian job of the
  lowest priority, dropped whenever repairs are waiting. Grains and
  tumbleweeds (black-outlined pixel sprites) blow along the wind. Leaving
  the desert clears its sand. The field uses only exact arithmetic and no
  battle random draws; it is not saved. Ambient light and precipitation fade with the terrain.
  Reduce Motion snaps the transition and suppresses rain/snow animation.
  The city's lanterns and fires stay lit in all areas.
- **Every 10th wave is a boss wave**, for weather; Warlords spawn by affordability (a huge,
  crowned brute with its own health bar). Night fades in over ~2.5 s as the
  boss wave starts and lifts once it's cleared; a rainy run becomes night
  rain ("Storm").
- Swordsmen and civilians carry hand torches: small flickering pools that
  move with them, clipped to open ground so they never light a roof.
- Lights use the torch-light toolkit's candle colours, flicker and sway
  (`src/lighting.ts`, `src/torch-light.ts`). Each pool
  is baked once with occlusion, so walls and buildings cast shadows; an
  archer tower's fire ignores its own roof but is blocked by its four corner
  pillars, throwing four shadows into the street. Only lights near cells
  that fell or were rebuilt are rebaked, a few per frame.
- Units (soldiers, civilians and ground enemies) cast shadows away from the
  brightest light on their cell, looked up from a per-cell grid made during
  baking — a few batched rects per unit, cheap enough for hundreds.
- Light only lands on open ground: roofs and wall tops stay unlit, so the
  flames read as street-level rather than hovering over the buildings.
- Gravel stones on the streets catch the light: a bright lip toward the
  flame, a dark one away from it.
- A light goes out while its building is destroyed and returns when it's rebuilt.
- When a run is lost, every lantern, brazier, tower fire and hand torch
  gutters out one by one in a slow wave spreading out from the keep,
  leaving the city dark.
- Struck buildings, walls and the keep flash briefly.

## Drawing (`render.ts` and its passes)

- `DefendRenderer` owns the camera (zoom and pan) and runs each frame's
  passes in order. The city layer (`city-layer.ts`: flagstones, dirt
  streets, parks, ponds, walls, houses and structures, rubble, the shadows,
  lantern brackets) is painted once into an offscreen canvas, at 2–3× when zoomed in,
  and repainted only when a building falls or is rebuilt, the size or zoom
  band changes, or floor and wall art finishes loading.
- Over it each frame: park fences (`fences.ts`), building damage, unit
  shadows, the overcast and torchlight (`lighting.ts`), the keep's banner,
  scorches, then units, projectiles and effects (`battle-art.ts`), the
  trees (`park-trees.ts`), the wizards' fire, the building grid and drag
  overlay (`edit-overlay.ts`), and rain in screen space (`weather.ts`).
- `structure-art.ts` holds the keep art and draws the other structures'
  (`tower-art.ts`, `structurePixels`/`structureRubblePixels`) for the city
  layer and the palette icons, with the banner and the palette colours.
  `damage-art.ts` paints the damage stages and rubble over any sprite
  (`damage`, `rubblePixels`), the wall stones' overlays, and caches the
  sprites; `tests/defend-damage-art.test.ts` checks them.
  The keep (`keepPixels`) and banner (`flagPixels`, redrawn each frame) are
  pixel buffers at `ART` pixels a cell, drawn up with smoothing off;
  `tests/defend-keep-art.test.ts` checks them.
- **Wizard art** (`wizard-art.ts`): the flame is a continuous jet of
  particles, white-hot at the nozzle through yellow, orange and red to
  smoke, and lights the ground as it goes (through the carried lights, so
  it carves the darkness and warms the streets). The ice wave sows clusters
  of crystal shards in a ragged fan as its front passes; they grow, stand
  glittering, then shatter into glints, over a soft rime. Each shard is
  shaded as a faceted solid (two long facets and a bevelled tip) against
  one key light from the upper left, as the roofs are, with a specular
  glint, a lit rim and a dark edge on the far side, so every shard catches
  the light the same way; a flame nearby warms the facets facing it.
  Chilled enemies wear a frosty sheen.
- **Fire mage art** (`mage-art.ts`): the mages are 7 × 8 pixel sprites
  (pointed hat, red robe lit from the upper left, gold belt, a black
  outline) drawn up crisp, with a flame flickering in hand while the next
  fireball is ready. A fireball is a ball of fire inside a dark rim,
  white-hot at its heart, arcing low over the street with a trail of
  sparks cooling to smoke, and bursts in the usual blast. A blaze is a
  dithered scorch strewn with flaring embers, with tongues of pixel flame
  rising and dying back in new spots over it, thinning as it dies down;
  blazes and fireballs light the streets round them.
- **Ground relief** (`ground-relief.ts`): a bump map for the flagstones
  outside the city, cut from the art's brightness and baked into four
  facing masks. Each light (tower fires and lanterns baked once; wizard
  fire and ice, blasts and hand torches every frame) brightens the stone
  edges facing it and darkens those facing away, so light outside the
  walls reads as 3D.
- Between the city layer and the fences, **park life** (presentation only,
  off with the "Grass and water effects" setting):
  - `park-grass.ts`: a few clumps of pixel blades on every park cell (none
    under a tree's canopy or on a pond's shore), swaying in the wind, bowing
    under gusts that roll across the city, harder in the rain, and parting
    and pressing down around enemies, troops and civilians walking through,
    then wobbling back. Built in one pixel buffer at 8 pixels a cell, at most
    30 times a second.
  - `pond-water.ts`: in the rain, drops fall all over the open water, each
    a faint ring of pixels that spreads and fades. The bank, its trees and the houses beside it are
    mirrored into the water, cut from the city layer (and the trees' own
    canvas) about each column's
    shoreline and copied back in thin strips shifted by a faint shimmer and
    by every ring passing through, tinted by the water and masked to it.
  - `pond-ducks.ts`: when it isn't raining, a mallard pair paddles on the
    biggest pond and a hen with two or three ducklings on the next. They
    drift and bob, paddle to a spot nearby (now and then leaving a faint
    ring), tip up to dabble (a ring going under and coming up), preen; the
    hen keeps near the drake and ducklings trail their mother nose to tail;
    anyone walking close by sends them to the far side; at night they sleep,
    heads tucked. Each has a faint reflection.

## Economy (`progress.ts`, the Upgrades tab's Forge; `src/progression.ts`)

- The Smithy and Tiles shop sell for the Mine's Copper, Silver and Gold
  (`Price`), including bombs (`BOMB_PRICE`: one Copper). The Mine's
  workers/buildings and the Library's shelves/staff/lab also use this wallet
  (`save.smithy`), with Copper for early purchases and Silver/Gold added later.
  `src/metals.ts` shares affordability checks, payment and displayed prices.
  Battle kills award no currency. There is no battle Gold balance.
- City elements get more expensive with each one owned. Upgrades are
  universal (they apply to every building of that type) and take effect from
  the next run.
- Clearing a **new highest wave** awards exactly one upgrade point.
  `payWave` records `bestWave` with the payment; duplicate events and replayed
  waves award nothing, and a direct start never awards points for skipped waves.
  DEFEND pays no metals or Knowledge. Knowledge comes from the Library.
- **Smithy** (rows in the Upgrades tab's Forge; Training in code): a Smithy point (copper,
  silver or gold, from the mine's smithy) buys one rank of a row (a few
  percent on troop HP or damage, drill speed, tower damage or reload, bomb
  damage, wall or keep HP, rebuild speed). The mine's smiths
  work it: a minute of one smith for the first, each after 50% longer, shared
  by every smith on it.
- **Skills** (the Upgrades tab's Study): Command (garrison and towers) and
  Stewardship (walls, keep, builders, faster smithing, room for
  another smith), ranked skills bought with Knowledge.
- The Smithy and the skills fold into the run's `Bonuses`, fixed when the
  defense starts.

## Not saved

A run in progress isn't saved; leaving the tab pauses it and reloading ends
it. The layout, purchases, upgrades, bombs and best wave are saved.

`defendDebug(seconds, { rain }?)` in the console fast-forwards a running
battle, optionally forcing its weather.

### Segmented enemies and shields

Snakes have twelve individually targetable pixel segments. Dragons have sixteen
flying segments with wings; each head breathes a five-cell cone of flame that
hurts troops, civilians and buildings. Destroying a segment cuts its chain:
the surviving rear segment becomes an independent head, without healing or
creating additional enemies. Whole chains count against the 5,000-unit cap.

Shield Generators protect themselves and enemies within four cells from ranged
damage with a 3,000-HP shield. The hit that shatters it is absorbed; subsequent
hits damage the enemy. Invincible Shield Generators protect a five-cell radius
indefinitely. Swordsmen and valkyries bypass both shields. Arrows, explosions,
fire, and ice are blocked (including ice's chill). Overlapping invincible
shields take priority. Killing a generator removes its protection immediately.


Dark Knights (500 difficulty) resist freezing and crowd displacement and strike
all defenders in a forward crescent with a 1.6-cell reach. Kamikaze Orcs (120)
carry pixel dynamite and detonate within contact range in a two-cell radius.
Kamikaze Birds (350) fly over obstacles, descend for 0.6 seconds, then detonate
in a 2.5-cell radius; killing them during the dive prevents detonation.
Void Sparrows (5,000,000) create pixel black holes of diameter 1.5 tiles,
pulsing 300 damage every half-second for eight seconds, with a 15-second
casting cooldown. Hostile blasts and holes damage troops, civilians and
buildings, spare enemies and honour valkyrie guards.


Shield and poison generators have four difficulty tiers: 1,000, 10,000,
100,000 and 1,000,000. Their square bodies are respectively 3, 5, 7 and 9
pixels on the native eight-pixels-per-cell art grid (scaled with the board).
Both families have aura radii of 2, 4, 6 and 8 cells, and body HP of 200,
800, 2,400 and 6,000. Shield HP is 600, 3,000, 12,000 and permanent.
Poison clouds tint from translucent green through muted green and violet to
purple. They deal 2, 8 or 32 damage every 0.1 seconds at the lower tiers;
the million-difficulty cloud kills a player unit immediately on contact,
even during a valkyrie's guard. Poison affects people only and grants no
protection against ranged attacks. A dead generator loses its cloud.


The Defend header's pixel leather journal is available while building and
fighting. It groups discovered enemies by every zone where they appear (offspring
with their parent), sorted by difficulty within each zone. It lists only encountered enemies, including enemies killed between
frames, with stats and special abilities. Discoveries and read entries persist
in the Defend save; legacy saves start with an empty journal. A red pixel
exclamation marks unread discoveries. Opening the journal marks its entries
read and pauses the battle until the dialog closes (Close button or Escape).


Tough enemy healthbars can be toggled in the main Settings page or Defend's
settings cog, and the preference persists. Bars are enabled by default. They
require at least 100 difficulty and at least one quarter of the strongest
enemy cost in the actual randomly generated wave (including queued enemies).
The peak is retained until the next wave. Up to eight bars are drawn, highest
cost first and lowest remaining HP fraction next, with stable ID ties.
Dead enemies and linked body segments are excluded; independent chain heads
qualify. Turning the setting off also hides the old Warlord healthbar.


Additional enemies: Siege Beetle (400 difficulty) takes 25% damage from its
front and 150% from its rear. Burrowing Mole (200) tunnels beneath walls to
an open city street; its moving dirt mound is invulnerable until surfacing.
Necromancer (800) raises up to four nearby ten-second corpses, one every three
seconds, into weak skeletons that cannot be raised again. Banner Captain (700)
grants nearby enemies 25% speed and 30% attack damage within four cells;
auras do not stack and stop on its death. Mirror Knight (600) reflects 40%
of incoming arrow, cannon shell and fireball damage to the original soldier or tower; melee is safe.
Leech Swarm (150) heals by damage dealt to player units, never beyond max HP.
Ash Phoenix (1,200) leaves a 60-HP egg on its first death, reviving after five
seconds unless the egg is destroyed; the revived phoenix cannot lay another
egg. Blink Imp (250) shows a destination for 0.6 seconds before jumping up
to three cells, only landing in open cells. All have pixel art and journal
entries. Necromancer reserves five enemy slots and phoenix three; every
summon and revival also checks the lifetime 5,000-unit cap.


Magic boats have the same four tiers: Enchanted Skiff (1,000 difficulty;
1,500 HP), Spellbound Sloop (10,000; 7,000 HP), Arcane Galleon (100,000;
35,000 HP) and Deluge Ark (1,000,000; 160,000 HP), 1.4 to 3.8 cells long with
water 1.6, 2.4, 3.3 and 4.4 cells round the hull (`boats.ts`). A boat sails
in a straight line through the ground toward the keep, ignoring streets,
dropping a pool of its water every quarter second; each pool holds for
3.2 seconds, then dries up from its edge over 4.8, so a trail of water
follows it and evaporates behind it. Every house and structure the water
reaches is sunk at once: the water spreads over the whole of it and it
goes down into it amid bubbles and rings, leaving its rubble when the water
dries (sunk buildings can be rebuilt like any other). The skiff and sloop
can't sink wall stones or the keep: they ram them with the bow (40 and 120
damage every 1.2 seconds) until a stone breaks. The Arcane Galleon sinks
wall stones too and rams the keep; the Deluge Ark sinks the keep as soon as
its water reaches it, which loses the run. The water hurts nobody but fire
mages (10 damage a second while they stand in it). It puts out fires:
burning ground in it goes out, fireballs landing in it fizzle and the
wizard tower's fire can't burn an enemy standing in it. It stops splash
damage: cannon shells, bombs, fireballs and enemy bursts centred in it
fizzle with a hiss of steam, and a blast beside it spares whoever stands
in the water, enemy or defender. So cannons and bombs can't touch a boat;
arrows, blades, the valkyries' charge and black lightning can. The water
is pixel art like the parks' ponds (`flood-art.ts`): the same bands and
dither, the bank mirrored into it with the shimmer, rings off the wake and
the rain, crests and sparkles; standing walls and the keep rise out of it.
The boats are pixel sprites per heading (`boat-art.ts`): a planked hull
with rune-lit rails and a bow crystal, one to four masts with billowing
sails (cream, sea green, blue, violet), gold rails on the two biggest.


Living Fortresses have four tiers: Walking Bastion (1,000 difficulty; two
turrets, four legs, two armor plates), Living Fortress (10,000; four/six/four),
Walking Citadel (100,000; six/eight/six) and Dread Colossus (1,000,000;
eight/ten/eight). Body dimensions grow from 2.5 � 3 cells to 5.5 � 6, core HP
from 1,200 to 150,000, and component HP from 160 to 12,000 (armor has 1.5�
component HP). Each part has its own small hitbox and HP, follows the body,
and is individually targetable by existing attacks. Armor plates must all
be destroyed before the core takes damage. Every lost leg proportionally
reduces speed, down to 25% with none; destroyed turrets stop firing. Turrets
bombard player units and buildings every two seconds. Destroyed parts remain
charred sockets. Core destruction removes surviving parts; only the core counts
as a kill. The wave budget reserves all 9/15/21/27 components and spawning
checks room for the complete fortress before releasing it.


## Cannon attunements

The Cannon Tower branches into Gun Battery, Mortar Tower and Minelayer, each costing 4 Knowledge to attune and having three path ranks costing 4 / 4,004 / 16,004 Knowledge. These are individual building upgrades; existing cannon Forge/Training bonuses still apply.

- **Gun Battery:** grapeshot immediately: the main shell plus four surrounding blasts, each at 35% damage and half radius. Drilled crews / Powder crews / Master gunners reduce reload time by 15% / 25% / 50% relative to the ordinary cannon.
- **Mortar Tower:** every impact leaves burning ground for 4 seconds, at 25% of its impact damage per second. Initially ordinary impact damage and 25% longer reload; Incendiary shot increases impact and burning damage by 80% with 50% longer reload; Powder charge enlarges blast and burn radii by 50%; Earthshaker triples both damage values relative to the unupgraded mortar and adds 3 cells of range. Ground fire uses the existing enemy-only, ground-only Blaze system, including water/rime/ice interactions, without receiving Mage Guild research. Impact retains cannon friendly fire unless cannon safety is unlocked.
- **Minelayer:** fires on the normal cannon cadence even without enemies, placing mines on open dry ground at half range (5.5 simulation cells). Mines arm after 0.5 seconds and explode when a ground enemy comes within 0.75 cells, using ordinary cannon damage/radius and safety rules. Mines persist for the battle. Capacity is per tower and includes shells in flight; the tower waits at capacity. Directed laying unlocks aiming at rank I (15 mines); Expanded magazine raises capacity to 30; Smart charges raises it to 50 and lets mines walk at 0.5 cells/s toward ground enemies detected within 3 cells. They respect obstacles, water and their original laying range.

During battle, select an upgraded Minelayer and drag from its tower or selected crosshair to direct future shots within a 1-cell-radius target disk, clipped to laying range. Drag back onto the tower to restore random full-range coverage; its crosshair expands to the range perimeter. Crosshairs show only while selected. Pointer cancellation or a second finger cancels an uncommitted preview; two fingers still pinch. Build-mode movement and hold-to-open trees remain available. Aiming resets for each battle and is not saved.

C4 Nanobots now requires one fully upgraded building from each of the three attunements. Existing C4 Nanobots and saved Gun Battery/Mortar ranks remain owned. [Accepted specification](upgrades/CANNON_ATTUNEMENTS.md).


## Mage Guild troop attunements

The Mage Guild has three attunements, each costing 5 Knowledge with path ranks costing 5 / 5,005 / 20,005 Knowledge. Each trains a mage troop family with ordinary mage HP, movement and 2.1-second casting cadence. Purchases affect the next battle through each home building's snapshot.

| Attunement | Attuned / I / II / III |
| --- | --- |
| **Storm Hall — Stormcallers** | Casting range 9/11/13/15 cells; 3/4/6/8 distinct enemies; jump distance 3/3.5/4/4.5 cells; independent critical chance 10/15/25/35%, dealing double damage. Each link retains 85% of the prior non-critical damage. Lightning replaces fireballs and can hit fliers. |
| **Inferno Hall — Pyromancers** | Impact and burn DPS multipliers 1/1.4/1.8/2.3; blast and ground-fire radius multipliers 1.25/1.35/1.5/1.8; ground fire lasts 4/5/6.5/8 seconds before Forge bonuses; clinging fire lasts 2/2.5/3/4 seconds. Casting range stays 4.5 cells. Every tier burns the full blast area and ignites victims, including airborne impact victims. |
| **Frost Hall — Cryomancers** | Casting range 5.5/6/6.5/7 cells; blast radius multipliers 1/1.15/1.3/1.6; 50/55/60/65% slowing for 2/3/3.5/4 seconds and a 0.35/0.5/0.75/1-second freeze starting at impact. Direct damage is 75% of ordinary mage damage. No fire is produced. |

Chills use the strongest active mage slow without multiplying duplicate mage effects. A weaker effect can remain after a stronger one expires; freezes refresh their maximum remaining duration rather than adding time. Existing unyielding immunity, shields, damage protection and fire/ice cancellation remain. Elemental effects spare friendlies. Fire uses existing water extinguishing and ground-fire interactions; clinging burns refresh without stacking duplicate statuses. Mage upgrades do not grant Wizard Tower, Dark Wizard or strike-spell research effects.

Existing `infernoHall`/`pyroclasm` saves retain their purchased ranks with the combined fire abilities. `cinderHall`/`cinders` retain their saved IDs and ranks but display Frost Hall/Cryomancy. `stormHall`/`conduction` is the new third branch. The existing mageFireball Forge upgrade is labeled **Spellpower**, applying direct damage to every family and radius to Fire/Frost. Lingering embers still applies to fire only. The Mage Guild's ultimate is still undefined. [Approved specification](upgrades/MAGE_GUILD_ATTUNEMENTS.md).
