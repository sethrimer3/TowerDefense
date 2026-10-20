# Pixel-art migration inventory

Read the [style guide and setting contract](PIXEL_ART_GUIDE.md) first. This is a source-audited work list, **not a list of approved or completed new sprites**. Snapshot: commit `a4e07e0`, the Pixel Art setting/Tower Delve PNG merge. Refresh the catalog appendices when gameplay adds an element.

Implementation update: [batch 01](BUILDING_BATCH_01.md) converts the keep, barracks and watch tower; [batch 02](BUILDING_BATCH_02.md) adds the melee/ranged guilds, archer barracks and archer/cannon towers; [batch 03](BUILDING_BATCH_03.md) adds Assassins' den, Sniper lodge, Musket hall, Wizard tower, Mage Guild and Monster bait. All include shared UI/placement appearances. The catalog snapshot is unchanged. Units and enemies are deferred at the user's request; their unchecked rows remain future work.

Legend: **Audit/redraw** = PNG exists, but style/density/states still require review; **Create** = no registered PNG replacement for this family; **Integrate** = the setting, scale, cache or cross-screen routing still needs work. Every unchecked item remains pending. Existing legacy artwork stays available when Pixel Art is off.

## A. Shared foundation and integration

| ID | Work item | Current source / acceptance requirement |
| --- | --- | --- |
| F01 | [ ] Integrate one saved art toggle throughout the game | `src/settings.ts`, `src/main.ts`, `src/defend/pixel-sprites.ts`; use `pixelArt`, not `pixelFont`. Current default is on. |
| F02 | [ ] Lock palette and calibration contact sheet | Keep + tower + infantry building + human + enemy + ground + UI icons, all reviewed together. |
| F03 | [ ] Add native dimensions, anchors, footprints, frame/direction metadata | Reuse existing image loading/cache patterns; no per-entity decoding. New assets proposed under `public/assets/pixel/v2/`. |
| F04 | [ ] Audit all 35 current PNGs | See appendix G; owning 35 PNG files is not completion of their missing states. |
| F05 | [ ] Align 8 art pixels/cell, 8 cells/tile, 2 cells/placement square | `defend/grid.ts`, `layout.ts`, `catalog.ts`, `park-art.ts`; native density must agree with the camera and footprint. |
| F06 | [ ] Audit nonuniform sampling/compositing | `pixel-sprites.ts` roof adapter, `render.ts` city downsampling, `structure-art.ts` destinations, portraits, shadows and DOM icons. |
| F07 | [ ] Invalidate every affected cache after toggle/image arrival | City/area layers, ground relief, body/structure/damage/shadow sprites, combat frame, palette/Tiles icons and portraits. Preserve baseline caches off. |
| F08 | [ ] Add UI/chamber/Mine/Library setting routing | Current Defend-only loader is not proof those screens are gated. Preserve old PNG/SVG/Canvas paths. |
| F09 | [ ] Capture reference scenes and review on/off, motion and simple modes | Test paths, damage, compact forms, mobile, zoom, DPR, missing assets and repeated toggles. Extend `tests/pixel-art.mjs`. |

## B. Defend objects, terrain and effects

For every building below, include base + its actual path/rank looks + evolved/compact forms + intact/three damage stages/rubble/construction as applicable. Share the identity with palette, shop/Tiles, ghosts, upgrade nodes and portraits. Source: `catalog.ts`, `tower-art.ts`, `structure-art.ts`, `damage-art.ts`, `sky-palace-art.ts`, `ui/specialty.ts`.

### B1. Every building family

Source footprint dimensions are simulation cells. Proposed base footprint pixels are cells × 8; image padding/overhang is additional metadata. Compact dimensions come from the catalog, not arbitrary PNG scaling.

| Pending | Catalog ID / element | Normal cells → base pixels | Compact cells | Current PNG coverage |
| --- | --- | --- | --- | --- |
| [x] | `keep` — Keep | 4×4 → 32×32 | — | v2: intact + four damage stages, rubble, flag and UI; batch 01 |
| [x] | `meleeGuild` — Melee Guild | 4×4 → 32×32 | — | v2 base, all damage/rubble, rebuilding and UI; batch 02 |
| [x] | `rangedGuild` — Ranged Guild | 4×4 → 32×32 | — | v2 base, all damage/rubble, rebuilding and UI; batch 02 |
| [x] | `assassinDen` — Assassins' den | 4×4 → 32×32 | — | v2 base + Bloodletters/Shadowcloak/Venomblades/Headhunters, all damage/rubble, rebuilding and UI; batch 03 |
| [x] | `sniperLodge` — Sniper lodge | 4×4 → 32×32 | — | v2 base + Marksmen/Ricochet/Suppressing fire, all damage/rubble, rebuilding and UI; batch 03 |
| [x] | `musketHall` — Musket hall | 6×4 → 48×32 | — | v2 base + Grenadiers/Volley fire/Bayonets, all damage/rubble, rebuilding and UI; batch 03 |
| [x] | `barracks` — Barracks | 4×6 → 32×48 | — | v2 normal/wide, base + Crusaders/Berserkers/Halberdiers, all damage/rubble, rebuilding and UI; batch 01 |
| [x] | `archerBarracks` — Archer barracks | 4×4 → 32×32 | — | v2 base + Rangers/Skirmishers, all damage/rubble, rebuilding and UI; batch 02 |
| [x] | `archerTower` — Archer tower | 2×2 → 16×16 | — | v2 base + Fire arrows/Sharpshooters, all damage/rubble, rebuilding and UI; batch 02 |
| [x] | `cannonTower` — Cannon tower | 2×2 → 16×16 | — | v2 base + Gun crews/Siege shot, all damage/rubble, rebuilding and UI; batch 02 |
| [x] | `watchTower` — Watch tower | 2×2 → 16×16 | — | v2 base + Spotters/Signal fires, all damage/rubble, rebuilding and UI; batch 01 |
| [x] | `wizardTower` — Wizard tower | 2×2 → 16×16 | — | v2 base + Pyromancy/Rime/Stormcalling, all damage/rubble, rebuilding and UI; batch 03 |
| [x] | `mageGuild` — Mage Guild | 4×6 → 32×48 | — | v2 base + Pyroclasm/Cinders, all damage/rubble, rebuilding and UI; batch 03 |
| [ ] | `valkyriePalace` — Valkyrie palace | 6×6 → 48×48 | 4×6 | Create |
| [ ] | `darkKeep` — Dark wizard keep | 12×12 → 96×96 | 6×6 | Create |
| [x] | `monsterBait` — Monster bait | 2×2 → 16×16 | — | v2 base + Oil-soaked/Fortified crates, all damage, wooden rubble, rebuilding and UI; batch 03 |

