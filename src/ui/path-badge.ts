/** A building's Knowledge path on its face: the worn rank's icon as a small
 * medallion badge, and the path look its building's icon takes
 * (`PATH_LOOKS`). Shared by Tiles, the Study and Defend. */
import { pathById, type PathId } from "../knowledge-paths.ts";
import { specialtyLabel } from "../specializations.ts";
import { artLook } from "../defend/tower-art.ts";
import { paintPathIcon } from "./path-icons.ts";

const ROMAN = ["", "I", "II", "III", "IV", "V"];

/** The badge for a building wearing `path` at `rank`, "" for none. */
export function pathBadge(s: { path: PathId; rank: number } | undefined): string {
  if (!s?.rank) return "";
  const p = pathById(s.path), r = p.ranks[s.rank - 1];
  return `<span class="path-badge hue-${p.hue}" title="${specialtyLabel(s)}: ${r.name}" aria-hidden="true"><canvas data-path-icon="${r.icon}:${p.hue}"></canvas><b>${ROMAN[s.rank]}</b></span>`;
}

/** ` data-look="…"` for `kind`'s icon wearing `path`, when the path has a look. */
export function pathLook(kind: string, path?: PathId): string {
  const look = artLook(kind, path);
  return look ? ` data-look="${look}"` : "";
}

/** Paints every path icon (`data-path-icon="icon:hue"`) under `root`. */
export function paintPathIcons(root: ParentNode) {
  root.querySelectorAll<HTMLCanvasElement>("canvas[data-path-icon]").forEach((c) => {
    const [icon, hue] = c.dataset.pathIcon!.split(":");
    paintPathIcon(c, icon as never, hue as never);
  });
}
