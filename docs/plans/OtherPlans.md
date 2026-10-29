# Other plans: work shared by every mode

Items from Seth's 2026-10-27 brief that are not owned by one game mode. Each section is one PR unless noted. The general rules in [AmbushPlan.md](AmbushPlan.md#architecture-guidelines) (exact battle arithmetic, goldens, saves, theme tokens, `t()`, phone and desktop browser tests, AGENTS.md kept current) apply here too.

Suggested order: 1 (fences) and 2 (strike quick bar) first, since Ambush's outposts and HUD build on them; 3 to 5 are independent UI polish and can land any time.

## 1. Fences become walls, everywhere

**Brief:** fences act like walls with about 10% of a wall stone's starting HP, in Defend, Ambush and Siege.

**Today:** `src/defend/fences.ts` is renderer-only decoration. `parkFences(map)` picks 60% of parks (`FENCED`, by `hash01`, so it is already deterministic) and lays one-cell-long `FenceSection`s along their street edges, inset 0.12 of a cell, leaving one section open as a gate. Walking enemies and blasts snap them into splinters. Nothing is blocked.

**Plan:**

1. **Move fence placement into city generation.** Add a `fences` stage to `citygen.ts`'s pipeline that runs `parkFences`' rule and records fences on the `CityMap` (`map.fences`, absent when none). Keep `hash01`, never an effects stream.
2. **Make fences real buildings on cells.** The sim is cell-based (flow fields, `solid`, `damageBuilding`), so a fence on a cell edge cannot block anything as is. Recommended: each fenced edge marks the **park-side cell** it runs along as a `"fence"` building (one per run of sections, like wall stones share a building per stone), solid, owned, with HP = `round(0.1 × wallHp(level))` (wall stone HP from `catalog.ts`'s `wallHp`, Masonry included). Enemies treat it like a wall stone: path round it if cheaper, otherwise smash it. When it breaks, it falls into the existing splinter effect and the cell opens. It is rebuilt by civilians like any building (or not; decide with Seth, default yes in Defend, no in Ambush).
3. **Keep the look thin.** Art stays the current thin fence drawn on the cell's street edge, not a filled block; the building only changes what is solid. Damage stages: leaning, gap-toothed, splinters. Pixel art with black outlines, drawn by `Fences` from the sim's fence HP instead of its own `broken` flag.
4. **Gates.** The open section stays open (the cell is not solid), so civilians and troops still reach parks. In Ambush, an outpost fence that crosses the track has no gap on the track: enemies break through.
5. **Who it affects.** City people and troops route with `ownSolid`; fences are solid to them too except at the gate gap. Fliers, boats and siege shots ignore or hit them as they do wall stones.
6. **Goldens.** This is an intended gameplay change in Defend: re-record `defend-replay`, `defend-city` and `defend-fences-save` goldens with `UPDATE_GOLDEN=1` in the same PR, run the replay under Node 24, and say why in the commit message.
7. **Tests:** fences block a flow field until broken; HP is 10% of a wall stone; blasts damage them; splinters on break; Siege raid castles have fenced parks hurting the attacker; Ambush outpost fences block the track.

**Open question for Seth:** should broken fences be rebuilt by civilians in Defend? (Default: yes, quickly, like houses.)

## 2. Strike spell quick bar (Defend, Ambush, Siege)

**Brief:** strike spells (Meteor, Frost nova, Reinforcements, Necromancy) shown as 70%-transparent icons in the board's bottom left. Tap an icon to select it, tap the board to cast; tapping the icon again cancels. While recharging, the icon fills back up; when ready it flashes and plays a tiny distinct sound. A Gameplay setting brings back today's menu (open Skills, drag the spell out).

**Today:** Defend lists spells in the Skills side palette and casts them by dragging (`Drag { from: "meteor" }` etc., `Drop { kind: "spell" }`), with a dark cooldown fill and gold ready outline (`skill-ready`, `--skill-fill` in `defend/ui.ts` around line 640). Ambush/Siege show plain text buttons (`campaign/ui.ts` `.campaign-spells`) that arm a spell and cast on the next tap.

**Plan:**

1. **One shared component**, `src/ui/spell-bar.ts` (`SpellBar`): given the spells available, their cooldowns (`meteorRemaining`, `frostRemaining`, `reinforceRemaining`, `necroRemaining` and their totals) and a `cast(spell, cell)` callback, it renders round icon buttons over the board's bottom-left corner (inside the board frame, above the safe-area inset), handles select / cancel, and reports the armed spell to the page so a board tap casts it.
2. **Icons:** reuse the spells' palette icons (`Topic.icon`), drawn at `opacity: .3` (70% transparent) when idle; full opacity while armed, with a brass ring. A conic or bottom-up fill shows recharge (`--fill`), as the Skills palette does today.
3. **Ready cue:** a short white flash (CSS class replayed with `replay` from `ui/flourish.ts`, none under Reduce Motion) and a new tiny `spellReady` cue in `src/sound.ts` (a soft high bell partial, distinct from `chime` and `unlock`; silent with `soundOff`).
4. **Aiming:** while a spell is armed, show its aim ring under the pointer (Meteor's ember ring, Necromancy's skulls via `Overlay.graves`, etc.) exactly as the drag does now, so reuse that overlay with the pointer position. A tap on the board casts; a drag on the board still pans; tapping the armed icon or pressing Escape cancels.
5. **Setting:** new Gameplay row in `src/settings.ts` `SETTINGS`, e.g. `spellMenu` ("Strike spells in a menu"), off by default. On: today's Skills palette drag in Defend (and the same palette in Ambush/Siege's side menu). Off: the quick bar. Add it to `tests/settings.test.ts`.
6. **Wire into all three pages:** `DefendPage` (bombs and the war banner stay in the Skills palette; only strike spells move), `CampaignPage` Ambush and Siege (replace `.campaign-spells`).
7. **Tests:** Node test of `SpellBar` state (select, cancel, cast on ready only); browser script at desktop and phone width for Defend and Ambush: select, cast, cooldown fill, ready flash, cancel by second tap, setting switches back to the menu.