### B2. City pieces and environment

| Pending | Element / variants | Sources and scope |
| --- | --- | --- |
| [ ] | City tile, placement preview, ground outline and thumbnail | `tile-art.ts`, `edit-overlay.ts`, `structure-art.ts`; current `city-tile.png` is an audit candidate. |
| [ ] | Placed wall blocks, automatic perimeter walls, corners, caps, end pieces, posterns and gates | `wall-defense-art.ts`, `gate-art.ts`, `area-wall-art.ts`, `city-layer.ts`; include orientation, joins, upgrades, damage and rebuild. Current wall-cap/face PNGs are partial. |
| [ ] | City gates and opening leaves; portcullis, gate-mounted weapons and upgrade looks | `gate-art.ts`, `render.ts`, `gate-upgrades.ts`; preserve opening state/hinge pivots and attack sockets. |
| [ ] | Wall spikes and moving/thrusting mechanisms | `wall-defense-art.ts`, `structure-art.ts`; all sides, path/rank looks and damage. |
| [ ] | Wall ballista base, rotating weapon, upgraded mechanisms and bolts | `wall-defense-art.ts`, `ballista-upgrades.ts`; all directions, firing state, bastion damage and silhouettes. |
| [ ] | Houses and roof families | `roof-art.ts`; terracotta, brick, timber, thatch, slate, straw; roof seams, fronts, doors, chimneys, damage, char, rubble, construction. Six roof PNGs currently need audit. |
| [ ] | Soil, grass, paving, roads, borders, relief, debris, rocks and biome decorations | `ground-art.ts`, `ground-relief.ts`, `city-layer.ts`, `park-art.ts`; quiet detail, seamless modules and correct shared borders. |
| [ ] | Oak/pine and other park vegetation, trunks, bushes, grass clumps | `park-trees.ts`, `park-art.ts`, `park-grass.ts`; silhouettes, shadow/lighting masks, growth/season/weather states. Two tree PNGs are partial. |
| [ ] | Fences, gates, posts, joins and splinters | `fences.ts`; all orientations, broken states and occlusion. |
| [ ] | Pond banks, water, lilies, reeds, ducks, rings, footstep/wake pixels, ice and thawing | `pond-water.ts`, `pond-ducks.ts`, `flood-art.ts`; lilies/reeds are partial PNG imports. Include connected/disconnected water and frozen state. |
| [ ] | Lanterns, torches, flames, smoke, rubble and scaffolding | `chimney-smoke.ts`, `city-layer.ts`, `damage-art.ts`; current lantern/rubble/scaffold PNGs do not cover every state. |
| [ ] | Biome floors/walls and area transitions | `areas.ts`, `area-wall-art.ts`, `ground-art.ts`, `city-layer.ts`; all ten areas below, repeat variants and transitions, snow/wet/heat appearance. Existing `public/assets/defend/` PNGs are legacy assets, not automatically gated new art. |

Areas: **Mossbound Ruins (`moss`), Amber Desert (`desert`), Ember Forge (`ember`), Drowned Temple (`drowned`), Fungal Hollow (`fungal`), Frozen Vault (`frozen`), Violet Geode (`crystal`), Obsidian Crypt (`obsidian`), Astral Sanctuary (`astral`), Nadir (`nadir`)**. Nadir currently reuses crypt masonry; keep its distinct final appearance without making gratuitous duplicate files.

### B3. Friendly people and summoned units

All twelve `Soldier.kind` values need a consistent sprite family, not just a color swap. Also cover civilian builders. Include movement, facing, attack/cast, hit/death, health/status overlays, weapon origin and shared UI portrait.

| Pending | Unit | Special variants to retain |
| --- | --- | --- |
| [ ] | `sword` — swordsman | Base PNG audit; crusader armor/shield/healing, branch equipment and states. |
| [ ] | `archer` — archer | Base PNG audit; bow/arrow directions and path equipment. |
| [ ] | `brawler` | Fist, stance, impact and distinct guild identity. |
| [ ] | `slinger` | Sling, wind-up, stone and release direction. |
| [ ] | `assassin` | Den paths; critical, cloak/reveal, poison and targeting cues. |
| [ ] | `sniper` | Lodge path variants, rifle, aim, shots and specialist equipment. |
| [ ] | `musketeer` | Musket Hall paths, firing/reload, grenades and specialist equipment. |
| [ ] | `mage` | Mage Guild paths, staff/robe, casts and persistent fire effects. |
| [ ] | `valkyrie` | Palace paths, spear, wings, charge and guard states. |
| [ ] | `darkWizard` | Dark Keep paths, robe/staff and chain-lightning states. |
| [ ] | `undead` | Necromancy bone archers, soul strength, amalgam scale, rise and crumble. |
| [ ] | `reinforcement` | Called knights/archers/champion, drop/land, last stand and departure. |
| [ ] | Civilian builders/rebuilders | Base PNG audit; roles, tools, carry/build, panic/runaway, ghost/death as used. |

