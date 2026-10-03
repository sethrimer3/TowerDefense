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

- **City.** Drag city tiles, barracks, archer barracks, Mage Guilds and archer, cannon, watch and wizard towers from the palette onto the gold-outlined tiles. City tiles must touch the city; the wall moves out to enclose them. Placed things can be dragged elsewhere or back to the palette. Scroll or pinch to zoom, drag open ground to pan.
- **Start the defense.** Waves roll in without stopping (a short breather after each) until the keep falls. Every 10th wave is a boss wave fought at night. Civilians rebuild what the enemy smashes; bombs (bought in the Armory) can be dragged onto the field mid-battle.
- **Wizard towers** alternate a flamethrower, which lights up the ground around it, and a wave of ice shards that chills (slows) everything it crosses.
- **Mage Guilds** train red fire mages who roam the streets hurling fireballs: each bursts with splash damage and leaves the ground burning, scorching whatever walks through.
- **Rewards.** Each kill pays Gold. Each wave held pays Gold and copper; boss waves also pay silver. Every wave held past your best pays **Knowledge** (three for a boss wave) and an **upgrade point**.
- **Armory** (Defend tab). Buy more city elements, bombs, the 3× battle speed, and upgrades for every building of a type, with copper, silver and Gold.
- **Upgrades tab.**
  - **Smithy:** every hundred copper, silver or gold bars the mine's smiths work make a Smithy point of that metal. A point buys one rank of a row (troop HP and damage, drill speed, tower damage and reload, bomb damage, wall and keep HP, rebuild speed, Gold found): copper for a row's first ten ranks, then silver, then gold. A smith works the rank on the wall clock (a minute for the first, each after 50% longer); more smiths on it share the time, and a smith on a rank stays at the smithy until it's done.
  - **Skill trees:** Command (the garrison and its towers) and Stewardship (walls, the keep, builders, Gold, copper, faster smithing and room for another smith), bought with Knowledge. Tap a node to read it, tap again to buy a rank.
  - Everything bought here applies from the next defense.
- **Settings.** Reduce motion, the grass and water effects, Dev mode and free purchases, and erasing progress.

The city is alive between and during battles: park grass sways in the wind (harder in the rain) and parts around anyone walking through it; ponds, trees, roofs and dirt streets are drawn as pixel art, with grass growing unevenly over the street edges and crisp shadows cast from a height map (the city wall's falling across the roofs beside it); trees stand over the units and fade while anyone is under them; ponds reflect their banks, trees and houses and ripple faintly all over when it rains, and in dry weather a few ducks paddle, dabble, preen and shy away from passers-by; lanterns, braziers and hand torches light the streets under cloud and at night (and when the keep falls, crumbling through four damaged stages to rubble, they go out one by one in a wave from it), and outside the walls the flagstones have a bump map, so every fire, blast and ice wave catches their edges.

## How it's built

- `src/defend/` is the game: the layout and its fitting (`layout.ts`), the procedural city (`citygen.ts`), the deterministic battle (`sim.ts`, with `enemies.ts`, `troops.ts`, `mages.ts`, `civilians.ts`, `towers.ts`, `pathing.ts`), drawing (`render.ts` and its passes: `city-layer.ts`, `lighting.ts`, `battle-art.ts`, `wizard-art.ts`, `mage-art.ts`, `ground-relief.ts`, `park-art.ts`, `park-trees.ts`, `ground-art.ts`, `shadow-art.ts`, `roof-art.ts`, `park-grass.ts`, `pond-water.ts`, `pond-ducks.ts`, `fences.ts`, `edit-overlay.ts`, `structure-art.ts`, `tower-art.ts`, `damage-art.ts`, `weather.ts`), the pointer state machine and drag sessions, and the page (`ui.ts`). See `docs/DEFEND.md`.
- `src/mine/` is the idle Mine: a falling-sand world from a seed with water, gravel, loose dirt and lava (`world.ts`), the surface buildings and their levels (`buildings.ts`), the crew's work and trades, building upgrades, warehouse supplies and rebuilds, carts, hoist, forge and smithy, the day and night shift, weather, floods, fires and miners' deaths, and moving on to a new prospect (`sim.ts`), the miners' names (`names.ts`), their figures and outfits (`figures.ts`), the effects (`particles.ts`), its lit pixel drawing (`render.ts`) and the tab with the crew list (`ui.ts`).
- `src/library/` is the Library: a cathedral nave filled with bookshelves and librarians, earning Knowledge (shelves × librarians an hour, idle too). Librarians wheel in planks to build bought shelves from outlines, wheel books in and out down two side hallways, and fight table fires with buckets (`sim.ts`, the fire grid in `fire.ts`, positions in `geometry.ts`), drawn with torchlit stone relief, stained glass in an oak frame, stars, god rays and flames (`render.ts`), and its tab (`ui.ts`).
- `src/progression.ts` holds the Smithy's upgrades, upgrade points, the skill trees' effects and a defense's rewards, folded into the `Bonuses` the battle reads; `src/skill-trees.ts` the trees; `src/save.ts` the save.
- `src/lighting.ts`, `src/torch-light.ts` and `src/visibility.ts` are the torch-light toolkit (flicker, sway, candle colours, occlusion-aware baked glow, visibility polygons) that Defend's lights are built on.
- `src/ui/` holds the shell, the Upgrades page (the Smithy and skill trees, with `src/tree-particles.ts` and `src/training-particles.ts`) and Settings. `src/style.css` lays the pages out and `src/theme.css` dresses them as the keep: stone, oak, iron, brass and parchment, from the small tiling SVGs in `assets/theme/`, and animates presses, purchases and wins. `src/ui/flourish.ts` throws the sparks and glints over the page, and `src/sound.ts` synthesizes every sound with Web Audio (no sound files).

## Deploying

`.github/workflows/static.yml` runs the tests and the build on every push to `main` and deploys `dist/` to GitHub Pages. In the repository's **Settings → Pages**, the source must be set to **GitHub Actions**.
