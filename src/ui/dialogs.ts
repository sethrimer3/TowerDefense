import { TOWER_SECTION } from "../config.ts";
import { CLEAR_TIERS } from "../tower/clear-ledger.ts";
import { MODES } from "../modes.ts";
import { loadout } from "../loadout.ts";
import type { AppContext } from "./app.ts";
import { displayedProgress, el, itemSprite, uiSprite } from "./dom.ts";
import { boardTitle, devAmount } from "./hud.ts";

/** The modal dialogs opened from the HUD, all sharing `ctx.modal`. */

/** A confirm dialog's text: `label` names the confirm button and `cancel`
 * the one that backs out. */
export type ConfirmPrompt = { title: string; body: string; label: string; cancel: string };

/** Asks the player to confirm `action`. */
export function confirmAction(ctx: AppContext, { title, body, label, cancel }: ConfirmPrompt, action: () => void) {
  const modal = ctx.modal;
  modal.innerHTML = `<small>${boardTitle(ctx.game)}</small><h2>${title}</h2><p>${body}</p><div class="dialog-actions"><button id="cancel">${cancel}</button><button id="confirm">${label}</button></div>`;
  modal.showModal();
  el("cancel").onclick = () => modal.close();
  el("confirm").onclick = () => {
    modal.close();
    action();
  };
}

/** Watches for a fallen hero: a dialog the player must answer, taking back
 * the fatal fight (with an undo left) or accepting defeat, after which the
 * forest fades in from black. */
export class DefeatDialog {
  private fadeOverlay = document.createElement("div");

  constructor(private ctx: AppContext) {
    this.fadeOverlay.className = "fade-overlay";
    document.body.appendChild(this.fadeOverlay);
  }

  check() {
    if (this.ctx.game.fallen && !this.ctx.modal.open) this.show();
  }

  private fadeInFromBlack() {
    const overlay = this.fadeOverlay;
    overlay.classList.add("active");
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.remove("active")));
  }

  private show() {
    const ctx = this.ctx, { game, modal } = ctx;
    const rules = MODES[game.mode],
      slice = game.save[game.mode],
      undos = slice.history.length,
      by = slice.fall?.by,
      progress = rules.words.progress, run = game.run;
    const takeBack = undos
      ? `<p>Undo takes back the fight, and the hand waits for you.</p>`
      : `<p class="hint">No undo is left to take the fight back.</p>`;
    const button = undos ? `<button id="defeat-undo">Undo (${undos} left)</button>` : "";
    const stat = (value: string | number, label: string) => `<div><strong>${value}</strong>${label}</div>`;
    const stats = [
      stat(displayedProgress(run.height), progress.toUpperCase()),
      stat(displayedProgress(run.maxHeight ?? run.height), "HIGHEST"),
      stat(run.kills, "VICTORIES"),
      stat(slice.runGold, "GOLD"),
      stat(devAmount(game, rules.balance(game.save)), rules.words.currency.toUpperCase()),
    ].join("");
    modal.innerHTML = `<span class="summary-icon">${uiSprite("revive")}</span><small>FALLEN IN COMBAT</small><h2>Your hero has fallen.</h2><p>${by ? `Defeated by ${by}` : "Defeated"} at ${rules.words.progress} ${displayedProgress(game.run.height)}. Milestone and clear rewards and the Gold found are already saved.</p><div class="summary-stats compact">${stats}</div>${takeBack}<div class="dialog-actions">${button}<button id="defeat-accept">Accept defeat</button></div>`;
    modal.showModal();
    const undo = document.querySelector<HTMLButtonElement>("#defeat-undo");
    if (undo)
      undo.onclick = () => {
        modal.close();
        game.undo();
        ctx.navigate(game.mode);
      };
    el("defeat-accept").onclick = () => {
      modal.close();
      game.acceptDefeat();
      this.fadeInFromBlack();
      ctx.navigate(game.mode);
    };
  }
}

const LOG_PAGE = 25;

