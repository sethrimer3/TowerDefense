# Realm workshops and economy buildings

All is the first subject in both the Smithy and Study. It contains owned tiles only. Realm replaces City and the retired shared troop/tower pages. Realm contains the Keep, city tiles and walls, gates, wall spikes, wall ballistas, Repair shops, bait, Mine and Library. Towers, Infantry and Spells provide focused collections. A kind unfolds its owned copies; selecting a copy opens individual equipment or its native Knowledge tree. Spell and city infrastructure upgrades retain their native trees.

## Economy buildings

Mine and Library are real 4 × 4 city structures with 250 HP. Every player receives one of each in the collection; additional copies cost metal. Place one to unlock its navigation tab and production. Lifting the last copy pauses production and work without deleting the crew, furnishings, resources or upgrades. Replacing it resumes. While unplaced, wall time does not accumulate production. Existing saves retain their city and progress and receive missing economy tiles in their collection.

## Smithy tuning (assumptions)

Each combat building has its own Armour & vitality and Weapons & power ranks: +5% building/trained troop HP and +5% direct damage per rank, up to 50. Equipment persists through movement, lifting, replacement and evolution of its copy. Copper price is `1 + 5 × rank²`, with existing Forge timing `120 × (rank+1)²` smith-seconds and shared named smiths. Cancellation refunds the actual bill.

The Mine's Realm tile offers Miner efficiency (2% work pace per rank) and Miner power (2% faster excavation per rank). The Library offers Librarian efficiency (2% faster walking and work) and Librarian power (2% more Knowledge). All four have 50 ranks and use existing Training tier prices and timed staffing: `1 + 5 × rank²` metal, copper through rank 9, silver through 24 and gold after; `60 × (rank+1)²` seconds with precious-metal work weights. These are gradual, permanent upgrades, separate from the Mine and Library Knowledge trees.

## Migration

Save schema 8 refunds the retired shared troop/tower skills, Training and Forge purchases and cancels/refunds reserved work on those targets. Native individual Knowledge paths and city/spell progression remain. Refunds are idempotent because retired ranks/jobs are cleared. Legacy tables remain available solely for decoding and historical pricing. Adding the economy kinds and four Training fields intentionally changes decoding/save fixtures; city generation and replay outputs should remain stable at zero ranks.
