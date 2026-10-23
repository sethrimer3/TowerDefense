# Mage Guild: Stormcallers, Pyromancers and Cryomancers

Status: approved by the user. Values marked **proposed** below were accepted as the initial tuning.

Scope: the **Mage Guild troop building**, reached through Ranged Guild → Mage Guild. Three mutually exclusive building attunements train elemental mage troops, each with an initial form and three sequential Knowledge upgrades. The user's requested identities are long-distance chain lightning with critical hits, fire area damage with lingering burns, and freezing/slowing. Names and numerical tuning below are **proposed**.

The ordinary Mage Guild retains its current fireball troops. Attuning changes their attack immediately. All three retain ordinary mage health, movement, recruitment and 2.1-second attack cadence, with their existing shared troop bonuses (**proposed**).

## Storm Hall → Stormcallers (`stormHall`, new `conduction` path)

Lightning replaces fireballs. The mage attacks from long range, chaining through several distinct enemies with a chance for each hit to be critical. All values in this table are **proposed**.

| Step | Name | Initial target range | Maximum enemies per cast | Maximum jump distance | Critical chance per hit |
| --- | --- | --- | --- | --- | --- |
| Attune | Storm Hall | 9 cells | 3 | 3 cells | 10% |
| I | Distant thunder | 11 cells | 4 | 3.5 cells | 15% |
| II | Arc mastery | 13 cells | 6 | 4 cells | 25% |
| III | Tempest circuit | 15 cells | 8 | 4.5 cells | 35% |

- Critical hits deal **2× damage**. Let D be the mage's normal direct spell damage, including Forge/Training/banner bonuses. The first hit deals D; each successive hit retains **85%** of the previous hit's non-critical damage (**proposed**). A critical does not amplify later links.
- Choose the nearest living enemy within initial range, then the nearest unstruck enemy within jump distance of the previous target. The chain can extend beyond initial casting range; the limit includes the first target. Each enemy can be hit only once per cast. No target in reach means no cast or critical roll (**proposed**).
- Roll critical chance independently for actual hits, using the battle's seeded RNG. Critical hits visibly flash brighter. Use existing lightning damage/resistance/shield rules, including airborne targets; no friendly fire (**proposed**).
- Lightning replaces both the fire explosion and burning ground. This mage holds its position while attacking and otherwise follows the normal mage movement/banner behavior (**proposed**).

## Inferno Hall → Pyromancers (`infernoHall`, existing `pyroclasm` path)

Merge the existing fire-AOE and lingering-fire identities into this one attunement. On attuning, fireballs have a larger blast, the entire blast area stays aflame, and fire clings to victims after they leave it. This last behavior is available immediately, rather than waiting until the final upgrade. All values below are **proposed**.

| Step | Name | Impact and burn DPS multiplier | Blast and ground-fire radius multiplier | Ground-fire lifetime at Forge rank 0 | Clinging burn after contact |
| --- | --- | --- | --- | --- | --- |
| Attune | Inferno Hall | 1× | 1.25× | 4 seconds | 2 seconds |
| I | White heat | 1.4× | 1.35× | 5 seconds | 2.5 seconds |
| II | Wildfire | 1.8× | 1.5× | 6.5 seconds | 3 seconds |
| III | Inferno | 2.3× | 1.8× | 8 seconds | 4 seconds |

- Multipliers compare with an ordinary mage's direct damage D, ordinary ember DPS B, and ordinary fireball blast radius. They replace earlier rank values. Both ground and clinging burn use B times the tier's damage multiplier (**proposed**).
- Keep mage casting range at **4.5 cells**. Ground fire occupies the entire upgraded blast disk rather than the ordinary 85% share. Its lifetime scales with existing `emberSeconds` Forge research, using lifetime multipliers **4/3, 5/3, 6.5/3, 8/3**; table durations are before Forge bonuses (**proposed**).
- Existing Lingering embers Forge research continues to improve burn DPS and lifetime. Existing fireball damage/radius research applies before attunement multipliers. Fireball hit victims ignite immediately; ground enemies walking into the fire ignite too. Fliers can be hit by the initial burst and its applied burn, but do not contact ground flames (**proposed**, using existing fire-arrow burn rules for airborne victims).
- Repeated clinging applications refresh duration and retain the hotter existing burn rather than multiplying duplicate burn statuses. Existing separate ground-fire patches may overlap, matching current fire gameplay (**proposed**).
- Retain existing water extinguishing, fire resistance and fire/ice cancellation rules; damage spares friendly troops and buildings. This branch replaces the old tier-III side explosions with the larger, longer-lived inferno (**proposed**).

## Frost Hall → Cryomancers (legacy `cinderHall` / `cinders` IDs)