Sources: `battle-art.ts`, `mage-art.ts`, `valkyrie-art.ts`, `dark-art.ts`, `necro-art.ts`, `reinforce-art.ts`, `ghosts.ts`, `projectile-art.ts`. Building path visuals and trained-unit visuals must agree.

### B4. Every enemy species

The complete catalog roster is listed in appendix H. Cover small/large/boss tiers, flying and ground variants, and portrait + battle + unit-tester appearances. Existing roach/warlord artwork shares `goblin.png`; that alias is **not** an approved final species distinction. Existing orc/ogre/bat PNGs also need review.

Keep the special component families: articulated siege engines and ammunition; small and large magic boats with their wakes and heading sprites; walking fortress legs/armor/turrets/core and part damage; Mother/broodling and other split/hatch offspring; phoenix/egg; shields/poison/cloak/regeneration; frozen/ice enemy art. Sources: `battle-art.ts`, `hostile-art.ts`, `zone-enemy-art.ts`, `ice-enemy-art.ts`, `fortress-art.ts`, `siege-art.ts`, `boat-art.ts`, `journal-portrait.ts`.

### B5. Weapons, spells, combat feedback and weather

| Pending | Family | Required elements / source |
| --- | --- | --- |
| [ ] | Ordinary weapons | Arrow, fire arrow, volley, thrown stone, sniper bullet/ricochet, musket ball, grenade/bomblets, suppression, cannonball, ballista bolt, siege/firework/rocket/trebuchet/bombard ammunition; muzzle flash, recoil, reload, impact. `projectile-art.ts`, `siege-art.ts`, `blast-art.ts`. |
| [ ] | War banner | Folded/carried/planted flag, pole, influence marker, planted/ready/cooldown icon and upgrade identity. `war-banner.ts`, `structure-art.ts`, `battle-art.ts`. |
| [ ] | Bomb | Palette/drag PNG audit plus armed/detonation, explosion, smoke, scorch, shock ring, debris and friendly targeting cues. `blast-art.ts`, `pixel-fx.ts`. |
| [ ] | Necromancy | Grave, aim, cast, ring/wisps, risen states and branch-specific previews/icons. `necro-art.ts`. |
| [ ] | Meteor strike | Falling rock/ice, trail, shadow, fragments, landing, crater/blaze, comet/frost states and icons. `meteor-art.ts`. |
| [ ] | Frost nova | Burst, crystals, shards, rime, blizzard, shatter, ward/shield and icons. `frost-art.ts`, `wizard-art.ts`. |
| [ ] | Reinforcements | Drop shafts, falling troops, dust, quake, stagger, champion/last stand, departure and icons. `reinforce-art.ts`. |
| [ ] | Other magic/status | Wizard fire/ice, dark lightning, tower beams, shields, poison/venom, stun/stagger, chill/freeze blocks, healing, regeneration, invulnerability/guard and marks. Preserve the gameplay distinction of each state. |
| [ ] | Destruction/ambient FX | Boom, dust, spark, fireworks, steam, burning ground, damage flashes, smoke/ash, footprints, splinters, ghosts and resurrection/death accents. Bounded PNG strips/masks, no new per-particle loops. |
| [ ] | Weather, sky and atmosphere | Rain, snow/blizzard, windblown dust/sand, lightning, night, heat/fog/clouds, shadows and relief/lighting masks. `weather.ts`, `atmosphere-art.ts`, `shadow-art.ts`, `light-field.ts`, `sky-palace-art.ts`. Do not duplicate static sprites for every possible light level. |
| [ ] | Tactical and combat UI | Grid, range/influence/aim overlays, spawn/placement refusals, selection, drag ghosts, unit health bars, keep brick-health display, wave/journal unread badges, speed/unit tester and frame overlay. Data remains live; art markers/brushes are PNG. |

## C. UI and every screen

The existing baseline UI PNGs and theme SVGs must remain available off. Reuse the sprite's identity across all these appearances; do not create a second unrelated icon language.

| Pending | Surface / elements | Current sources |
| --- | --- | --- |
| [ ] | Shell/navigation | Defend, Mine, Library, Tiles, Settings tabs; selected/pressed/disabled/focus faces, notification badges and icons. `ui/dom.ts`, `ui/shell.ts`, `theme.css`. |
| [ ] | Currency and progress | Copper/silver/gold bars, Knowledge, upgrade points, unknown/unlocked resource indicators; store costs, arrows, rank badges and timers. `main.ts`, `metals.ts`, `theme.css`. |
| [ ] | Shared controls | Buttons, toggles/checks, sliders/thumbs, dropdowns, close/back/undo/respec, warning/confirmation, scroll/selection markers and tooltips. `ui/settings-page.ts`, `style.css`, `theme.css`. |
| [ ] | Palette, Tiles, shop and collections | Every one of the 20 palette items; bombs/banner/four spells; counts, placed/ready/owned states, groups/stacks, path marks, upgrade badges, ghost/carry icons. `ui/tiles-page.ts`, `defend/structure-art.ts`. |
| [ ] | Research/upgrade interfaces | All 25 skill glyphs, all path/rank/crown icons (appendix I), three-rank side trees for keep/walls/gates/ballistas, branch frames/lines, owned/next/locked/selected/buy/undo faces, metal costs and Training/Forge icons. `ui/ledger.ts`, `ui/specialty.ts`, `ui/upgrade-graph.ts`, `ui/branch-art.ts`, `ui/path-icons.ts`, `ui/path-badge.ts`. |
| [ ] | Study magic circles | City tesseract, spell triangles and infantry/tower Voronoi geometry; nodes, trails and accents must follow the pixel grid while remaining live and progression-driven. `src/magic-circle/`; preserve existing circle art off and do not bake entire configurations into PNGs. |
| [ ] | Journal and combat dialogs | Enemy portraits/icons, journal cover/unread mark, zone headers, wave picker and Unit tester; defeat/reward reports, charts, badges, cards and close controls. `defend/journal*.ts`, `wave-picker.ts`, `defeat.ts`. |
| [ ] | Rooms and scenery behind UI | Smithy planks, Study vault, Tiles hall/window, stone, oak, brass/iron framing, sconces/torches, descent earth/roots/ladder/strata and decorative seals. `ui/chamber.ts`, `ui/hall-art.ts`, `ui/ledger.ts`. |
| [ ] | Feedback/dialogs | Welcome/away results, confirmation/erase-progress, locked/empty states, purchase/unlock celebration, coin sparks, text flourishes and progress indicators. `ui/welcome.ts`, `ui/flourish.ts`, `training-particles.ts`. Text stays text. |
| [ ] | Theme texture counterparts | PNG counterparts for legacy `stone.svg`, `wood.svg`, `parchment.svg`, `sigil.svg`, `rule.svg`, `seal.svg`, `frame.svg`, with matching repeats/nine-slice boundaries. Existing SVGs remain in the off branch. |
| [ ] | Existing UI icon family | PNG counterparts/audit for `attack`, `defend`, `defense`, `gold`, `health`, `knowledge`, `library`, `log`, `mine`, `settings`, `stage-select`, `undo`, `upgrade-point`, `upgrades` in `public/assets/ui/`. Preserve old files as baseline. |

