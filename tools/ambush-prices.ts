/** Regenerate native base-building price estimates without reading a player save. */
import { STRUCTURES } from '../src/defend/catalog.ts';
import { defaultDefendSave } from '../src/defend/progress.ts';
import { AMBUSH_PALETTE } from '../src/campaign/plans.ts';
import { ambushPrice } from '../src/campaign/economy.ts';
const levels=defaultDefendSave().levels;
console.log('# Ambush deployment economy\n');
console.log('Every zone starts Levels I/II/III with **500/600/700 gold**. This wallet is local to the level and separate from Mine metals. A retry or reload starts a fresh wallet and empty build grid. Old saved pad layouts are discarded; best stars remain saved.\n');
console.log('The palette offers **Melee Guild, Ranged Guild, Archer Tower, Cannon Tower and Wizard Tower** to every player. Each uses native Defend combat at base Armory levels. Defend ownership, Knowledge paths and Smithy upgrades do not enter the Ambush battle. Purchases and sales work during waves. Before battle, a sale returns the exact investment; the current battle refund is 70%, rounded down to tens. Phase 6 adds local gold upgrades and the full-refund exception until wave 2.\n');
console.log('## Rough base pricing\n\n    cost = round10(40 + 12 × potentialDPS × (1 + min(range, 20) / 20) × replacementMultiplier + durabilityAllowance)\n');
console.log('Infantry assumes a full native base garrison. Cannon splash assumes 2.5 targets; wizard splash assumes two. These are pricing estimates only; all damage, fire rates, special abilities and projectiles run through DefendSim. Prices round to the nearest ten, minimum 10.\n\n| Building | Base potential DPS | Gold |\n|---|---:|---:|');
for(const kind of AMBUSH_PALETTE){const p=ambushPrice(kind,levels);console.log('| '+STRUCTURES[kind].name+' | '+p.dps.toFixed(1)+' | '+p.cost+' |');}
console.log('\n## Kill gold\n\n    difficulty = maxHP / 12 + (damage / cooldown) / 2 + speed / 1.2\n    bounty = round10(4 × difficulty) (minimum 10)\n');
console.log('Native enemy deaths pay once. Escapes and fortress body parts pay nothing; the fortress core earns its bounty. Gold arrives immediately and can fund an in-wave purchase. Siege never uses this wallet. Starting budgets, prices and rewards remain provisional until the Phase 8 scripted balance runs.\n\nRegenerate:\n\n    node --experimental-transform-types --import ./tests/pin-random.ts tools/ambush-prices.ts > docs/design/AMBUSH_ECONOMY.md');