/** The Tower's adventure log: records, clear tiers, and floors 25 at a time. */
export function showLog(ctx: AppContext) {
  const { game, modal } = ctx;
  if (game.mode !== "tower") return;
  let page = 0;
  const floorRecord = (floor: number) => {
    const record = game.save.tower.log[floor];
    const earned = CLEAR_TIERS.filter(t => record?.[t]);
    const tiers = earned.length
      ? earned.map(t => `<span class="${t}">${itemSprite(`chest_${t}` as "chest_silver" | "chest_gold" | "chest_platinum", "log-sprite")}${t[0].toUpperCase() + t.slice(1)}${record![t] === "claimed" ? " ✓" : " · chest"}</span>`).join(" · ")
      : "Reached";
    return `<div class="floor-record"><b>Floor ${displayedProgress(floor)}</b><span>${tiers}</span></div>`;
  };
  const render = () => {
    const highest = game.save.tower.reached;
    const start = Math.max(0, highest - page * LOG_PAGE);
    const floors = Array.from({ length: Math.min(LOG_PAGE, start + 1) }, (_, i) => start - i);
    modal.innerHTML = `<small>WAYFARER’S RECORD</small><h2>Adventure log</h2>
      <div class="summary-stats"><div><strong>${displayedProgress(highest)}</strong>HIGHEST FLOOR</div><div><strong>${displayedProgress(game.save.delve.reached)}</strong>DEEPEST DEPTH</div></div>
      <p>${devAmount(game, game.save.tower.inspiration)} Inspiration · ${devAmount(game, game.save.delve.courage)} Courage</p>
      <p class="hint">+1 Inspiration per new height. +1 Courage at each new 10-depth milestone. Past floor 100 (depth 1,000) a point takes 10 times as far, past floor 1,000 100 times, and past floor 10,000 none. Revisits never pay again.</p>
      <div class="clear-legend"><p class="silver">${itemSprite("chest_silver", "log-sprite")} Silver · all doors opened and enemies defeated.</p><p class="gold">${itemSprite("chest_gold", "log-sprite")} Gold · Silver with no damage taken anywhere in the ascent.</p><p class="platinum">${itemSprite("chest_platinum", "log-sprite")} Platinum · Gold with no keys spent on that floor.</p><p class="diamond">Diamond · future challenge, not yet available.</p></div>
      <p class="hint">Each clear tier earns +1 Inspiration once per floor. Uncollected chests are claimed when you leave.</p>
      <div class="floor-log">${floors.map(floorRecord).join("")}</div><div class="dialog-actions"><button id="log-newer" ${page === 0 ? "disabled" : ""}>Higher</button><button id="log-older" ${start < LOG_PAGE ? "disabled" : ""}>Lower</button><button id="log-close">Close</button></div>`;
    el("log-newer").onclick = () => { page--; render(); };
    el("log-older").onclick = () => { page++; render(); };
    el("log-close").onclick = () => modal.close();
  };
  render();
  modal.showModal();
}

/** Picks which Tower section (10 floors) the next ascent starts from. */
export function showSectionPicker(ctx: AppContext) {
  const { game, modal } = ctx;
  if (game.mode !== "tower") return;
  const render = () => {
    const tower = game.save.tower,
      maxHp = tower.run?.player.maxHp ?? loadout(game.save).maxHp,
      current = game.startSection(),
      unlocked = Object.keys(tower.sectionHp).map(Number),
      // Every unlocked section, plus the next one as a locked goal.
      count = Math.max(0, ...unlocked) + 2,
      inside = !!tower.run && !tower.run.outside;
    const option = (s: number) => {
      const first = s * TOWER_SECTION + 1,
        open = game.sectionUnlocked(s),
        hp = s === 0 ? `${maxHp} HP · full` : open ? `${tower.sectionHp[s]} HP` : `Reach floor ${first}`;
      return `<button class="section-option${s === current ? " selected" : ""}" data-section="${s}" ${open ? "" : "disabled"}><b>Floors ${first}–${first + TOWER_SECTION - 1}</b><span>${hp}</span></button>`;
    };
    modal.innerHTML = `<small>THE ASCENT TRIALS</small><h2>Starting floor</h2>
      <p class="hint">Every 10 floors is its own trial: the way down seals behind you and ATK/DEF from items resets. Each trial begins with the highest HP you have ever reached its first floor with.</p>
      <div class="section-list">${Array.from({ length: count }, (_, s) => option(s)).join("")}</div>
      ${inside ? `<p class="hint">Your current ascent continues; the new start applies to your next one.</p>` : ""}
      <div class="dialog-actions"><button id="section-close">Close</button></div>`;
    modal.querySelectorAll<HTMLButtonElement>("[data-section]").forEach(b => {
      b.onclick = () => {
        if (!game.setStartSection(Number(b.dataset.section))) return;
        ctx.save();
        render();
      };
    });
    el("section-close").onclick = () => modal.close();
  };
  render();
  modal.showModal();
}
