/** Offline construction through the same copy upgrades the player uses. */
import type { Save } from "../save.ts";
import { buyItem } from "../defend/progress.ts";
import type { PlacedKind } from "../defend/layout.ts";
import { ATTUNED, BEYOND, branchKind, nextSteps, rootOf, upgradeBuilding, type SpecialtyTarget, type UpgradeStep, type Wear } from "../specializations.ts";
import { pathById } from "../knowledge-paths.ts";
type Copy = Extract<SpecialtyTarget, { copy: unknown }>;
export type NativeBuildEvent = { before: Copy; step: UpgradeStep };
const routes = new Map<string, UpgradeStep[]>();
const sameWear = (a: Wear | undefined, b: Wear | undefined) => a?.path === b?.path && (a?.rank ?? 0) === (b?.rank ?? 0);
function apply(game: Save, target: Copy, step: UpgradeStep, trace?: NativeBuildEvent[]): Copy {
  const result = upgradeBuilding(game, target, step);
  if (!result.ok || !result.copy || !("copy" in result.copy)) throw Error("Native copy upgrade failed: " + (result.ok ? "missing copy result" : result.reason));
  trace?.push({ before: structuredClone(target), step: { ...step } });
  return result.copy;
}
function finish(game: Save, start: Copy, kind: PlacedKind, wear: Wear | undefined, trace?: NativeBuildEvent[]): Copy {
  const key = JSON.stringify([start, kind, wear]);
  let route = routes.get(key);
  if (!route) {
    const queue = [{ game: structuredClone(game), target: start, steps: [] as UpgradeStep[] }],
      visited = new Set<string>();
    while (queue.length) {
      const node = queue.shift()!,
        state = JSON.stringify(node.target);
      if (visited.has(state)) continue;
      visited.add(state);
      if (node.target.copy === kind && sameWear(node.target.wear, wear)) {
        route = node.steps;
        break;
      }
      for (const step of nextSteps(node.target.copy, node.target.wear)) {
        if (step.type === "merge") continue;
        const candidate = structuredClone(node.game),
          result = upgradeBuilding(candidate, node.target, step);
        if (result.ok && result.copy && "copy" in result.copy) queue.push({ game: candidate, target: result.copy, steps: [...node.steps, step] });
      }
    }
    if (!route) throw Error("No legal native upgrade route to " + kind + " " + JSON.stringify(wear));
    routes.set(key, route);
  }
  let target = start;
  for (const step of route) target = apply(game, target, step, trace);
  return target;
}
export function buildNativeCopy(game: Save, kind: PlacedKind, wear?: Wear, trace?: NativeBuildEvent[]): Copy {
  const beyond = Object.entries(BEYOND).find(([, steps]) => steps?.some((s) => s.to === kind));
  if (beyond) {
    const first = buildNativeCopy(game, beyond[0] as PlacedKind, undefined, trace);
    return finish(game, first, kind, wear, trace);
  }
  const merge = ATTUNED.find((a) => a.ultimate === kind);
  if (merge) {
    const partners = merge.branches.map((branch) =>
      buildNativeCopy(game, branchKind(merge, branch), { path: branch.path, rank: pathById(branch.path).ranks.length }, trace),
    );
    const first = partners[0],
      step = nextSteps(first.copy, first.wear).find((s) => s.type === "merge" && s.to === kind);
    if (!step) throw Error("Native merge is not available for " + kind);
    const target = apply(game, first, step, trace);
    return finish(game, target, kind, wear, trace);
  }
  const root = rootOf(kind);
  if (!buyItem(game.defend, { copper: 0, silver: 0, gold: 0, free: true }, root)) throw Error("Cannot buy native root " + root);
  return finish(game, { copy: root }, kind, wear, trace);
}