Fonts are not sprite sheets: the existing bundled Alembic/Cinzel preference, real prices, labels, tooltips, accessibility text and focusable DOM controls remain functional. Graphic symbols currently implemented as emoji/text glyphs need deliberate PNG counterparts where they represent an icon, while retaining accessible names.

## D. Mine

The Mine is a side-view simulation; do not reuse the Defend overhead projection for it. Current implementation is mainly procedural and has no registered PNG replacement family in `pixel-sprites.ts`.

| Pending | Elements | Sources / variants |
| --- | --- | --- |
| [ ] | Surface buildings | Shaft house/headframe/winding room, barracks/bunks/lounge, warehouse, forge/furnace, smithy/anvils; all five levels, width/height changes, interiors, windows, doors, stairs and staffing stations. `mine/buildings.ts`, `mine/art.ts`. |
| [ ] | Terrain/materials | Sky/surface, grass, dirt, loose dirt, gravel, stone/hard/dense strata, caves, ore seams (copper/silver/gold), water, lava and material borders. `mine/world.ts`, `mine/render.ts`. Preserve the cell grid and excavation state. |
| [ ] | Infrastructure and tools | Shaft, hoist/cage, rails, carts/load levels, trestles, ladders, supports, planner dig marks/routes, work lamps, torches/lanterns, ore/bar/wood/tool stock and rebuild materials. |
| [ ] | Crew | Every working trade and carried tool; outfits, hats, facing, walk/climb/dig/haul/work/eat/sleep/lounge/idle, injury/death and loss markers. `mine/figures.ts`, `mine/acts.ts`, `mine/names.ts`. Names stay text. |
| [ ] | Disasters and atmosphere | Floods, fires, smoke, sparks, lava heat, rain/lightning, day/night and building damage/rebuild. `mine/particles.ts`, `mine/render.ts`. |
| [ ] | Mine/Smithy UI | Crew/job/building picker icons, hires, assignments, supplies, prospect/move-on, upgrade progress, metal stock, Training/Forge stations and completion/cancel indicators. `mine/ui.ts`, `ui/ledger.ts`, `training-particles.ts`. |

## E. Library and laboratory

Preserve the Library's side-view geometry (`library/geometry.ts`: current nave 192×300 native scene pixels); its pixel density is a scene contract, not an instruction to replace it with Defend cells.

| Pending | Elements | Sources / variants |
| --- | --- | --- |
| [ ] | Nave architecture | Stone/ashlar, arches/vaults, piers, floor, stained glass/frame, window/sky, doors/hallways, torch fixtures, god rays and surface masks. `library/render.ts`, `library/ashlar.ts`. |
| [ ] | Shelves/books | Empty, planned, building, complete, damaged, charred, burning and repaired shelves; books by consistent color, rune/enchantment, carried/read/return/charred states. |
| [ ] | Furniture/logistics | Reading tables, seats, ladders, carts/barrows, planks, deliveries, return shelf, water butts/buckets, debris and rebuild supplies. |
| [ ] | Librarians | Shelvers, professors, researchers; hats (mortarboard, wizard, beret, hood, coif), outfits, reading, shelving, hauling, research, conversations, tea, sleep and fire response. `library/render.ts`, `library/lab.ts`. |
| [ ] | Laboratory | Cellar walls, ladder, benches, lab expansion levels/annexes, athanor, alembic, cauldron, homunculus, clockwork/ritual devices, lamps, black cat and research props. `library/lab-render.ts`, `library/lab.ts`. |
| [ ] | Hazards/ambient FX | Fire cells and burning book pixels, smoke/ash, buckets/splashes, damaged shelves, death/mourning, stars/glass/torch light and lab vapors/flames. `library/fire.ts`, `library/render.ts`, `library/lab-render.ts`. |
| [ ] | Library/Study UI | Knowledge, shelf/staff/lab icons, hires, roles, building picker, research project, cost/progress/cancel, catch-up/away countdown and navigation. `library/ui.ts`, `ui/ledger.ts`, `ui/welcome.ts`. |

## F. Batch tracking

**Implemented: [batch 03](BUILDING_BATCH_03.md)** — Assassins' den, Sniper lodge, Musket hall, Wizard tower, Mage Guild and Monster bait; twelve PNG sheets, 115 world-state frames and 23 matching UI icons. Includes all existing path looks, damage, rebuilding, and material-appropriate rubble. Two shared magic ramps extend the palette to 30 swatches while retaining the 16-color world/12-color UI limits. All nineteen earlier PNGs stay unchanged. Current building coverage: fourteen of sixteen families, 31 native PNG sheets, 231 world-state frames and 42 UI icons. Valkyrie palace, Dark wizard keep, terrain/theme work, units and enemies remain separate work.

