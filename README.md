# Tower Defense

A mobile-first city-defense game. You lay out a walled city on a 9 × 13 board, then hold it against waves that keep coming until the keep falls. Between defenses you spend what the battles earned: city elements and upgrades in the Armory, the Smithy's timed upgrades (worked by the mine's smiths), and the skill trees. Canvas draws the board; plain DOM provides the pages. No backend, no game engine, no framework; progress is kept in `localStorage`.

Play it on GitHub Pages: <https://sethrimer3.github.io/TowerDefense/>

## Run

Use Node.js 22.18+ (CI uses 24) and npm:

```sh
npm install
npm run dev      # http://127.0.0.1:5173/
npm test
npm run build    # dist/
npm run preview
```

## How to play

- **City.** Drag city tiles, barracks, archer barracks, Mage Guilds, Valkyrie palaces, dark wizard keeps, monster bait, city gates and archer, cannon, watch and wizard towers from the palette onto the gold-outlined tiles. The button at the palette's head picks what it shows: All, Towers, Units or City. City tiles must touch the city; the wall moves out to enclose them. Placed things can be dragged elsewhere or back to the palette. Scroll or pinch to zoom, drag open ground to pan.
- **Start the defense.** Waves roll in without stopping (a short breather after each) until the keep falls. Every 10th wave is a boss wave fought at night. Civilians rebuild what the enemy smashes; bombs (bought in the Armory) can be dragged onto the field mid-battle, and the war banner (never used up) can be planted anywhere to rally every troop to it; tap it to take it down.
- **Wizard towers** alternate a flamethrower, which lights up the ground around it, and a wave of ice shards that chills (slows) everything it crosses.
- **Buildings take a share of their tile**: 1/16 (archer and watch towers, monster bait), 1/8 (cannon and wizard towers), 1/4 (barracks, archer barracks, Mage Guilds), 1/2 or a whole tile (the Valkyrie palace). Several can share a tile while they fit, each in a random spot, and dropping one on a tile reshuffles everything on it.
- **Valkyrie palaces** take a whole tile (half with Folded halls) and train armoured valkyries, who charge-stab: a golden blink down a line that hurts every enemy on it, stopping at buildings and the wall, after which nothing can hurt her for a second. Long spears lengthens the charge.
- **Dark wizard keeps** fill a 2 × 2 block of city tiles (a single tile with the pricey Folded sanctum). Four corner turrets hurl black lightning that chains through up to 5 enemies, and the keep summons one dark wizard, the ultimate unit, whose bolts chain through 50 enemies packed close together (up to 250 with Conduit of night; Arc span lets them leap further).
- **City gates** go in the wall, on the edge of a city tile where the wall runs: a gatehouse whose doors swing open to let your troops and townsfolk out and in, and stay barred against the enemy, who must batter them down. A gate whose edge stops being wall (a city tile added across it, or its own tile taken away) goes back to the palette.
- **Monster bait** is a stack of crates that draws every enemy: while any stands, each enemy goes for the nearest one before the keep (fliers, siege engines and boats too), and houses lure nobody. A fallen stack stays fallen unless Restocking lets civilians rebuild it (once a level), and with Powder kegs it bursts as it falls and sets the ground round it burning.
- **Mage Guilds** train red fire mages who roam the streets hurling fireballs: each bursts with splash damage and leaves the ground burning, scorching whatever walks through.
- **Rewards.** Each kill pays Gold. Each wave held pays Gold and copper; boss waves also pay silver. Every wave held past your best pays **Knowledge** (three for a boss wave) and an **upgrade point**.
- **Armory** (Defend tab). Buy more city elements, bombs, the 3× battle speed, and upgrades for every building of a type, with copper, silver and Gold.
- **Upgrades tab.**
  - **Smithy:** every hundred copper, silver or gold bars the mine's smiths work make a Smithy point of that metal. A point buys one rank of a row (troop HP and damage, drill speed, tower damage and reload, bomb damage, wall and keep HP, rebuild speed, Gold found): copper for a row's first ten ranks, then silver, then gold. A smith works the rank on the wall clock (a minute for the first, each after 50% longer); more smiths on it share the time, and a smith on a rank stays at the smithy until it's done.
  - **Skill trees:** Command (the garrison and its towers) and Stewardship (walls, the keep, builders, Gold, copper, faster smithing and room for another smith), bought with Knowledge. Tap a node to read it, tap again to buy a rank.
  - Everything bought here applies from the next defense.
