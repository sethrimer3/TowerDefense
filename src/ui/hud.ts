import type { Game } from "../state.ts";
import type { Renderer } from "../rendering.ts";
import { levelForXp, xpForLevel } from "../config.ts";
import { CONSUMABLES } from "../crafting.ts";
import { outsideWeather } from "../outside.ts";
import { MODES, milestones } from "../modes.ts";
import { cardArt, displayedProgress, el, text } from "./dom.ts";
import { CARDS, HAND_SLOTS } from "../cards.ts";
import { trainingPoints } from "../loadout.ts";
import type { BoardOverlay } from "./board-overlay.ts";

/** The stats cluster, action buttons and status line around the board. */

export const devAmount = (game: Pick<Game, "save">, value: number) => game.save.settings.devMode ? "∞" : String(value);

/** Refreshes every HUD readout from game state. */
export function renderHud(game: Game, renderer: Renderer, overlay: BoardOverlay) {
  overlay.clearIfAt(game.run.player);
  renderVitals(game);
  renderFocus(game);
  renderConsumables(game);
  renderProgress(game);
  renderModeActions(game);
  text("courage", devAmount(game, game.save.delve.courage));
  text("inspiration", devAmount(game, game.save.tower.inspiration));
  text("training", String(trainingPoints(game.save).left));
  renderXp(game);
  renderStatus(game, overlay);
  // The status line sits over the board's bottom row: let the hero show through.
  el("status-row").classList.toggle("see-through", game.run.player.y === renderer.target(renderer.density).bottom);
  renderAutoButton(game);
  renderHand(game);
  text("density-label", `${renderer.density} × ${renderer.density}`);
  renderUndo(game);
  (document.querySelector(".dpad") as HTMLElement).hidden = !game.save.settings.showArrows;
  renderLockedTab("delve", !!game.save.upgrades.delve, "Delve", "Unlock Into the depths in the Inspiration tree");
  renderLockedTab("deck", !!game.save.upgrades.handOrdering, "Deck", "Unlock Hand Ordering in the Inspiration tree");
  // A new Deck lesson waits behind the button until its tutorial is done.
  const { deck, addCard } = game.save.tutorials;
  document.querySelector(`[data-tab="deck"]`)?.classList.toggle("notify", !deck || (!!game.save.upgrades.combatStance && !addCard));
  renderLockedTab("defend", !!game.save.upgrades.legacy, "Defend", "Unlock An enduring legacy in the Courage tree");
}

/** The level at the front of the XP bar, which fills with this level's
 * progress; hovering shows the XP still needed. */
function renderXp(game: Game) {
  const level = levelForXp(game.save.xp), from = xpForLevel(level),
    into = game.save.xp - from, need = xpForLevel(level + 1) - from;
  text("level", String(level));
  el("xp-fill").style.width = `${(100 * into) / need}%`;
  const tip = `${into}/${need} XP to level ${level + 1}`;
  const row = el("xp");
  row.title = tip;
  row.setAttribute("aria-label", `Level ${level} · ${tip}`);
}

/** The board's heading: the forest's title outside, the mode's inside. */
export function boardTitle(game: Pick<Game, "mode" | "run">) {
  const words = MODES[game.mode].words;
  return game.run.outside ? words.outsideTitle : words.title;
}

/** The board's title, subtitle and caption: the forest clearing outside, or
 * the Tower/Delve name inside. */
export function renderBoardHeading(game: Game, overlay: BoardOverlay) {
  el("board").dataset.outside = String(!!game.run.outside);
  el("board").classList.toggle("mode-tower", game.mode === "tower");
  const words = MODES[game.mode].words;
  text("board-title", boardTitle(game));
  text("height-zone", boardTitle(game));
  if (game.run.outside) {
    const labels = { cloudy: "CLOUDY", sunny: "SUNNY", rain: "RAINING", storm: "THUNDERSTORM" };
    text("board-subtitle", `FOREST CLEARING · ${labels[outsideWeather(game.run.seed)]}`);
    el("inspect").textContent = "Follow the forest path and step onto the entrance at the top to begin again.";
  } else {
    text("board-subtitle", words.subtitle);
    el("inspect").textContent = "";
  }
  overlay.hide();
}

