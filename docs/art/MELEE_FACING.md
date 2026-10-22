# Melee facing

Melee troops face their observed travel direction while walking, a live target within their weapon's reach while stationary, and their last heading while idle. Path direction seeds newly visible units only. Four upright body views (south, west, north, east) have a small diagonal hysteresis so minor movement does not chatter between frames. Weapons, shields, fists and horses use the continuous heading. Hero slashes/spins and Valkyrie charges retain their attack animation and directional afterimages.

`src/defend/melee-facing.ts` keeps presentation state in a WeakMap keyed by the actual soldier. It changes no soldier fields, simulation state, saved data or random streams. Two painters in the same tick retain the same walking heading. Restarting the clock resets the heading. Capes remain simulated in world space; turning a body never rotates or stretches its cloth chain.

## Art and settings

`public/assets/pixel/v2/units/melee-facing.png` is a transparent RGBA PNG atlas: 72×468 pixels, 26 state rows × four directions = 104 frames. Each cell is 18×18 with one transparent pixel of top/left padding and enough transparent right/bottom margin to isolate the crop. `melee-body-data.ts` contains the editable glyph source, dimensions, palettes and row order. Rebuild with `npm run sprites:melee`; verify with `npm run sprites:melee -- --check`.

| Body | Native frame | Anchor and variants |
| --- | --- | --- |
| Hero | 11×11 | Center; original red/Whirlwind/Blade dance/Legend palettes, pale hit flash and steel ghosts |
| Valkyrie | 11×9 | Original (5.5, 5) pivot; hit flash and gold ghosts |
| Swordsman | 9×10 | Center; proportionate scaling inside its existing visual size, hit flash |
| Risen warrior | 9×10 | Original bottom-biased center, hit flash |
| Amalgam | 15×15 | Original bottom-biased center, hit flash |
| Reinforcement knight | 9×10 | Original bottom-biased center, hit flash and gold last-stand outline |
| Champion | 15×14 | Original bottom-biased center, hit flash and gold last-stand outline |

PNG body selection uses the existing Pixel Art setting and image revision. Off retains the established procedural styles and palettes, with corrected facing; swordsmen retain the legacy square body and a small facing cue. Loading or failed atlases use matching procedural Hero/Valkyrie/summon views and the previous imported swordsman PNG (or its legacy square if that is also unavailable). Front views for existing procedural bodies retain their original pixels. Brawlers, assassins, spearmen, hoplites and lancers retain procedural bodies, with directional face cues and equipment. Ranged troops, enemies and Simple Troops are unchanged.

Cached native crops are immutable, so merged outlines can cache their silhouettes. Art revisions clear the crop cache. Existing cape opacity, summon fading, cloak and reduced-motion behavior remain in their original renderers.

This is a facing correction and partial body PNG coverage, **not a completed unit art migration**. It preserves the existing special-unit palette and scale rather than redesigning their appearance. Full equipment/path coverage, UI portraits and the unified unit-grid/palette audit remain in the [inventory](PIXEL_ART_INVENTORY.md).

## Verification

- `tests/defend-melee-facing.test.ts`: travel around corners, repeated paints, combat/idle, spawn/reset, diagonal stability, family classification, upgraded reach and exact reproducible PNG pixels/padding.
- `node tests/melee-facing.mjs`: isolated desktop/phone gallery, four rendered directions for every melee family with Pixel Art on/off, PNG/procedural parity, combat/idle, toggles, merged/Simple Troops and failed-asset visibility. Screenshots: `test-results/melee-facing-960.png` and `melee-facing-390.png`.
- Existing `node tests/melee-capes.mjs` and `node tests/defend-hero.mjs` cover cape settings/opacity/motion and real Hero halls, trees and combat.

Browser checks require the Vite server; `TEST_URL` and `PLAYWRIGHT_EXECUTABLE` select it and the installed Chromium. Fixtures use isolated contexts and never touch a player's saves.
