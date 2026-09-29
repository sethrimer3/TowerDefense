# TowerIncramental

A playable, original mobile-first incremental tower RPG. Canvas draws the dungeon and pixel entities; accessible DOM controls provide navigation, statistics, inspection, and progression. No backend or runtime game engine.

## Run

Use Node.js 22.18+ (tested with 24.15) and npm:

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

Open the local URL printed by Vite. In the forest before a run, tap an open tile to walk to it, fighting monsters and collecting items along the route. Swipes move one tile in any cardinal direction. Keyboard arrows / WASD also work; on-screen arrows are off by default and can be enabled in Settings. Monsters on manual routes are fought even when lethal. Missing keys stop movement at the necessary door, with a fading red X; unreachable wall targets get the same feedback at the tapped spot. Routing prefers an available detour over a door for which no key is held.

Inside a Tower or Delve run, your **hand** of cards moves the hero instead; taps only inspect, and swipes and keys do nothing (except in Dev mode, which also starts the hand paused). A new profile's hand is, in priority order: **Stairs** (the stairs up; in the Delve, the highest open tile in view), **Heal** (a potion), **Door** (a door you hold the keys for), **Key**, and **Monster** (any monster that can be fought, even a lethal one). An **Equipment** card (an ATK or DEF pickup) exists but is earned later. Whenever the hero has no path to follow, the first card that can reach a target over open floor and items picks its closest one, and the hero walks the shortest path there, one step per Automove tick, taking the items on the way; the card glows as it moves. When no card can act, the hand pauses and End Run lights up: the run ends only when you end it. Whatever you do next (using an item, and later a skill) checks the hand again, and it plays on by itself once a card can act. The play/pause button (where Automove was) pauses the hand to look around or use an item, and undo pauses it too. The cards sit in the row under the board, in the hand's five slots. Each run keeps the hand as it was ordered when the run went inside, however the hand is rearranged before the next.

The Inspiration tree's first skill, **Hand Ordering** (1 Inspiration), adds a **Deck** tab after Tower and Delve. The Deck page shows the hand's five slots along the top; dragging a card to another slot (or moving a focused card with the arrow keys) shifts each card in between over one, and the new order is saved at once. The deck's other cards will wait below, a section that is locked for now. Until the Deck is first visited, its tab carries a red dot; that visit teaches the drag: a note explains the order and a hand points at STAIRS, the other cards and tabs stay disabled until STAIRS is moved, and a dialog then praises the new order.

Fights loosen the classic Magic Tower rule that DEF equal to a monster's ATK makes it harmless: after every round of a fight the monster's ATK rises by 1% (rounded down), and by at least 1. High DEF still holds a monster off for a while, but never forever, and a fight with a monster the hero can barely scratch grows lethal instead of dragging on. The inspect panel's damage already counts the rise.