/** Inside a run the button plays and pauses the hand; in the forest it
 * turns Automove on and off, once bought. */
function renderAutoButton(game: Game) {
  const button = el("auto"), inside = !game.run.outside;
  const label = inside ? (game.auto ? "Pause the hand" : "Play the hand") : "Automove";
  text("auto-state", inside ? (game.auto ? "PLAYING" : "PAUSED") : game.save.upgrades.auto ? (game.auto ? "ON" : "OFF") : "LOCKED");
  button.classList.toggle("enabled", game.auto);
  button.setAttribute("aria-label", label);
  button.title = label;
}

/** The hand the cards were last drawn for. */
let shownHand = "";
/** The active hand in the row under the board, the card that made the
 * latest step glowing; End Run lights up while no card can act. */
function renderHand(game: Game) {
  const row = el("hand"), hand = game.hand;
  if (hand.join() !== shownHand) {
    shownHand = hand.join();
    row.style.setProperty("--slots", String(HAND_SLOTS));
    row.innerHTML = hand.map((id, i) => `<div class="hand-card" role="listitem" data-card="${id}" data-hand-slot="${i}" title="${CARDS[id].name}: ${CARDS[id].text}">${cardArt(id, CARDS[id].name)}</div>`).join("");
  }
  const glowing = game.auto && !game.handStuck ? game.activeCard : null;
  const focused = game.run.focused ? hand.indexOf(game.run.focused) : -1;
  row.classList.toggle("can-focus", !!game.save.upgrades.focus);
  row.querySelectorAll<HTMLElement>(".hand-card").forEach((card, i) => {
    card.classList.toggle("active", i === glowing);
    card.classList.toggle("focused", i === focused);
  });
  el("end-run").classList.toggle("deadlocked", game.handStuck && !game.run.outside);
}

/** True when the heading still shows the other side of the forest entrance. */
export const boardHeadingStale = (game: Game) => el("board").dataset.outside !== String(!!game.run.outside);

/** HP, ATK, DEF, the run's Gold and keys. During a fight being played out, HP counts down
 * strike by strike. */
export function renderVitals(game: Game) {
  const p = game.run.player, hp = game.shownHp(performance.now());
  text("hp", `${hp} / ${p.maxHp}`);
  renderHealthGain(game);
  el("health").style.width = `${(100 * hp) / p.maxHp}%`;
  renderHealthLoss(game.encounter ? p.hp - hp : 0, p.maxHp);
  text("attack", p.attack);
  text("defense", p.defense);
  text("run-gold", game.save[game.mode].runGold);
  for (const k of ["yellow", "blue", "red"] as const) text(k, p.keys[k]);
  const skeletonKeys = p.skeletonKeys ?? 0;
  text("skeleton", skeletonKeys);
  el("skeleton-key").hidden = skeletonKeys < 1;
}

/** The last heal the HP bar has filled up to. */
let shownHeal = 0;
/** A potion just picked up or drunk: the red fill starts at the HP before it with the
 * HP it healed in light red beyond, and grows over the light red in a
 * second. A fight starting, or the next potion, stops it where it is. */
function renderHealthGain(game: Game) {
  const heal = game.lastHeal, fill = el("health"), gain = el("health-gain");
  const settle = () => {
    fill.classList.remove("healing");
    gain.classList.remove("healing");
    gain.style.width = "0%";
  };
  if (game.encounter) settle();
  if (!heal || heal.id === shownHeal) return;
  shownHeal = heal.id;
  // Only the heal the HUD is looking at now fills up; one from before a
  // reload, a new run or an undo is simply there.
  if (heal.to !== game.run.player.hp || game.encounter) return;
  const max = game.run.player.maxHp;
  settle();
  fill.style.width = `${(100 * heal.from) / max}%`;
  gain.style.width = `${(100 * (heal.to - heal.from)) / max}%`;
  void fill.offsetWidth; // Lay out the starting widths before the transition.
  fill.classList.add("healing");
  gain.classList.add("healing");
  gain.style.width = "0%";
  fill.addEventListener("transitionend", settle, { once: true });
}

/** The HP the fight being played out has cost so far, shown in purple just
 * past the HP left; once the fight settles it shrinks away over a second. */