- **Settings.** Reduce motion, the grass and water effects, dev options (ALL ON, unlimited money, all towers, instantaneous research, all research per tab, and adding an hour of idle time), and erasing progress.

The city is alive between and during battles: park grass sways in the wind (harder in the rain) and parts around anyone walking through it; ponds, trees, roofs and dirt streets are drawn as pixel art, with grass growing unevenly over the street edges and crisp shadows cast from a height map (the city wall's falling across the roofs beside it); trees stand over the units and fade while anyone is under them; ponds reflect their banks, trees and houses and ripple faintly all over when it rains, and in dry weather a few ducks paddle, dabble, preen and shy away from passers-by; lanterns, braziers and hand torches light the streets under cloud and at night (and when the keep falls, crumbling through four damaged stages to rubble, they go out one by one in a wave from it), and outside the walls the flagstones have a bump map, so every fire, blast and ice wave catches their edges.

## How it's built

The current stress-test measurements and reproduction steps are in [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

The tower-and-effects stress scene, frame overlay and before/after rendering measurements are in [docs/DEFEND_FRAME_TIMES.md](docs/DEFEND_FRAME_TIMES.md). `defendFrameTimes(true)` in the browser console shows update, entities, effects, terrain and UI timings. Ground-light masks and scorch sprites are cached without rounding their positions, combat pixels are reused between simulation ticks, and tiny effect sprites are baked in software to avoid GPU readbacks. The night's darkness and glow are summed per light on a small field and drawn up to the board once, rather than drawing every light's pool scaled up, and the trees are shaded only within their own box.

- **Current performance experiment:** waves contain 500, 1,000, 1,500… enemies, released over five seconds. Bosses are included in that count; a Mother's brood adds extra enemies. The browser console logs `[Defend performance]` every five seconds and at each wave's end, with recent rows in `window.defendPerformance` (not saved). `npm run test:performance` runs the isolated 20-count browser benchmark against the dev server; set `PERF_SCENE=city` for combat congestion and `PERF_REALTIME=1` for real-time playback. Results go to `test-results/`. `src/defend/performance.ts` measures frame/update/draw timings; crowd separation uses bounded neighbor sampling and the renderer reuses crowd shadows between simulation ticks.

- `src/defend/` is the game: the layout and its fitting (`layout.ts`), the procedural city (`citygen.ts`), the deterministic battle (`sim.ts`, with `enemies.ts`, `troops.ts`, `mages.ts`, `valkyries.ts`, `dark-wizards.ts`, `siege.ts`, `boats.ts`, `bait.ts`, `civilians.ts`, `towers.ts`, `pathing.ts`), drawing (`render.ts` and its passes: `city-layer.ts`, `lighting.ts`, `light-field.ts`, `battle-art.ts`, `projectile-art.ts`, `wizard-art.ts`, `mage-art.ts`, `valkyrie-art.ts`, `dark-art.ts`, `siege-art.ts`, `boat-art.ts`, `flood-art.ts`, `gate-art.ts`, `tile-art.ts`, `ground-relief.ts`, `park-art.ts`, `park-trees.ts`, `ground-art.ts`, `shadow-art.ts`, `roof-art.ts`, `park-grass.ts`, `pond-water.ts`, `pond-ducks.ts`, `fences.ts`, `edit-overlay.ts`, `structure-art.ts`, `tower-art.ts`, `damage-art.ts`, `weather.ts`), the pointer state machine and drag sessions, and the page (`ui.ts`). See `docs/DEFEND.md`.
- `src/mine/` is the idle Mine: a falling-sand world from a seed with water, gravel, loose dirt and lava (`world.ts`), the surface buildings and their levels (`buildings.ts`), the crew's work and trades, building upgrades, warehouse supplies and rebuilds, carts, hoist, forge and smithy, the day and night shift, weather, floods, fires and miners' deaths, and moving on to a new prospect (`sim.ts`), the miners' names (`names.ts`), their figures, outfits and poses (`figures.ts`), the beats of their work and their idle habits (`acts.ts`), the effects (`particles.ts`), the buildings' and headframe's pixel art (`art.ts`), its lit pixel drawing at two pixels a cell (`render.ts`) and the tab with the crew list (`ui.ts`).
- `src/library/` is the Library: a cathedral nave filled with bookshelves and librarians, earning Knowledge (built shelves × professors an hour, idle too). Each librarian has a role set in the Staff list: shelvers wheel in planks to build bought shelves from outlines, wheel books in and out down two side hallways and fight table fires with buckets; professors read each book once and put it on the return shelf, to be wheeled out for fresh ones; researchers work the alchemy lab under the nave, one for each level the lab is expanded to (up to five, its annexes opening as it grows), needed for the skill trees' Knowledge research (`sim.ts`, the lab's errands in `lab.ts`, the fire grid in `fire.ts`, positions in `geometry.ts`), drawn with torchlit stone relief, stained glass in an oak frame, stars, god rays and flames (`render.ts`, the shared ashlar and its bump lighting in `ashlar.ts`) over a firelit, bump-lit cellar of athanor, alembic, cauldron and homunculus with its annexes and a black cat (`lab-render.ts`), and its tab (`ui.ts`).
- `src/progression.ts` holds the Smithy's upgrades, upgrade points, the skill trees' effects and a defense's rewards, folded into the `Bonuses` the battle reads; `src/skill-trees.ts` the trees; `src/save.ts` the save.
- `src/lighting.ts`, `src/torch-light.ts` and `src/visibility.ts` are the torch-light toolkit (flicker, sway, candle colours, occlusion-aware baked glow, visibility polygons) that Defend's lights are built on.
- `src/ui/` holds the shell, the Upgrades page (the Smithy and skill trees, with `src/tree-particles.ts` and `src/training-particles.ts`) Settings, and the welcome-back screen (`welcome.ts`: on opening the game, up to 24 hours away and the Knowledge and Smithy points the Library and the Mine made of it; `src/away.ts` holds the cap). `src/style.css` lays the pages out and `src/theme.css` dresses them as the keep: stone, oak, iron, brass and parchment, from the small tiling SVGs in `assets/theme/`, and animates presses, purchases and wins. `src/ui/flourish.ts` throws the sparks and glints over the page, and `src/sound.ts` synthesizes every sound with Web Audio (no sound files).
- `scripts/pixel-font/` draws Alembic, the game's pixel font: its glyphs are rows of pixels in `glyphs.txt`, which `npm run font` traces into `assets/fonts/Alembic/` (a regular and a bold). The Use Custom Font setting (on by default) sets every word in it; off, the page uses Cinzel.

DEFEND lightning buffers clear and colour only occupied pixels, avoiding scans across empty space between distant bolts. The rendering regression checks compare their pixels against the original renderer.

DEFEND also indexes nearby defenders during enemy turns, selects only the eight displayed health bars, and reuses boat-water pixel storage to reduce allocation and copying.

## Deploying

`.github/workflows/static.yml` runs the tests and the build on every push to `main` and deploys `dist/` to GitHub Pages. In the repository's **Settings → Pages**, the source must be set to **GitHub Actions**.