With **Animate fights** on (the default; turn it off in Settings to settle fights at once), stepping into a monster plays the fight out: the hero waits on its own tile and strikes first, the monster strikes back, and each strike's damage rises in red off whoever was struck (a darker red off the hero) while HP counts down in the stats. The HP the fight has cost so far shows in purple on the HP bar, just past the HP left, and shrinks away over a second once the fight is over. A health potion, picked up or crafted and drunk, does the opposite: the HP it heals shows in light red past the HP you had, the red bar fills up over it in a second, and the HP actually healed rises in green over the hero. The first round's strikes take 0.25 s each, and each later round runs at 90% of the one before, down to 0.05 s a strike. Once the monster falls the hero steps onto its tile. Either way, every reward picked up (an item, a chest's Gold and materials, a monster's drops) rises from its tile as its sprite for about a second, starting at once over anything still rising (what comes together, like a chest's Gold and materials, one after another); rewards with no sprite rise as "+N" text. A door raises each key it took with a minus sign, and a Heart Door a heart with a check. Taking the stairs snaps the hero straight onto the new floor with a brief white glow behind it, and while the hero stands on the board's bottom row the status line over it turns half see-through. Undo during a fight takes back the whole fight. The stats show the Gold found so far this run beside ATK and DEF; undo never takes Gold back, so it never lowers the count.

Every monster defeated pays XP (more for stronger monsters), and XP carries over between runs. The level shows as a large number at the front of the XP bar under the hero's portrait, which fills with the current level's progress; hovering it shows the XP gained toward the next level and what that level needs. Reaching a new level bursts fire outward from the hero, surrounds the hero with a glow for two seconds (fading over the last half second), and flashes "LEVEL UP!" over the board. Each level earns 3 **training points**, spent on the Upgrades page's Training tab: a table of the hero's stats, each with its current value, the value one more rank makes it, and the cost, at 1 point for +10 max HP, 3 for +1 DEF and 5 for +1 ATK. A new hero starts with 100 max HP and no DEF. Training applies at once to a run still in the forest.

Movement transitions can be set to **Smooth** (default), **Fast**, or **Off (instant)** in Settings. This controls camera and player interpolation on both axes; Reduce motion overrides it with instant movement.

Matching open left/right world edges wrap to each other. Locked doors and enemies at the destination still apply. Openings have no solid frame across them and show continuation chevrons. Viewport cropping is not a wrap boundary; the world is 30 tiles wide. Vertical movement remains continuous upward.

**Undo** restores one move (a tapped route counts as a single move), including combat, pickups, gear, keys, doors, height, and the XP a kill paid (with any level it reached). It cancels any queued route. One history slot is available initially; four levels of **Echoes of time** expand capacity to 2, 3, 4, then 5 moves. History persists across refreshes.

Death immediately starts a fresh run at the entrance (floor 1 / height 0) and clears normal undo history. The **Revive** upgrade changes the button to Revive until the first successful move in the new run. It restores the state immediately before the fatal move. A blocked move does not expire it; undoing the first new move cannot bring it back. Rewards are credited as they are earned and never rolled back, so reviving cannot duplicate them. Revive eligibility also persists across refreshes.

Rewards are credited as you climb (Courage for every 10 Delve height, Inspiration for each new Tower floor and floor clear), so retiring from Settings simply starts a fresh run. Starting-stat and equipment upgrades apply on the next ascent; Wayfinder, Revive, and undo-capacity upgrades unlock immediately. In the forest, Automove still avoids lethal fights; it and the hand pause off the board, in dialogs, and when hidden. No offline progress is calculated.

Inside a run, the row of tabs at the bottom (Tower, Delve, Deck, Defend, Gear, Upgrades, Settings) is hidden and its space left empty: modes, gear and upgrades are chosen in the forest before a run, and a run ends back there. The Settings button in the stats opens the Settings page at any time, with a Back button to the board. Once **Steadfast wayfinder** is owned, the page also holds **Automove turns off upon death**. Inside a run the Automove button plays and pauses the hand.


## How it's built

Three modes share one page: **Tower** (compact 17 × 17 puzzle floors, generated strategy-first like a Magic Tower), **Delve** (one endless, wrapping labyrinth), and **Defend** (a city-defense simulation). Worlds are generated deterministically from the run seed, and only your changes to them are saved. The viewport shows 17 × 17 tiles with the entrance at the bottom center (20 × 20 in the forest outside); in the Delve, terrain below the last milestone gate can't be revisited.

Code lives in `src/`, with the Tower generator and its floors in `src/tower/`, the Delve labyrinth and its board in `src/delve/`, Defend in `src/defend/`, and the pages, HUD and dialogs in `src/ui/`. Design documents are in `docs/`. Architecture notes, generation invariants, and development commands for contributors (human or AI) are in [AGENTS.md](AGENTS.md).

## Browser verification

Start `npm run dev` in another terminal, then run `npm run test:browser`. See [AGENTS.md](AGENTS.md) for browser-channel and screenshot details.

## GitHub Pages

The included `.github/workflows/static.yml` installs dependencies, runs tests and the production build, then deploys **dist/** on pushes to `main` or manual workflow dispatch. In repository Settings → Pages, select **GitHub Actions** as the source. Vite uses relative asset paths for repository subpaths.

## Prototype boundaries

Room variety and balancing are introductory. Locked passages gate both ascent routes and reward branches; enemies inside chambers are often avoidable. Fights play out unless Animate fights is turned off. Automation prioritizes nearby upgrades and safe ascent, rather than globally optimal inventory planning. Very old tower sections cannot be revisited. Unsupported save-format versions reset safely. Layout-version migration retains progression, stats, and inventory, clears old map edits, and relocates the player to their current section entrance. All text uses the bundled variable Cinzel font from `assets/fonts/Cinzel/`; no remote font service is used. Weather is the only sound. There is no offline progression, cloud save, or installable PWA.
