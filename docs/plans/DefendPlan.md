# Defend plan (started)

Defend is the main mode: the player builds a walled city round the keep on Defend's tile and quarter grid, and survives ever larger waves across ten zones. This file collects planned Defend work. Seth's 2026-10-27 brief gave Defend the shared items below; add new Defend ideas here as they come, each with a short reason and the files it touches.

Follow the architecture guidelines in [AmbushPlan.md](AmbushPlan.md#architecture-guidelines) and AGENTS.md. Defend's replay, city and fence goldens are the guard rails: only an intended gameplay change re-records them, in the same PR, with the reason in the commit message.

## From the brief (shared work, see OtherPlans.md)

1. **Fences become walls** with about 10% of a wall stone's HP. This is a real gameplay change for Defend: parks' fences start blocking enemies and must be smashed. Re-record goldens. OtherPlans.md §1.
2. **Strike spell quick bar**: translucent spell icons in the board's bottom left, tap to arm and tap the board to cast, recharge fill, ready flash and sound. The current Skills palette drag becomes the optional "Strike spells in a menu" Gameplay setting. Bombs and the war banner stay in the Skills palette. OtherPlans.md §2.
3. **New pixel-art Defend and Settings tab icons.** OtherPlans.md §3.
4. **Currency bar hidden on Defend** (it shows only on Mine, Library and Tiles), which gives the board more height, especially on phones. Check the header and board still fit at 390 × 844 with the extra room. OtherPlans.md §4.

## Ideas carried over from Ambush (to discuss with Seth)

- **Per-building stats** (kills, total damage, DPS this wave) on the building card when tapped in battle. The tally sink built for Ambush (AmbushPlan.md phase 6) can feed Defend's inspect card at no cost to the replay, since it sits outside the hashed state.
- **Send next wave early** button in Defend, for fast players, with the same "no bonus" rule, or with a small bonus if Seth prefers Defend to reward it.
- **Wave preview** of the next wave's enemy portraits beside the wave box.

## Backlog

Add Defend items here in the form: **What** (one line), **Why**, **Files**, **Tests**, **Status**.


## Dark One enemy migration (2026-10-29)

- [x] Inventory all Ambush levels/waves and Defend wave families as outdated; maintain the per-wave [migration tracker](../design/ENEMY_MIGRATION.md).
- [x] Update only Defend wave 1: 30 one-pixel Mini Darklings and five 2 × 2 Darklings, splitting into two minis each.
- [x] Add low-cost radial color drain around dense Dark One crowds, starting near ten neighbors, fully grayscale with 30% lower contrast at maximum density.
- [x] Update Defend waves 2–5 with the requested Darkling counts and 3 × 3 Large Darklings splitting into two Darklings; log exact compositions and both offspring generations.
- [x] Close contact attackers to the painted structure perimeter before damage; make stone-wall rims half an art pixel so they meet the enemy rim without empty ground. Share the approach gate with Ambush routes, boat rams and ice-cube strikes.
- [x] Deepen Darkling crimson; add a shared crowd-strength night halo; strengthen color-drain onset and protect unit bodies/shots while washing surrounding scenery.
- [ ] Migrate later waves toward roughly 90% plain pixel filler; identify medium enemies by equipment and retain complex sprites for rare high-strength threats. Track each composition and story exception in the migration log.
