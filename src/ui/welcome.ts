/** The welcome-back screen: on opening the game, the time away (up to
 * `MAX_AWAY_MS`) and what the Library and the Mine made of it, on the
 * shared parchment dialog. The rewards are paid whether or not it shows;
 * the Mine's figures climb while its catch-up runs. */
import { MAX_AWAY_MS, span } from "../away.ts";
import type { MineAway } from "../mine/ui.ts";
import { METALS, type Metals } from "../mine/sim.ts";
import { whole } from "../progression.ts";
import { play } from "../sound.ts";
import { uiSprite } from "./dom.ts";
import { sparksOver } from "./flourish.ts";

/** Shorter time away than this gets no welcome. */
export const WELCOME_MS = 60 * 1000;

export interface Away {
  /** Time since the game was last saved, uncapped. */
  ms: number;
  /** Knowledge the library earned, and what it had working. */
  knowledge: number;
  shelves: number;
  librarians: number;
  /** The mine's account (null without a mine), its crew, and the time its
   * catch-up still owes. */
  mine: MineAway | null;
  crew: number;
  owedMs: number;
}

const METAL_NAME: Record<keyof Metals, string> = { copper: "Copper", silver: "Silver", gold: "Gold" };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Whether the time away earned anything worth a welcome. */
export function worthWelcome(a: Away) {
  if (a.ms < WELCOME_MS) return false;
  return whole(a.knowledge) > 0 || (a.mine !== null && a.crew > 0);
}

/** The ledger of the Library and the Mine, as shown. */
function ledger(a: Away) {
  const library = a.shelves > 0 || a.librarians > 0
    ? `${plural(a.shelves, "shelf", "shelves")} and ${plural(a.librarians, "librarian")} at work`
    : "Nobody at the desks yet";
  let mine = "";
  if (a.mine) {
    const m = a.mine;
    const metals = METALS.map((k) => `<li><i class="away-bar ${k}" aria-hidden="true"></i><b class="metal-${k}">+${m.paid[k]}</b><small>${METAL_NAME[k]}</small></li>`).join("");
    const note = m.catchingUp
      ? `The crew is still at work: ${span(a.owedMs)} to catch up`
      : m.simulatedMs < m.ms
        ? `${span(m.simulatedMs)} worked through, the rest paid at the smithy's pace`
        : `${plural(a.crew, "miner")} worked on while you were away`;
    mine = `<section class="away-row away-mine">
      <h3>⛏ The Mine</h3>
      <p>Smithy points from the smithy</p>
      <ul class="away-metals">${metals}</ul>
      <p class="away-note">${note}${m.lost > 0 ? `<br><span class="away-loss">${plural(m.lost, "miner")} lost below</span>` : ""}</p>
    </section>`;
  }
  return `<section class="away-row away-library">
      <h3>✦ The Library</h3>
      <p>${library}</p>
      <b class="away-gain">+${whole(a.knowledge)} <small>Knowledge</small></b>
    </section>${mine}`;
}

export class WelcomeBack {
  private modal: HTMLDialogElement;
  private read: () => Away;
  private shown = "";
  private open = false;

  constructor(modal: HTMLDialogElement, read: () => Away) {
    this.modal = modal;
    this.read = read;
  }

  /** Shows the screen, if the time away earned anything. */
  show() {
    const a = this.read();
    if (!worthWelcome(a)) return;
    const capped = a.ms > MAX_AWAY_MS;
    this.modal.innerHTML = `<small>WELCOME BACK</small>
      <h2>While you were away</h2>
      <p class="away-time">You were gone <b>${span(a.ms)}</b>.${capped ? ` The city keeps account of the last ${span(MAX_AWAY_MS)}.` : ""}</p>
      <div class="away-ledger" id="away-ledger"></div>
      <div class="dialog-actions"><button id="away-collect" class="away-collect">${uiSprite("gold")} Collect</button></div>`;
    this.modal.classList.add("welcome");
    this.shown = "";
    this.open = true;
    const collect = this.modal.querySelector<HTMLButtonElement>("#away-collect")!;
    collect.onclick = () => {
      play("coin");
      sparksOver(collect, "gold");
      this.modal.close();
    };
    this.modal.addEventListener("close", () => {
      this.open = false;
      this.modal.classList.remove("welcome");
    }, { once: true });
    this.modal.showModal();
    this.refresh();
  }

  /** Brings the figures up to date while the screen is open (each frame;
   * the ledger is redrawn only when what it says changes). */
  refresh() {
    if (!this.open) return;
    const a = this.read(), html = ledger({ ...a, owedMs: Math.ceil(a.owedMs / 60000) * 60000 });
    if (html === this.shown) return;
    this.shown = html;
    this.modal.querySelector("#away-ledger")!.innerHTML = html;
  }
}
