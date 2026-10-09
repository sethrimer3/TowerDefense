/** A card's Knowledge path on its face: the equipped rank's icon as a small
 * medallion badge, and the path look its building's icon takes
 * (`PATH_LOOKS`). Shared by Tiles, the Study and the Defend palette. */
import { cardLabel, type OwnedCard } from "../cards.ts";
import { pathById } from "../knowledge-paths.ts";
import { artLook } from "../defend/tower-art.ts";
import { paintPathIcon } from "./path-icons.ts";

const ROMAN = ["", "I", "II", "III", "IV", "V"];

/** The badge for `c`'s equipped path (or its evolution's crown), "" for an
 * unspecialized card. */
export function cardBadge(c: OwnedCard | undefined): string {
  if (!c) return "";
  if (c.evolved) return `<span class="path-badge hue-gold" title="${cardLabel(c)}" aria-hidden="true"><canvas data-path-icon="crown:gold"></canvas></span>`;
  if (!c.path || !c.rank) return "";
  const p = pathById(c.path), r = p.ranks[c.rank - 1];
  return `<span class="path-badge hue-${p.hue}" title="${cardLabel(c)}: ${r.name}" aria-hidden="true"><canvas data-path-icon="${r.icon}:${p.hue}"></canvas><b>${ROMAN[c.rank]}</b></span>`;
}

/** ` data-look="…"` for `c`'s building icon, when its path has a look. */
export function cardLook(c: OwnedCard | undefined): string {
  const look = c && !c.evolved ? artLook(c.kind, c.path) : "";
  return look ? ` data-look="${look}"` : "";
}

/** Paints every path icon (`data-path-icon="icon:hue"`) under `root`. */
export function paintPathIcons(root: ParentNode) {
  root.querySelectorAll<HTMLCanvasElement>("canvas[data-path-icon]").forEach((c) => {
    const [icon, hue] = c.dataset.pathIcon!.split(":");
    paintPathIcon(c, icon as never, hue as never);
  });
}