**Implemented: [batch 02](BUILDING_BATCH_02.md)** — melee/ranged guilds, archer barracks, archer tower and cannon tower; ten PNG sheets, 55 world-state frames and 11 matching UI icons. Uses the existing gated frame/rubble/scaffold/placement/icon routes, with all original batch-01 PNGs unchanged. Its delivery brought building coverage to eight of the sixteen catalog families; 19 native PNG sheets, 116 world-state frames and 19 UI icons.

**Implemented: [batch 01](BUILDING_BATCH_01.md)** — keep, barracks and watch tower; nine PNG sheets, 61 world-state frames, eight UI icons, four keep-flag frames and one rebuilding module. Includes exact footprint/pivot metadata, matching board/drag/placement/UI routing, damage/rubble, legacy/missing-asset fallback and nearest-neighbor city compositing. The remaining foundation/UI/world rows stay pending; this batch does not convert the whole game. The historical imported PNG list below is retained as an audit list, including the old building files superseded by this batch.

Start with F01–F09, then a calibrated keep/tower/infantry vertical slice with matching UI. Complete a family across states and screens before marking it done. Next expand Defend, then shared UI/chambers, Mine and Library. A batch record should contain: semantic IDs, PNG paths/native sizes, anchors/footprints, applicable states, owners, reference contact sheet, on/off screenshots, test results, memory/frame-cost notes and remaining fallback cases. Do not use a single checked "Defend done" box to hide missing species or upgrade states.

The appendices below were enumerated from the current code, not inferred from filenames. They enumerate logical families; animations, directions, ranks, damage and cross-screen appearances expand them into further frames/assets. Composited parts can be reused intentionally—do not create a duplicate whole PNG for every combination by default.

## G. Existing optional Defend PNGs: all pending style/state review

All paths below are under `public/assets/pixel/`. Dimensions are measured from PNG IHDR data, not CSS display size. Every row is **Audit/redraw**, not completed v2 artwork.

| Pending | Existing file | Native pixels |
| --- | --- | --- |
| [ ] | `civilian.png` | 24×24 |
| [ ] | `swordsman.png` | 24×24 |
| [ ] | `archer.png` | 24×24 |
| [ ] | `goblin.png` | 24×24 |
| [ ] | `enemy-orc.png` | 24×24 |
| [ ] | `enemy-ogre.png` | 24×24 |
| [ ] | `enemy-bat.png` | 24×24 |
| [ ] | `defend-keep.png` | 36×36 |
| [ ] | `defend-barracks.png` | 36×48 |
| [ ] | `defend-barracks-wide.png` | 48×36 |
| [ ] | `defend-archer-barracks.png` | 36×36 |
| [ ] | `defend-archer-tower.png` | 24×24 |
| [ ] | `defend-cannon-tower.png` | 24×24 |
| [ ] | `defend-watch-tower.png` | 24×24 |
| [ ] | `roof-terracotta.png` | 24×24 |
| [ ] | `roof-brick.png` | 24×24 |
| [ ] | `roof-timber.png` | 24×24 |
| [ ] | `roof-thatch.png` | 24×24 |
| [ ] | `roof-slate.png` | 24×24 |
| [ ] | `roof-straw.png` | 24×24 |
| [ ] | `city-oak.png` | 12×12 |
| [ ] | `city-pine.png` | 12×12 |
| [ ] | `city-rubble.png` | 12×12 |
| [ ] | `city-scaffold.png` | 12×12 |
| [ ] | `city-wall-cap.png` | 12×12 |
| [ ] | `city-wall-face.png` | 12×6 |
| [ ] | `city-lantern.png` | 12×12 |
| [ ] | `pond-lily.png` | 12×12 |
| [ ] | `pond-reeds.png` | 12×12 |
| [ ] | `city-tile.png` | 24×24 |
| [ ] | `bomb.png` | 24×24 |
| [ ] | `floor-1.png` | 24×24 |
| [ ] | `floor-2.png` | 24×24 |
| [ ] | `floor-3.png` | 24×24 |
| [ ] | `floor-4.png` | 24×24 |

Only five enemy IDs currently map to these PNGs: `roach` → `goblin`, `orc` → `enemy-orc`, `ogre` → `enemy-ogre`, `warlord` → `goblin`, `bat` → `enemy-bat`. Only six structure IDs have registered base PNGs (`keep`, `barracks`, `archerBarracks`, `archerTower`, `cannonTower`, `watchTower`), with the barracks additionally having a wide image. Procedural path/damage forms are still work to migrate.

## H. Complete enemy roster (92 species)

Each row includes its combat sprite, required animation/status/component variants, journal portrait and unit-tester icon. Catalog sizes/flags and current behavior remain authoritative.

