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

- 9 × 13 **tiles**, each subdivided into 7 × 7 **cells** (63 × 91 cells).
  Tiles are the unit the player builds with; cells are the unit the
  procedural city, walls, pathfinding and simulation work in.
- The top tile row is the enemy **spawn lane** — nothing can be built there.
- The board scales to the largest 9:13 size that fits on screen without
  scrolling. Open ground uses the mossy flagstone tiles
  (`public/assets/defend/floor-*.png`), one random variant per tile, never
  rotated (their baked-in lighting looks wrong turned) and grown 15% to close
  the gaps between them.

## Layout of the page

- One header row, never two. Building: City · Armory · Start the defense on
  the left; best wave and the ⚙ DEFEND settings (palette side, reset zoom) on
  the right. During a battle: Abandon (click twice — it asks "Confirm?") and
  the speed toggle (1× ⇄ 2×, plus 3× once War drums is bought in the
  Armory) on the left; weather, wave, best, keep health and foes on the right.
- The board's view fills the room under the header, so the page never
  scrolls; unzoomed it fits the whole city, centred on dark ground. `☰ Build`
  (building) and `☰ Items` (in battle) slide the palette in beside the view,
  which narrows to make room while the board keeps its scale (like the Mine's
  Crew list). The palette starts open while building and closed in battle.
  Scroll-wheel or pinch zooms (up to 6×); dragging open ground pans. Messages
  float over the board's foot.

## Building (before a run)

