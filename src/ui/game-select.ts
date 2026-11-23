import { t } from "../i18n/index.ts";
import { modeIconUrl, type ModeIcon } from "./mode-icons.ts";

/** The two games on one save: Defend+Siege (the realm, its Mine, Library and
 * Tiles, with Defend and Siege on the combat tab) and Ambush, played alone. */
export const GAMES = ["defendSiege", "ambush"] as const;
export type Game = typeof GAMES[number];

/** The game named by the address (`?game=defend` or `?game=ambush`), skipping
 * the start screen; `?game=choose` asks for it. Automated browsers (the
 * `tests/*.mjs` checks) go straight to Defend+Siege unless the address says
 * otherwise, so the checks written before the start screen still run. */
export function gameFromAddress(search: string, automated: boolean): Game | null {
  const asked = new URLSearchParams(search).get("game");
  if (asked === "ambush") return "ambush";
  if (asked === "defend" || asked === "defendSiege") return "defendSiege";
  if (asked === "choose") return null;
  return automated ? "defendSiege" : null;
}

const ICONS: Record<Game, readonly ModeIcon[]> = { defendSiege: ["defend", "siege"], ambush: ["ambush"] };
const label = (game: Game) => game === "ambush" ? t("nav.ambush") : t("game.defendSiege");

/** The start screen: a stone hall with one oak board for each game. */
export class GameSelect {
  private root: HTMLElement | null = null;
  constructor(private pick: (game: Game) => void) {}
  get open() { return this.root !== null; }
  show() {
    this.root?.remove();
    const root = document.createElement("div");
    root.id = "game-select";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "game-select-title");
    root.innerHTML = `<div class="game-select-hall"><h1 id="game-select-title">${t("game.title")}</h1><div class="game-select-choices">${GAMES.map(game =>
      `<button class="game-choice" data-game="${game}"><span class="game-choice-icons" aria-hidden="true">${ICONS[game].map(icon => `<img class="ui-sprite" src="${modeIconUrl(icon, 4)}" alt="">`).join("")}</span><span class="game-choice-label">${label(game)}</span></button>`).join("")}</div></div>`;
    root.querySelectorAll<HTMLButtonElement>("[data-game]").forEach(button => button.onclick = () => {
      this.close();
      this.pick(button.dataset.game as Game);
    });
    document.body.append(root);
    this.root = root;
    root.querySelector<HTMLButtonElement>("[data-game]")!.focus({ preventScroll: true });
  }
  close() {
    this.root?.remove();
    this.root = null;
  }
}