## 3. New pixel-art tab icons

**Brief:** pixel-art icons for the Ambush, Siege, Defend and Settings tabs; the old ones are replaced.

**Done:** Ambush and Siege (`src/ui/mode-icons.ts`: a bow drawn from a bush, a trebuchet). Defend and Settings still use their PNGs.

**Today:** Defend and Settings are legacy PNGs (`public/assets/ui/defend.png`, `settings.png`, through `uiSprite` in `src/ui/dom.ts`); Ambush and Siege are inline SVGs in `src/ui/combat-tab.ts` (`combatIcon`). Tiles already uses a canvas painted by the board's own art (`cityTile`).

**Plan:**

- Draw them procedurally like the Tiles icon, as pixel arrays painted to a 48 × 48 canvas (16 × 16 art pixels at 3×), black outlines, lit from the upper left, in the game's palette. Put them in `src/ui/tab-icons.ts` (`tabIconPixels(name)`, `paintTabIcon(canvas, name)`). AGENTS.md says the PNG sprite collection was deliberately removed; do not add new PNG sprite sets for this.
- Ideas: **Defend** a kite shield on a castle tower; **Ambush** a hooded archer's bow with an arrow over a road; **Siege** a trebuchet or battering ram; **Settings** a brass cog with a gear tooth highlight.
- `CombatTab` keeps its slide animation, switching canvases instead of SVGs.
- Make 2 or 3 variants of each in a gallery test (`node tests/tab-icons.mjs`, screenshot in `test-results/`) and post the gallery to Seth to pick from before wiring them in, since icons are taste.
- Remove `defend.png`/`settings.png` once unused, and any references.

## 4. Currency bar only on Mine, Library and Tiles, dropping in with a bounce

**Brief:** the Copper, Silver, Gold, Knowledge (etc.) bar at the top shows only on the Mine, Library and Tiles tabs. It comes down smoothly and bounces a little.

**Today:** `#currencies` (`ui/shell.ts` `currencies()`, styled as `.td-currencies` in `theme.css`, "a signboard hung on two chains") is always shown above every page.

**Plan:**

- In `main.ts`'s `navigate()`, toggle a class on the shell (`.shell.show-currencies`) for `mine`, `library`, `tiles`.
- Hidden state: the sign is translated up out of view (`transform: translateY(-110%)`) and takes **no layout height**, so Defend/Ambush/Siege gain the space. Use a wrapper whose height animates (or `grid-template-rows: 0fr → 1fr`) so pages below don't jump.
- Showing: a CSS keyframe drop with one small overshoot bounce (about 450 ms, e.g. down to +6 px, back to −2 px, settle). Hiding: a quick lift (about 200 ms), no bounce. Reduce Motion: appear/disappear instantly.
- Switching between two of the three tabs does not replay the drop.
- Keep the "glint on a rising currency" behaviour; when hidden, glints queue nothing.
- Check `ui/viewport.ts`'s height maths and `tests/phone-viewport.mjs` still fit every tab. Update `node tests/metal-economy.mjs` if it reads the bar on another tab.

## 5. Better rope graphics

**Brief:** "Improve the graphics on the ropes."

**Target:** the currency sign hangs from two cords drawn in CSS (`.td-currencies::before/::after` in `theme.css`, a 5 px repeating gradient). Seth confirmed on 2026-10-27 that these are the ropes he means.

**Plan:**

- Replace the gradient strips with pixel-art twisted rope: a small tiling image or inline SVG of diagonal strands (two tones of hemp, dark twist lines, black outline), 6 px wide, with a knot or iron ring where it meets the sign, and the top fading into the dark above.
- Let the ropes swing with the drop-and-bounce of item 4 (rotate the sign a degree or two and settle), off under Reduce Motion.
