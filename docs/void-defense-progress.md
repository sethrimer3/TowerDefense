# Void Defense Implementation Progress Ledger

Tracks the ordered phases and acceptance gates from `VoidDefensePlan.md`.

## Phase Checklist & Gate Status

- [x] **Phase 0 — Establish baseline and migration map**
  - Created `pre-void-baseline` git tag.
  - Added `src/void/config.ts` and `docs/architecture/void-defense.md`.
- [x] **Phase 1 — New Void Defense shell and save model**
  - Implemented `src/void/save.ts` (`voiddefense.v1`), leaving `towerdefense.v1` intact.
  - Created isolated `src/void/main.ts` entrypoint with zero Mine/Library offline away-time invocation.
  - Added onboarding profile & play-style mode selector (`Build Under Siege` vs `Build & Watch`).
- [x] **Phase 2 — City-scale renderer and technical proof of concept**
  - Built `src/void/grid.ts`, `src/void/world.ts`, and `src/void/render.ts`.
  - Implemented `192x256` and `256x384` metropolitan grids with hierarchical avenues, cross-streets, alleys, plazas, and 120–250+ skyscrapers/buildings with directional drop-shadows and amber window arrays.
  - Implemented `16x16` dirty-chunk offscreen terrain layer caching and `Loupe` magnification.
- [x] **Phase 3 — Destructible terrain and building physics**
  - Implemented `src/void/physics.ts` with per-cell integrity, local connected-component support checks for damaged buildings, drifting debris fragments, and `depositMatterDisc` reclamation.
- [x] **Phase 4 — Void field, finite-energy encounter, zero-contact states, and basic Supplies wallet**
  - Implemented `src/void/void-field.ts` with `energyRemaining` reservoir, instantaneous tick work budget, deterministic `WORK_SCALE = 1000` fractional conservation, and sacrificial island perimeter sharing.
  - Distinguished all zero-contact resolution states (`cityConsumedDefeat`, `reservoirDepletedVictory`, `voidEradicatedVictory`, `awaitingDelayedPortal`, and `isolatedPocketContainment` burn).
- [x] **Phase 5 — First placeable towers, live during-battle interaction, and playable Landfall strike**
  - Implemented live placement, selling, and pre-combat relocation in `src/void/towers.ts` and `src/void/sim.ts`.
  - Included **Matter Cannon**, **Barrier Projector**, and playable **Landfall** strike in the core vertical slice.
- [x] **Phase 6 — Autonomous engineers, masons, 1-pixel riflemen, and immediate Void Node targets**
  - Implemented `1x2` engineers (hauling, repairing, blueprint construction, and over-100% building development) and `1x1` thermal riflemen.
  - Added crystalline **Void Nodes** near the frontier and bounded anti-Void frontier ablation (`minReservoirFloorFraction = 0.15` floor so cheap terrain/infantry loops cannot cheese the reservoir).
- [x] **Phase 7 — Minimal player guidance and autonomous logic upgrades**
  - Implemented user-drawn polyline wall blueprints and per-tower focus reticles, plus global AI logic nodes (`strategicMasonry`, `priorityTargeting`, `tacticalRetreat`).
- [x] **Phase 8 — In-run economy, accurate baseline scoring, and anti-instant-abort gate**
  - Implemented `src/void/scoring.ts` with periodic building-generated Supplies, baseline score cap at 100%, shared-per-map Sparks entitlement, and the participation gate preventing instant-abort Void Essence farming.
- [x] **Phase 9 — Single enormous elastic technology network**
  - Built `src/void/tech/catalog.ts`, `wallet.ts`, and `tech-ui.ts` across all 6 Resistance sectors.
  - Added backwards-compatible opt-in `spatialCulling` and `setSecondaryEdges` to `src/ui/upgrade-graph.ts`.
- [x] **Phase 10 — Futuristic strike abilities**
  - Implemented `landfall`, `containmentPulse`, `genesis`, `orbitalReinforcement`, and `seismicFrame`.
- [x] **Phase 11 — Resistance Operations: Lab and Engineering Bay**
  - Implemented `src/void/operations/scene.ts` showing the enormous evolving turret prototype with `1x2` welders and the Void specimen containment lab with `1x2` researchers, strictly cosmetic with zero offline income.
- [x] **Phase 12 — Modes, profiles, and progression campaign**
  - Implemented all 8 scenario configurations (`tutorialBreach`, `edgeAdvance`, `centralRupture`, `twinBreaches`, `delayedCollapse`, `archipelagoCity`, `organismEscalation`, `endless`) and mode-split records with single shared Sparks entitlement per sector.
- [x] **Phase 13 — Advanced towers, creative physics, and synthetic matter**
  - Implemented `wallSerpent`, `gravityAnchor`, `rocketTeam`, `heavyMechBay`, and the `matterSynthesis` Spark breakthrough.
- [x] **Phase 14 — Cosmic organisms and intelligent Void**
  - Implemented `nebulaWorm`, `constellationSpider`, `voidBloom`, `nebulaQueen`, and `voidBee` swarms funded out of the Void energy reservoir.
- [x] **Phase 15 & 16 — Art direction, UX, documentation, and verification**
  - Styled cyber-industrial orange/amber/steel UI vs starry midnight-violet Void (`src/void/void.css`), updated `AGENTS.md`, `CONTEXT.md`, and `docs/architecture/void-defense.md`, and verified all unit tests and production builds.