| Pending | Enemy ID | Display name |
| --- | --- | --- |
| [ ] | `aegis` | Invincible Shield Generator |
| [ ] | `ashPhoenix` | Ash Phoenix |
| [ ] | `astralWarden` | Astral Warden |
| [ ] | `ballista` | Ballista |
| [ ] | `bannerCaptain` | Banner Captain |
| [ ] | `bat` | Bat |
| [ ] | `blinkImp` | Blink Imp |
| [ ] | `boat` | Spellbound Sloop |
| [ ] | `boatCog` | Arcane Cog |
| [ ] | `boatCutter` | Mystic Cutter |
| [ ] | `boatDinghy` | Runed Dinghy |
| [ ] | `boatGreater` | Arcane Galleon |
| [ ] | `boatLesser` | Enchanted Skiff |
| [ ] | `boatSailboat` | Charmbound Sailboat |
| [ ] | `boatSovereign` | Deluge Ark |
| [ ] | `bombBird` | Kamikaze Bird |
| [ ] | `bombOrc` | Kamikaze Orc |
| [ ] | `bombard` | Great Bombard |
| [ ] | `briarling` | Briarling |
| [ ] | `brineCrab` | Brine Crab |
| [ ] | `broodling` | Broodling |
| [ ] | `burrowingMole` | Burrowing Mole |
| [ ] | `capCrawler` | Cap Crawler |
| [ ] | `cinderImp` | Cinder Imp |
| [ ] | `cometHound` | Comet Hound |
| [ ] | `coralGuardian` | Coral Guardian |
| [ ] | `cryptHound` | Crypt Hound |
| [ ] | `crystalSentinel` | Crystal Sentinel |
| [ ] | `darkKnight` | Dark Knight |
| [ ] | `dragon` | Dragon |
| [ ] | `duneScorpion` | Dune Scorpion |
| [ ] | `duneTortoise` | Dune Tortoise |
| [ ] | `dustDjinn` | Dust Djinn |
| [ ] | `emberMoth` | Ember Moth |
| [ ] | `fernMantis` | Fern Mantis |
| [ ] | `fireworkLauncher` | Firework Launcher |
| [ ] | `fortress` | Living Fortress |
| [ ] | `fortressGreater` | Walking Citadel |
| [ ] | `fortressHut` | Walking Watchpost |
| [ ] | `fortressKeep` | Walking Stronghold |
| [ ] | `fortressLesser` | Walking Bastion |
| [ ] | `fortressOutpost` | Walking Outpost |
| [ ] | `fortressSovereign` | Dread Colossus |
| [ ] | `fortressTower` | Walking Fortlet |
| [ ] | `fungalBrute` | Fungal Brute |
| [ ] | `geodeCrab` | Geode Crab |
| [ ] | `glassJackal` | Glass Jackal |
| [ ] | `graveWisp` | Grave Wisp |
| [ ] | `iceCube` | Sliding Ice Cube |
| [ ] | `iceGolem` | Ice Golem |
| [ ] | `kelpStalker` | Kelp Stalker |
| [ ] | `lanternHornet` | Lantern Hornet |
| [ ] | `lanternJelly` | Lantern Jelly |
| [ ] | `leechSwarm` | Leech Swarm |
| [ ] | `mirrorKnight` | Mirror Knight |
| [ ] | `mossBoar` | Moss Boar |
| [ ] | `mossTroll` | Moss Troll |
| [ ] | `mother` | Mother |
| [ ] | `myceliumHulk` | Mycelium Hulk |
| [ ] | `necromancer` | Necromancer |
| [ ] | `novaMoth` | Nova Moth |
| [ ] | `ogre` | Ogre |
| [ ] | `orc` | Orc |
| [ ] | `phoenixEgg` | Phoenix Egg |
| [ ] | `poisonBearer` | Poison Generator |
| [ ] | `poisonGreater` | Greater Poison Generator |
| [ ] | `poisonLesser` | Lesser Poison Generator |
| [ ] | `poisonSovereign` | Lethal Poison Generator |
| [ ] | `prismMoth` | Prism Moth |
| [ ] | `prismRay` | Prism Ray |
| [ ] | `roach` | Roach |
| [ ] | `rocketBattery` | Dragonfire Battery |
| [ ] | `rollingCannon` | Rolling Cannon |
| [ ] | `rootTreant` | Root Treant |
| [ ] | `rotMite` | Rot Mite |
| [ ] | `sandVulture` | Sand Vulture |
| [ ] | `shardBrood` | Shard Brood |
| [ ] | `shardling` | Shardling |
| [ ] | `shieldBearer` | Shield Generator |
| [ ] | `shieldGreater` | Greater Shield Generator |
| [ ] | `shieldLesser` | Lesser Shield Generator |
| [ ] | `siegeBeetle` | Siege Beetle |
| [ ] | `skeleton` | Raised Skeleton |
| [ ] | `slagGolem` | Slag Golem |
| [ ] | `snake` | Snake |
| [ ] | `sporeMoth` | Spore Moth |
| [ ] | `sporeling` | Sporeling |
| [ ] | `starWisp` | Star Wisp |
| [ ] | `sunScarab` | Sun Scarab |
| [ ] | `trebuchet` | Trebuchet |
| [ ] | `voidSparrow` | Void Sparrow |
| [ ] | `warlord` | Warlord |

## I. Complete Knowledge path, side-tree and skill icon work

Every path row requires each rank's icon **and** its actual building/unit/spell art when gameplay supplies a visual change. Reuse coherent overlays instead of painting disconnected rank styles. Include its evolved/crowned form where listed. A path icon alone does not complete its world-art migration.

### I1. All 44 path definitions

