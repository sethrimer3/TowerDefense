# Melee facing

Melee troops face their observed travel direction while walking, a live target within their weapon's reach while stationary, and their last heading while idle. Path direction seeds newly visible units only. Four upright body views (south, west, north, east) have a small diagonal hysteresis so minor movement does not chatter between frames. Weapons, shields, fists and horses use the continuous heading. Hero slashes/spins and Valkyrie charges retain their attack animation and directional afterimages.

`src/defend/melee-facing.ts` keeps presentation state in a WeakMap keyed by the actual soldier. It changes no soldier fields, simulation state, saved data or random streams. Two painters in the same tick retain the same walking heading. Restarting the clock resets the heading. Capes remain simulated in world space; turning a body never rotates or stretches its cloth chain.

## Art and settings

Bodies use the established procedural glyphs and palettes in `melee-body-data.ts`, cached by `melee-body.ts`. Hero, Valkyrie and melee summon views keep their original dimensions and anchors. Swordsmen keep their legacy square with directional equipment/a facing cue. Brawlers, assassins, spearmen, hoplites and lancers retain procedural bodies and equipment.

The checkbox-gated body PNG atlas and its generator were removed with the rejected PNG collection. Existing directional behavior, cloth physics, fading, cloak, merged outlines and Simple Troops remain.

## Verification

- `tests/defend-melee-facing.test.ts`: travel around corners, repeated paints, combat/idle, spawn/reset, diagonal stability, family classification, upgraded reach and complete procedural views.
- `node tests/melee-facing.mjs`: isolated desktop/phone gallery, four rendered directions for every melee family with Pixel Art on/off, procedural body stability, combat/idle, toggles, merged/Simple Troops and legacy visibility. Screenshots: `test-results/melee-facing-960.png` and `melee-facing-390.png`.
- Existing `node tests/melee-capes.mjs` and `node tests/defend-hero.mjs` cover cape settings/opacity/motion and real Hero halls, trees and combat.

Browser checks require the Vite server; `TEST_URL` and `PLAYWRIGHT_EXECUTABLE` select it and the installed Chromium. Fixtures use isolated contexts and never touch a player's saves.
