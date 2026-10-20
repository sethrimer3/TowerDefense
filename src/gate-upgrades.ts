/** The city gate's upgrade tree: one tree for every gate in the city, its
 * branches climbed side by side like the walls' (`side-ranks.ts`):
 * Portcullis (enemies no longer slip in while your people go out, then
 * murder holes over the way in), Gate towers (small ballistas on the
 * gatehouse) and Ironbound (more HP, mending, rising again). The ranks are
 * saved on the Defend save (`DefendSave.gateRanks`, absent while it has
 * none) and snapshotted into `Bonuses.gate` when a battle starts. */
import { studyPathCost } from "./economy.ts";
import type { Save } from "./save.ts";
import { buySide, decodeSideRanks, respecSide, sideAllocated, sideRank, undoSide, type SidePath, type SideRanks, type SideResult } from "./side-ranks.ts";

export type GatePathId = "portcullis" | "gateTowers" | "ironbound";
/** How far the gates have climbed each branch (absent: not at all). */
export type GateRanks = SideRanks<GatePathId>;

// ── What each rank does in battle ─────────────────────────────────────────
/** Portcullis: from I the gate stays barred to the enemy while it swings
 * open for your own people; from II every `every[rank]` seconds each enemy
 * on foot within `reach` cells of a standing gatehouse takes
 * `damage[rank]` from its murder holes, and at III is set burning
 * (`burnDps` a second for `burn` seconds). */
export const PORTCULLIS = { bar: 1, every: [0, 0, 1.5, 1], damage: [0, 0, 18, 30], reach: 1.5, burnDps: 8, burn: 3 };
/** Gate towers: small ballistas on the gatehouse, one from I and two from
 * II, each shooting light bolts: `share[rank]` of a wall ballista's damage,
 * `range[rank]` cells, every `cooldown` seconds, piercing `pierce[rank]`. */
export const GATE_TOWERS = { share: [0, 0.45, 0.45, 0.7], range: [0, 9, 10, 11], cooldown: 2.2, pierce: [0, 2, 2, 4], twin: 2 };
/** Ironbound: the gate's HP times `hp[rank]`; from II a standing gate
 * mends `mend` of its HP a second; at III a fallen gate rises again whole
 * `rise` seconds after it fell. */
export const IRONBOUND = { hp: [1, 1.6, 1.6, 1.6], mend: 0.02, rise: 12 };

export const GATE_PATHS: SidePath<GatePathId>[] = [
  {
    id: "portcullis", name: "Portcullis", motto: "Out go your people, nothing comes in", hue: "steel",
    ranks: [
      { name: "Iron grate", icon: "mail", cost: studyPathCost(2, 0), text: "A portcullis drops behind your people: enemies can no longer slip in while the gate is open" },
      { name: "Murder holes", icon: "cannonball", cost: studyPathCost(2, 1), text: "Every 1.5 seconds, enemies on foot at the gatehouse take 18 damage from the holes above" },
      { name: "Boiling pitch", icon: "flame", cost: studyPathCost(2, 2), text: "Every second, for 30, and the pitch sets them burning" },
    ],
  },
  {
    id: "gateTowers", name: "Gate towers", motto: "Crossbows over the way in", hue: "ember",
    ranks: [
      { name: "Gate ballista", icon: "crosshair", cost: studyPathCost(2, 0), text: "A small ballista on the gatehouse shoots light bolts that pierce two enemies" },
      { name: "Twin towers", icon: "volley", cost: studyPathCost(2, 1), text: "A second small ballista, and both reach a cell further" },
      { name: "Bodkin bolts", icon: "arrow", cost: studyPathCost(2, 2), text: "Their bolts hit harder and pierce four enemies" },
    ],
  },
  {
    id: "ironbound", name: "Ironbound", motto: "Oak, iron and stubbornness", hue: "verdant",
    ranks: [
      { name: "Iron bands", icon: "hammer", cost: studyPathCost(2, 0), text: "The gate has 60% more HP" },
      { name: "Wardens' care", icon: "heart", cost: studyPathCost(2, 1), text: "A damaged gate mends 2% of its HP a second" },
      { name: "Ever-standing", icon: "oath", cost: studyPathCost(2, 2), text: "A fallen gate rises again, whole, 12 seconds after it fell" },
    ],
  },
];

export const gateRank = (ranks: GateRanks | undefined, id: GatePathId) => sideRank(ranks, id);
/** Whether the gates stay barred to the enemy while open for your people. */
export const gateBarred = (ranks: GateRanks | undefined) => gateRank(ranks, "portcullis") >= PORTCULLIS.bar;
/** The Knowledge allocated to the gates (what a respec gives back). */
export const gateAllocated = (ranks: GateRanks | undefined) => sideAllocated(GATE_PATHS, ranks);
export const upgradeGate = (save: Save, id: GatePathId): SideResult => buySide(save, "gateRanks", GATE_PATHS, id);
export const undoGate = (save: Save, id: GatePathId, rank: number): SideResult => undoSide(save, "gateRanks", GATE_PATHS, id, rank);
export const respecGate = (save: Save): SideResult => respecSide(save, "gateRanks", GATE_PATHS, "the gates have no upgrades");
export const decodeGateRanks = (raw: unknown): GateRanks | undefined => decodeSideRanks(GATE_PATHS, raw);