| Pending | Topic / path ID | Path name | Rank icon identities; evolved form |
| --- | --- | --- | --- |
| [ ] | `wizardTower` / `pyromancy` | Pyromancy | `flame`, `tongue`, `inferno` |
| [ ] | `wizardTower` / `rime` | Rime | `snowflake`, `shard`, `iceBlock` |
| [ ] | `wizardTower` / `storm` | Stormcalling | `bolt`, `fork`, `thunderhead`; crown → `darkKeep` |
| [ ] | `barracks` / `crusaders` | Crusaders | `mail`, `heart`, `cross`; crown → `valkyriePalace` |
| [ ] | `barracks` / `berserkers` | Berserkers | `dagger`, `heart`, `fork` |
| [ ] | `barracks` / `halberdiers` | Halberdiers | `stake`, `hand`, `helm` |
| [ ] | `valkyriePalace` / `cloudborne` | Cloudborne | `cloud`, `wing`, `halo` |
| [ ] | `assassinDen` / `bloodletters` | Bloodletters | `dagger`, `drop`, `skull` |
| [ ] | `assassinDen` / `shadowcloak` | Shadowcloak | `hood`, `eye`, `whirl` |
| [ ] | `assassinDen` / `venom` | Venomblades | `vial`, `drop`, `skull` |
| [ ] | `assassinDen` / `headhunters` | Headhunters | `crosshair`, `scales`, `crown` |
| [ ] | `musketHall` / `grenadiers` | Grenadiers | `fireball`, `grape`, `inferno` |
| [ ] | `musketHall` / `volleyFire` | Volley fire | `volley`, `cannonball`, `gear` |
| [ ] | `musketHall` / `bayonets` | Bayonets | `dagger`, `boot`, `hammer` |
| [ ] | `sniperLodge` / `marksmen` | Marksmen | `spyglass`, `crosshair`, `skull` |
| [ ] | `sniperLodge` / `ricochet` | Ricochet | `fork`, `cannonball`, `bolt` |
| [ ] | `sniperLodge` / `suppressors` | Suppressing fire | `boot`, `stake`, `gear` |
| [ ] | `archerTower` / `fireArrows` | Fire arrows | `fireArrow`, `flame`, `volley` |
| [ ] | `archerTower` / `sharpshooters` | Sharpshooters | `eye`, `crosshair`, `skull` |
| [ ] | `cannonTower` / `gunnery` | Gun crews | `gear`, `grape`, `mail` |
| [ ] | `cannonTower` / `siegeShot` | Siege shot | `cannonball`, `blast`, `fork` |
| [ ] | `archerBarracks` / `rangers` | Rangers | `leaf`, `arrow`, `volley` |
| [ ] | `archerBarracks` / `skirmishers` | Skirmishers | `bow`, `boot`, `bolt` |
| [ ] | `watchTower` / `spotters` | Spotters | `spyglass`, `eye`, `crosshair` |
| [ ] | `watchTower` / `signalFires` | Signal fires | `beacon`, `tongue`, `inferno` |
| [ ] | `mageGuild` / `pyroclasm` | Pyroclasm | `fireball`, `blast`, `volley` |
| [ ] | `mageGuild` / `cinders` | Cinders | `embers`, `flame`, `inferno` |
| [ ] | `bait` / `oilSoaked` | Oil-soaked | `flame`, `tongue`, `inferno` |
| [ ] | `bait` / `fortified` | Fortified crates | `crate`, `mail`, `dagger` |
| [ ] | `spikes` / `blastStakes` | Blasting stakes | `blast`, `inferno`, `cannonball` |
| [ ] | `spikes` / `springStakes` | Spring stakes | `spring`, `stake`, `dagger` |
| [ ] | `spikes` / `rimeStakes` | Rimed stakes | `snowflake`, `shard`, `iceBlock` |
| [ ] | `necromancy` / `boneArchers` | Bone archers | `bow`, `bone`, `volley` |
| [ ] | `necromancy` / `soulWeighing` | Soul weighing | `scales`, `skull`, `crown` |
| [ ] | `necromancy` / `amalgam` | Amalgam | `hand`, `tombstone`, `inferno` |
| [ ] | `meteor` / `starfall` | Starfall | `stars`, `volley`, `meteor` |
| [ ] | `meteor` / `moltenCore` | Molten core | `crater`, `embers`, `inferno` |
| [ ] | `meteor` / `frostComet` | Frost comet | `snowflake`, `shard`, `iceBlock` |
| [ ] | `frostNova` / `shatter` | Shatter | `iceBlock`, `shard`, `shards` |
| [ ] | `frostNova` / `blizzard` | Wandering blizzard | `snowflake`, `whirl`, `thunderhead` |
| [ ] | `frostNova` / `rimeWard` | Rime ward | `frostShield`, `mail`, `heart` |
| [ ] | `reinforcements` / `hammerfall` | Hammerfall | `blast`, `crater`, `hammer` |
| [ ] | `reinforcements` / `muster` | Muster the levy | `helm`, `bow`, `boot` |
| [ ] | `reinforcements` / `oathsworn` | Oathsworn | `mail`, `dagger`, `oath` |

### I2. Side-by-side upgrade branches: all 12 definitions

| Pending | Owner / branch | Name | Rank icon identities |
| --- | --- | --- | --- |
| [ ] | `keep` / `bastions` | Bastions | `mail`, `helm`, `oath` |
| [ ] | `keep` / `arrowLoops` | Arrow loops | `arrow`, `bow`, `volley` |
| [ ] | `keep` / `boilingOil` | Boiling oil | `flame`, `embers`, `fireball` |
| [ ] | `walls` / `stonework` | Stonework | `hammer`, `mail`, `heart` |
| [ ] | `walls` / `thornwork` | Thornwork | `stake`, `shards`, `snowflake` |
| [ ] | `walls` / `townWalls` | Town walls | `crate`, `boot` |
| [ ] | `gate` / `portcullis` | Portcullis | `mail`, `cannonball`, `flame` |
| [ ] | `gate` / `gateTowers` | Gate towers | `crosshair`, `volley`, `arrow` |
| [ ] | `gate` / `ironbound` | Ironbound | `hammer`, `heart`, `oath` |
| [ ] | `ballista` / `heavyBolts` | Heavy bolts | `arrow`, `hammer`, `stake` |
| [ ] | `ballista` / `fireBolts` | Fire bolts | `fireArrow`, `embers`, `fireball` |
| [ ] | `ballista` / `windlass` | Windlass | `gear`, `spyglass`, `volley` |

### I3. All 25 shared skill identities

Create readable PNG glyphs and appropriate purchased/available/locked states. Retain rank labels, research mechanics and accessibility text.