function renderHealthLoss(lost: number, maxHp: number) {
  const bar = el("health-loss");
  if (lost > 0) {
    bar.classList.remove("settling");
    bar.style.width = `${(100 * lost) / maxHp}%`;
  } else if (bar.style.width && bar.style.width !== "0%") {
    bar.classList.add("settling");
    bar.style.width = "0%";
  }
}

/** Focus uses left, once the Focus skill is owned. */
function renderFocus(game: Game) {
  const stat = el("focus-stat");
  stat.hidden = !game.save.upgrades.focus;
  text("focus-left", game.focusLeft);
  stat.setAttribute("aria-label", `Focus: ${game.focusLeft} left`);
}

/** Replays a brief red flash on `target`, as a refusal. */
export function flashRed(target: Element) {
  target.classList.remove("flash-red");
  void (target as HTMLElement).offsetWidth;
  target.classList.add("flash-red");
  target.addEventListener("animationend", () => target.classList.remove("flash-red"), { once: true });
}

function renderConsumables(game: Game) {
  for (const c of CONSUMABLES) {
    const count = game.save.consumables[c.id] ?? 0;
    const countEl = document.querySelector<HTMLElement>(`[data-consumable-count="${c.id}"]`)!;
    const button = countEl.closest("button") as HTMLButtonElement;
    countEl.textContent = String(count);
    button.disabled = count < 1 || game.run.outside || !!game.summary;
  }
}

/** Current height/depth, the run and all-time bests, and the reward a new
 * best would pay. */
function renderProgress(game: Game) {
  const outside = !!game.run.outside,
    rules = MODES[game.mode];
  text("height-label", rules.words.progress.toUpperCase());
  const rawRunBest = game.run.maxHeight ?? game.run.height;
  const rawAllBest = game.save[game.mode].best;
  text("height", displayedProgress(game.run.height, outside));
  text("best-run", displayedProgress(rawRunBest, outside));
  text("best-all", displayedProgress(rawAllBest));
  const rewardEl = el("best-reward");
  rewardEl.hidden = rawRunBest <= rawAllBest;
  if (rewardEl.hidden) return;
  text("best-reward-val", milestones(rules, rawAllBest, rawRunBest));
  text("best-reward-type", rules.words.currency.toUpperCase());
}

/** Log and Floors act on the Tower; in the Delve they are placeholders. */
function renderModeActions(game: Game) {
  const tower = game.mode === "tower";
  const logButton = el("log") as HTMLButtonElement;
  const floorsButton = el("section-pick") as HTMLButtonElement;
  logButton.textContent = tower ? "Log" : "Button 1";
  logButton.setAttribute("aria-label", tower ? "Adventure log" : "Future Delve action 1");
  floorsButton.textContent = tower ? "Floors" : "Button 2";
  floorsButton.setAttribute("aria-label", tower ? "Choose starting floor" : "Future Delve action 2");
  floorsButton.title = tower ? "Choose starting floor" : "Future Delve action 2";
  logButton.classList.toggle("placeholder-action", !tower);
  floorsButton.classList.toggle("placeholder-action", !tower);
}

function renderStatus(game: Game, overlay: BoardOverlay) {
  el("status-row").hidden = game.save.settings.infoDisplay === "popup";
  text("message", game.paused ? "Paused · take a breath." : overlay.statusLine() ?? game.message);
}

/** The undo button doubles as Revive while a revival is pending. */
function renderUndo(game: Game) {
  const slice = game.save[game.mode],
    undo = el("undo") as HTMLButtonElement,
    count = `${slice.history.length}/${game.undoCapacity}`;
  text("undo-state", slice.revival ? "REVIVE" : count);
  undo.classList.toggle("enabled", !!slice.revival);
  undo.setAttribute("aria-label", slice.revival ? "Revive" : `Undo (${count})`);
  undo.disabled = !slice.revival && !slice.history.length;
}

function renderLockedTab(id: string, unlocked: boolean, name: string, hint: string) {
  const tab = document.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`);
  if (!tab) return;
  tab.hidden = !unlocked;
  tab.title = unlocked ? name : hint;
  tab.setAttribute("aria-label", unlocked ? name : `${name} (locked)`);
}