Replace the second fire-only attunement with a frost troop family. Icy projectiles replace fireballs: their impact chills an area and briefly freezes susceptible enemies. All values below are **proposed**.

| Step | Name | Casting range | Impact radius multiplier | Slow amount | Chill duration | Freeze duration |
| --- | --- | --- | --- | --- | --- | --- |
| Attune | Frost Hall | 5.5 cells | 1× | 50% slower | 2 seconds | 0.35 seconds |
| I | Deep chill | 6 cells | 1.15× | 55% slower | 3 seconds | 0.5 seconds |
| II | Winter's grasp | 6.5 cells | 1.3× | 60% slower | 3.5 seconds | 0.75 seconds |
| III | Absolute zero | 7 cells | 1.6× | 65% slower | 4 seconds | 1 second |

- Direct impact damage is **75% of normal mage damage D** at all tiers, trading damage for control (**proposed**). Radius multipliers apply to the ordinary fireball radius after shared Forge bonuses. There is no burning ground or clinging fire from these projectiles (**proposed**).
- Every enemy hit in the disk receives frost damage and the tier's chill; susceptible enemies also freeze. Freeze and chill timers begin on impact, so chill remaining after thaw is the listed chill duration minus the freeze duration (**proposed**).
- Repeated mage chills use the strongest active mage slow and refresh that effect's duration; they do not multiply with one another. Repeated freezes refresh by maximum remaining duration rather than adding durations. When the stronger slow expires, weaker active chill can remain; do not globally strengthen other frost sources (**proposed**).
- Respect existing unyielding immunity to slowing/freezing. Existing elemental damage protection still applies. Support airborne targets consistently with other existing frost attacks, and retain existing fire/ice cancellation. Cryomancer upgrades do not grant Frost nova research effects or change Wizard Tower attacks (**proposed**).

## Costs, compatibility and presentation

- Panel/placement: the Mage Guild's individual building Knowledge tree, with three sibling attunements and three sequential ranks per path. Reuse the existing **5 Knowledge** attunement price for Inferno/Frost; charge **5 for Storm Hall (proposed)**.
- Each path uses existing `studyPathCost(5, rankIndex)`: **5 / 5,005 / 20,005 Knowledge**. Availability follows the current Mage Guild unlock; Knowledge comes from the Library, so no new wave gate is introduced (**proposed**).
- Keep saved Inferno Hall/`pyroclasm` IDs and ranks. Display the existing Cinder Hall/`cinders` IDs as **Frost Hall / Cryomancy**, retaining purchased tier, placement and normal undo/respec/refund accounting (**proposed compatibility mapping**). Existing Cinder Hall troops therefore become Cryomancers on the next battle; Inferno Hall takes on the combined fire identity.
- Existing mage direct-damage Forge/Training bonuses scale the direct spell damage of all three branches. Rename the player-facing `mageFireball` Forge row to **Spellpower (proposed)**, keeping its saved ID and prices; its radius bonus applies to Fire/Frost AOE, while lightning gets direct damage only. `mageEmbers` remains fire-specific. Dark Wizard and Wizard Tower research stay scoped to their current users.
- Use each troop's home building battle snapshot, including when different attunements fight together. Projectile/ground effects retain their originating tier after a mage dies. Purchases apply to the next defense, following existing building upgrade behavior.
- Procedural robe, staff, hall and projectile variants distinguish pale-blue/gold lightning, warm fire and icy blue/white frost. Preserve the established art grid, graphics settings and Reduce Motion behavior. No replacement PNG collection or sprite guidelines are introduced.
- The Mage Guild's ultimate is still undefined; this specification completes its three attunements and their ranks (**proposed scope**).

## Implementation and verification after approval

Register Storm Hall and its path across catalog, save decoding, topics, trees, collection, stats and procedural art. Redesign existing Inferno/Cinder descriptions and per-home mage attack dispatch. Centralize all tuning beside Knowledge paths. Reuse appropriate lightning/fire/frost presentation while keeping these effects independent of Dark Wizard, Wizard Tower, Mortar and spell research. Add only transient combat state for chain criticals and independently timed mage chills; combat reads battle snapshots, never the live save. Update README, AGENTS.md, CONTEXT.md and docs/DEFEND.md.

Verify all four tiers per attunement: target range and chain limits, no repeat hits, independent criticals and falloff, no extra RNG for ordinary mages; fire impact/burn scaling, area, lifetime, clinging refresh, resistance and water; frost slow strength/duration, freeze refresh, immunity, overlap expiration and fire cancellation. Check mixed halls, source death, Forge/banner bonuses, old saved ranks, third-branch purchases and undo/refunds. Exercise real desktop/mobile tree purchases and troop effects, both graphics settings and Reduce Motion. Run focused tests, the full test suite and production build before committing.