- The **palette** (left by default; the ⚙ settings move it to the right) lists
  city tiles, barracks, archer barracks, Mage Guilds, Valkyrie palaces, dark wizard keeps, monster bait, city gates and the towers with an `×N` count of
  what is owned but not yet placed; it greys out at `×0`. The button at its
  head (`☰ All`) opens a list of categories, and the palette shows only the
  one picked: **All**, **Towers** (archer, cannon, watch and wizard towers),
  **Units** (barracks, archer barracks, Mage Guild, Valkyrie palace, dark
  wizard keep) or **City** (city tiles, monster bait, city gates;
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
- Drag from the palette onto the board. While dragging, every tile that would
  accept the item gets a faint gold outline and every other tile darkens; the
  hovered tile shows exactly where the building will be fitted.
- Placed things can be dragged to another tile, or back onto the palette /
  off the board to pick them up again.
- **City tiles** must touch the city orthogonally (the keep counts as one).
  The player starts with 8 — enough for a 3 × 3 city around the keep. A tile
  can only be lifted if the city stays connected and it holds no buildings.
- **The keep** can be moved onto any other city tile (the two swap) but never
  removed.
- **Barracks**, **archer barracks**, the **Mage Guild**, the **Valkyrie palace** and the **dark wizard keep** must be inside the city. **Archer**, **cannon**, **watch
  and wizard towers** and **monster bait** may stand inside or outside.
- Every structure takes a **share of its tile** (`size` in `catalog.ts`, in
  sixteenths): 1/16 the archer and watch towers and monster bait, 1/8 the cannon and wizard
  towers, 1/4 the barracks, archer barracks and Mage Guild, and the Valkyrie
  palace a whole tile (1/2 once Folded halls is bought, which also shrinks
  it from 5 × 5 cells to 3 × 5). Several structures share a tile while
  their shares add up to no more than a whole tile and they all fit.
- The **dark wizard keep** is the one structure bigger than a tile: it
  fills a whole 2 × 2 block of city tiles (`span` 2), standing on 12 × 12
  of their 14 × 14 cells, and nothing else can stand on any of the four.
  Its saved tile is the block's top left one. While it is dragged, the
  block centred nearest the pointer is framed whole, gold where it fits
  and red where it won't, and every tile some legal block covers stays
  lit. The pricey Folded sanctum folds it onto a single tile (5 × 5
  cells, the whole tile). Taking away any tile it stands on returns it to
  the palette.
- The game picks each structure's exact cells (`fitLayout`): the keep in
  the middle of its tile; everything else in a random free **spot** on its
  tile, never touching another structure (there's always room for a
  street), and every in-city structure must still reach the keep's
  streets. The structures on a tile are fitted together, biggest first,
  rearranged until they all fit, and whenever something is dropped on a
  tile everything on it is reshuffled into fresh spots (each structure's
  saved `spot`, drawn from the layout's `rolls`). A save whose buildings
  no longer fit (from before tile shares, say) is reshuffled, and failing
  that its newest buildings go back to the palette.

## The procedural city (`citygen.ts`)

- The **wall** is 2 cells thick and sits just *outside* the city tiles, so
  every city tile keeps its full 7 × 7 interior. The board edge is
  impassable, so no wall is built along it.
- Wall art is cut from two sprites: each wall cell shows a 16 px window of
  the mossy cap-stone run in `wall-cap.png` (x 38–54, continuing down the
  run), and any stone with open ground or a breach to its south hangs a strip
  of the brick face from `wall-face.png`. Because it is per cell, breaches
  just show rubble with broken edges around them.
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
  mix and don't split again. Each pays its own Gold.
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
- **Barracks** keep up to N swordsmen alive, training a replacement every
  few seconds after one dies. Swordsmen stay inside the walls and fight
  whatever gets in (troops can't pass walls — a palisade gate is a future
  upgrade; troop pathing is plain A* over open cells, so gates only need to
  change what counts as open).
- **Archer barracks** train archers (same garrison size, drill speed and
  arms upgrades as the swordsmen's barracks). Archers wander random city
  streets and stop to shoot anything within their short sight (3 cells,
  widened by Keen eyes). The pricey one-off Hunter's instinct makes them
  path toward the nearest enemy in the city instead, stopping at bow range.
- **Mage Guilds** (`mages.ts`) train fire mages (same garrison size, drill
  speed and arms upgrades as the barracks). Mages wander the streets like
  archers and, when an enemy comes within 4.5 cells, stop and hurl a
  fireball at where it stands. It bursts with splash damage (full at the
  centre, 40% at the edge, fliers too) that spares your own people, and
  leaves a **blaze**: burning ground that hurts every ground enemy inside it
  each second until it dies down (fliers pass over). Upgraded by Pyroclasm
  (fireball damage and burst) and Lingering embers (how long and how hot
  the ground burns) in the Armory.
- **Valkyrie palaces** (`valkyries.ts`) train valkyries (same garrison
  size, drill speed and arms upgrades as the barracks): armoured angels with
  spears who path toward the nearest enemy in the city, or stroll the
  streets. When an enemy comes within her reach she makes a **charge stab**:
  she blinks along the line toward it, as far as her reach (3 cells, longer
  with Long spears) or until an intact building, the city wall, a pond or
  the board's edge stops her, and her spear hurts every enemy on that line,
  fliers too. For a second after each charge nothing can hurt her
  (`guard`), blasts included.
- **Dark wizard keeps** (`dark-wizards.ts`) each summon one **dark
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
  speed for a few seconds). Upgraded by Pyromancy and Rime in the Armory.
  Neither draws from the run's random stream; how they look is the
  renderer's (`wizard-art.ts`).
- **Archer towers** shoot the nearest enemy in range. **Watch towers** mark
  enemies in their radius with a gold outline; marked enemies take ×2 damage.
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
  or civilian is within 1.6 cells and close behind them (`DefendRenderer`,
  presentation only).
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

- Battles are always fought under cloud (a light grey overcast), so the
  city's lights are always lit: lanterns hung on house walls, braziers at
  the keep's corners, a lamp at each barracks door, and fires inside archer
  and watch towers. 30% of runs are also rainy for the whole run.
- **Every 10th wave is a boss wave**, for weather and rewards; Warlords spawn by affordability (a huge,
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

## Economy (`progress.ts`, Armory tab; `src/progression.ts`)

- The Armory sells with copper, silver and Gold, all earned in battle: each
  kill pays Gold (`KILL_GOLD`), each wave held pays Gold (10 + 5 × the wave)
  and copper, and each boss wave held pays a silver for every ten waves. Gold is paid as enemies fall, so an
  abandoned defense keeps what it earned.
- City elements get more expensive with each one owned. Upgrades are
  universal (they apply to every building of that type) and take effect from
  the next run.
- Reaching a **new best wave** is recorded (`bestWave`) and pays Knowledge: one
  for each wave held past the best before it, three for a boss wave, and an
  upgrade point for each.
- **Smithy** (Upgrades tab; Training in code): a Smithy point (copper,
  silver or gold, from the mine's smithy) buys one rank of a row (a few
  percent on troop HP or damage, drill speed, tower damage or reload, bomb
  damage, wall or keep HP, rebuild speed, or Gold found). The mine's smiths
  work it: a minute of one smith for the first, each after 50% longer, shared
  by every smith on it.
- **Skill trees** (Upgrades tab): Command (garrison and towers) and
  Stewardship (walls, keep, builders, Gold, copper, faster smithing, room for
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
fighting. It lists only encountered enemies, including enemies killed between
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
charred sockets. Core destruction removes surviving parts; only the core pays
kill rewards. The wave budget reserves all 9/15/21/27 components and spawning
checks room for the complete fortress before releasing it.
