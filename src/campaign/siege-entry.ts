/** Entry and match preview are DOM only; the native battle owns combat. */
import { t } from "../i18n/index.ts";
import { flagSvg, escapeText, type PlayerProfile } from "../profile/model.ts";
import { botFlag } from "./bot-identity.ts";
import { rankOf, rankLabel } from "./siege-ranks.ts";
import { paintRankEmblem } from "../ui/rank-emblems.ts";
import { observeSiegePreview } from "./previews.ts";
import type { SiegeSave } from "./siege-progress.ts";
export type SiegeEntryActions = {
  find: () => void;
  attack: () => void;
  back: () => void;
  profile: () => void;
  practice: () => void;
};
const text = escapeText;
export const rankBadge = (mmr: number) => '<canvas class="siege-rank-emblem" data-rank-mmr="' + mmr + '" aria-label="' + text(rankLabel(mmr)) + '"></canvas>';
export function paintRanks(root: HTMLElement) {
  root.querySelectorAll<HTMLCanvasElement>("[data-rank-mmr]").forEach((c) => paintRankEmblem(c, Number(c.dataset.rankMmr)));
}
export function renderSiegeEntry(
  root: HTMLElement,
  siege: SiegeSave,
  profile: PlayerProfile,
  view: "entry" | "match",
  reduced: boolean,
  actions: SiegeEntryActions,
) {
  const r = rankOf(siege.mmr),
    raid = siege.raid,
    owner = raid.castle.owner,
    finished = raid.state === "won" || raid.state === "lost";
  const opponent = {
    name: owner.name,
    flag: owner.flag ?? botFlag(raid.castle.seed),
  };
  const profileHtml =
    '<div class="siege-profile">' +
    flagSvg(profile.flag) +
    '<div><strong class="siege-profile-name">' +
    text(profile.name) +
    '</strong></div><button data-action="profile">' +
    t("siege.editProfile") +
    "</button></div>";
  const rank =
    '<div class="siege-ladder">' +
    rankBadge(siege.mmr) +
    "<h2>" +
    text(rankLabel(siege.mmr)) +
    "</h2><strong>" +
    t("siege.mmr", { mmr: siege.mmr }) +
    '</strong><progress max="1" value="' +
    r.progress +
    '" aria-label="' +
    t("siege.divisionProgress") +
    '"></progress><small>' +
    t("siege.wins", { wins: siege.wins, games: siege.games }) +
    "</small></div>";
  const changed = finished && rankOf(raid.attacker).tier !== r.tier;
  const result = finished
    ? '<section class="siege-result" role="status"><h2>' +
      t(raid.state === "won" ? "siege.victory" : "siege.defeat") +
      "</h2><p>" +
      t("siege.mmrChange", {
        delta: (raid.delta ?? 0) >= 0 ? "+" + (raid.delta ?? 0) : String(raid.delta),
      }) +
      "</p>" +
      (changed
        ? '<div class="siege-rank-change">' +
          rankBadge(siege.mmr) +
          "<strong>" +
          text(t(r.tier > rankOf(raid.attacker).tier ? "siege.promoted" : "siege.demoted", { rank: rankLabel(siege.mmr) })) +
          "</strong></div>"
        : "") +
      '<button data-action="practice">' +
      t("siege.practiceAgain") +
      "</button></section>"
    : "";
  const card =
    '<section class="siege-match-card' +
    (!reduced ? " siege-reveal" : "") +
    '"><div class="siege-match-identity">' +
    flagSvg(opponent.flag) +
    '<strong class="siege-opponent-name">' +
    text(opponent.name) +
    "</strong>" +
    rankBadge(raid.defender) +
    "</div><p>" +
    text(rankLabel(raid.defender)) +
    " · " +
    t("siege.mmr", { mmr: raid.defender }) +
    '</p><canvas class="siege-castle-preview" aria-label="' +
    t("siege.castlePreview") +
    '"></canvas><p>' +
    t("siege.commit") +
    '</p><div class="siege-entry-actions"><button class="primary" data-action="attack">' +
    t("siege.attack") +
    '</button><button data-action="back">' +
    t("siege.back") +
    "</button></div></section>";
  root.innerHTML =
    '<div class="siege-entry">' +
    profileHtml +
    (view === "entry" ? rank + result + '<button class="siege-find primary" data-action="find">' + t("siege.findMatch") + "</button>" : card) +
    "</div>";
  paintRanks(root);
  for (const [action, callback] of Object.entries(actions)) {
    const b = root.querySelector<HTMLButtonElement>('[data-action="' + action + '"]');
    if (b) b.onclick = callback;
  }
  let dispose = () => {};
  const preview = root.querySelector<HTMLCanvasElement>(".siege-castle-preview");
  if (preview) dispose = observeSiegePreview(preview, raid.castle);
  const emblem = root.querySelector(".siege-rank-change .siege-rank-emblem");
  const animation =
    emblem && !reduced
      ? emblem.animate(
          [
            { transform: "scale(.75)", opacity: 0.25 },
            { transform: "scale(1.15)", opacity: 1 },
            { transform: "scale(1)", opacity: 1 },
          ],
          { duration: 550, easing: "ease-out" },
        )
      : undefined;
  return () => {
    dispose();
    animation?.cancel();
  };
}
