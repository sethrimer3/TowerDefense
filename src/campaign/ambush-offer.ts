/** What an Ambush building's next upgrade is and does, for the options on
 * its building menu's top bar and the card the sidebar shows for the one
 * tapped: its face, name, a short description and a bullet list of what
 * changes. Presentation only: the numbers come from `kindStats` on a fresh
 * save, since Ambush plays with no Armory levels or Knowledge. */
import { defaults, type Save } from "../save.ts";
import { STRUCTURES, ITEM_NAMES, type PaletteItem, type StructureKind } from "../defend/catalog.ts";
import { pathById } from "../knowledge-paths.ts";
import { TROOPS, stepName, type UpgradeStep, type Wear } from "../specializations.ts";
import { kindStats } from "../ui/specialty.ts";

const ROMAN = ["", "I", "II", "III", "IV", "V"];

/** A step as a stable string, so a tapped option can be found again after a redraw. */
export const stepKey = (s: UpgradeStep) => (s.type === "path" ? `p:${s.path}:${s.rank}` : `${s.type}:${s.to}`);

/** The option's face: the building it becomes, or the path rank's icon with its numeral. */
export function stepFace(s: UpgradeStep, size = 32): string {
  if (s.type !== "path") return `<canvas width="${size}" height="${size}" data-icon="${s.to}"></canvas>`;
  const p = pathById(s.path), r = p.ranks[s.rank - 1];
  return `<span class="path-face hue-${p.hue}"><canvas data-path-icon="${r.icon}:${p.hue}"></canvas><b>${ROMAN[s.rank]}</b></span>`;
}

export type OfferText = { title: string; description: string; changes: string[] };

let base: Save | undefined;
const stats = (kind: StructureKind, wear?: Wear) => {
  try {
    return kindStats((base ??= defaults()), kind as PaletteItem, wear?.path, wear?.rank ?? 0).split(" · ").filter(Boolean);
  } catch {
    return [];
  }
};

/** How the numbers move from `before` to `after`: each changed line as
 * "old → new" when the two line up, else every new line. */
export function statChanges(before: string[], after: string[]): string[] {
  if (before.length === after.length) return after.flatMap((line, i) => (line === before[i] ? [] : [`${before[i]} → ${line}`]));
  return after.filter((line) => !before.includes(line));
}

/** The card's words for `step` taken by a building of `kind` wearing `wear`. */
export function offerText(kind: StructureKind, wear: Wear | undefined, step: UpgradeStep): OfferText {
  const before = stats(kind, wear);
  if (step.type === "path") {
    const p = pathById(step.path), r = p.ranks[step.rank - 1];
    const changes = [r.text, ...statChanges(before, stats(kind, { path: step.path, rank: step.rank }))];
    return { title: `${stepName(step)}: ${r.name}`, description: `${p.motto}.`, changes };
  }
  const to = step.to as StructureKind, troops = TROOPS[to as keyof typeof TROOPS];
  const changes = [
    `Becomes a ${ITEM_NAMES[to as PaletteItem] ?? to}${troops ? `, training ${troops.toLowerCase()}` : ""}`,
    ...(step.type === "merge" ? ["Uses up the two other buildings maxed on the other branches; their gold goes into it"] : []),
    ...statChanges(before, stats(to)),
  ];
  return { title: stepName(step), description: STRUCTURES[to]?.description ?? "", changes };
}