| Pending | Skill ID | Name |
| --- | --- | --- |
| [ ] | `drillSergeant` | Drill sergeant |
| [ ] | `veterans` | Veterans |
| [ ] | `bladework` | Bladework |
| [ ] | `fletchers` | Fletchers |
| [ ] | `ballistics` | Ballistics |
| [ ] | `gunpowder` | Gunpowder |
| [ ] | `warBanner` | War banner |
| [ ] | `bannerCooldown` | Rapid deployment |
| [ ] | `bannerDefense` | Sheltering standard |
| [ ] | `bannerReach` | Broad standard |
| [ ] | `bannerDamage` | Battle standard |
| [ ] | `bannerMarch` | Forced march |
| [ ] | `bannerLife` | Vital standard |
| [ ] | `bannerRegen` | Restoring standard |
| [ ] | `masonry` | Masonry |
| [ ] | `bastions` | Bastions |
| [ ] | `guilds` | Builders' guilds |
| [ ] | `scholars` | Smiths' guild |
| [ ] | `tactician` | Master smith |
| [ ] | `fireproofWood` | Fireproof wood |
| [ ] | `coffee` | Coffee |
| [ ] | `waterproofing` | Waterproofing |
| [ ] | `nightWatch` | Night watch |
| [ ] | `enchantedInk` | Enchanted ink |
| [ ] | `fireTraining` | Fire training |

### I4. Forge and Training icon identities

These rows require their UI icon or a documented shared icon mapping, not a separate world sprite for every numerical modifier. Preserve live labels, costs, bars, timers and cancel/refund controls.

| Pending | Catalog / ID | Display name |
| --- | --- | --- |
| [ ] | Forge / `barracksCapacity` | Garrison |
| [ ] | Forge / `barracksTraining` | Drill yard |
| [ ] | Forge / `soldierArms` | Arms & armour |
| [ ] | Forge / `soldierReach` | Patrol routes |
| [ ] | Forge / `archerSight` | Keen eyes |
| [ ] | Forge / `archerHunt` | Hunter's instinct |
| [ ] | Forge / `archerDamage` | Bodkin points |
| [ ] | Forge / `archerRange` | Longbows |
| [ ] | Forge / `archerRate` | Quick nock |
| [ ] | Forge / `cannonDamage` | Heavy shot |
| [ ] | Forge / `cannonRate` | Powder monkeys |
| [ ] | Forge / `cannonSafe` | Gunnery drills |
| [ ] | Forge / `bombSafe` | Shaped charges |
| [ ] | Forge / `watchRadius` | Lookouts |
| [ ] | Forge / `wizardFlame` | Flamethrower |
| [ ] | Forge / `wizardIce` | Ice wave |
| [ ] | Forge / `mageFireball` | Pyroclasm |
| [ ] | Forge / `mageEmbers` | Lingering embers |
| [ ] | Forge / `palaceCompact` | Folded halls |
| [ ] | Forge / `valkyrieReach` | Long spears |
| [ ] | Forge / `darkKeepCompact` | Folded sanctum |
| [ ] | Forge / `chainReach` | Arc span |
| [ ] | Forge / `chainCount` | Conduit of night |
| [ ] | Forge / `baitRestock` | Restocking |
| [ ] | Forge / `baitBlast` | Powder kegs |
| [ ] | Forge / `spikeDamage` | Iron-shod stakes |
| [ ] | Forge / `spikeRate` | Barbed edges |
| [ ] | Forge / `gateStrength` | Ironbound doors |
| [ ] | Forge / `gateHinges` | Greased hinges |
| [ ] | Forge / `ballistaDamage` | Steel bolts |
| [ ] | Forge / `ballistaRate` | Torsion skeins |
| [ ] | Forge / `ballistaRange` | Long stocks |
| [ ] | Forge / `wallStrength` | Masonry |
| [ ] | Forge / `keepStrength` | Keep bastions |
| [ ] | Forge / `civilianCount` | Guild of builders |
| [ ] | Forge / `civilianHealth` | Hardy folk |
| [ ] | Forge / `rebuildSpeed` | Master masons |
| [ ] | Training / `troopHp` | Troop HP |
| [ ] | Training / `troopDamage` | Troop damage |
| [ ] | Training / `drill` | Drill speed |
| [ ] | Training / `towerDamage` | Tower damage |
| [ ] | Training / `towerReload` | Tower reload |
| [ ] | Training / `bombDamage` | Bomb damage |
| [ ] | Training / `wallHp` | Wall HP |
| [ ] | Training / `keepHp` | Keep HP |
| [ ] | Training / `rebuild` | Rebuild speed |
| [ ] | Training / `undeadHp` | Risen HP |
| [ ] | Training / `undeadDamage` | Risen damage |
| [ ] | Training / `meteorDamage` | Meteor damage |
| [ ] | Training / `meteorRadius` | Meteor blast radius |
| [ ] | Training / `frostTime` | Frost nova duration |
| [ ] | Training / `frostRadius` | Frost nova radius |
| [ ] | Training / `reinforceHp` | Reinforcement health |
| [ ] | Training / `reinforceDamage` | Reinforcement damage |
| [ ] | Training / `reinforceTime` | Reinforcement stay |

### I5. Remaining shared icon work

- [ ] Subject/topic icons in `upgrade-subjects.ts` and every glyph identity in `ui/path-icons.ts`, including those reused by rank icons above.
- [ ] Currency/stock/tool icons, bomb, banner and the four strike spells, their aim/cooldown/ready states, resource locks, confirmation and buy/sell marks.
- [ ] Direction, frame and state sheets for the 20 palette entries; keep is additional and already placed at game start.
- [ ] Keep, wall, gate and ballista generic node roots, rank/crown badges, selected/owned/next/locked faces and branch caps/connectors.

Regenerate the catalog audit for new species/buildings/paths rather than silently omitting them. Graphics completion must be measured against the code's actual catalogs and render entry points, not just this snapshot's counts.
