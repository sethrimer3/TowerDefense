/** Ambush's local upgrades follow native choices, priced in gold rather than Knowledge. */
import { ambushPrice } from "./economy.ts";
import type { StructureKind } from "../defend/catalog.ts";
import { placeOf, type UpgradeStep } from "../specializations.ts";
export function ambushUpgradePrice(kind: StructureKind, step: UpgradeStep) {
  const base = ambushPrice(kind).cost;
  // A tier table is deliberately bounded; native Knowledge prices span six orders of magnitude.
  const factor =
    step.type === "merge"
      ? 1.5
      : step.type === "path"
        ? ([0, 0.4, 0.65, 1][step.rank] ?? 1)
        : placeOf(step.to).tier === "beyond"
          ? 2
          : placeOf(kind as Exclude<StructureKind, "keep">).tier === "basic"
            ? 0.55
            : 0.7;
  return Math.max(20, Math.round((base * factor) / 10) * 10);
}
