# Ambush star tree
The tree belongs to the Ambush level selector and never changes Defend, Siege, Knowledge, Smithy, metals or inventory. Its pool is the sum of each level's best rating minus invested stars, at most 90. Improving a best rating adds only the difference. Losing a battle never removes earned stars.

Every branch is independent. Initial prices are **2/3/5 stars** for ranks I/II/III, except Head start at **3/7 stars** for ranks I/II. All ranks together cost 90 stars. These are balance assumptions, adjustable from measurements.

| Branch | Effect per rank |
|---|---|
| War chest | +50 starting gold |
| Bounty | +5% native kill gold; fractional gold remains in the level wallet |
| Masons | −5% base building prices, rounded to tens |
| Quartermaster | +5 percentage points to the 70% post-wave-one refund |
| Drillmasters | +5% tower/troop damage and troop HP |
| Palisades | +15% outpost house/fence HP, retained through house re-planning; rank III rebuilds the fences and wooden gates as stone walls and gatehouses (a whole stone wall's HP instead of a tenth) |
| Keep walls | +20% keep and castle-wall HP; outpost fences use Palisades instead |
| Battle magic | −10% native strike cooldowns; spells retain base damage and paths |
| Head start | One/two free native Archer Towers, placed deterministically beside the track |

Undo removes the chosen rank and every rank above it. Respec removes every rank. Both are free and instant, and derived pool accounting returns the stars without minting currency. Free towers have zero purchase investment; only paid local upgrades can be refunded.

Ranks are optional under campaigns.ambush.ranks. Decoding keeps only known integer ranks and trims imported overspending to earned stars. Missing fields leave old saves unchanged. Optional per-level attempt counts are bounded; a successful first-wave send increments one attempt, and defeat saves no completion.

The native UpgradeGraph, TreeMotes and MagicCircle draw the tree. A named branch picker makes all nine branches available on phones. Closing it or leaving the selector destroys its graph and animation loops. Battle bonuses snapshot at level start.

Tests: ambush-star-tree.test.ts covers pool conservation, imports, round trips and every branch in a native battle; ambush-star-tree.mjs covers buying, undo, respec, free starting towers, attempt saving and the native graph at desktop and phone widths.
