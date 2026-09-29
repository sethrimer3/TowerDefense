import { CARDS, HAND_SLOTS, moveCard, type CardId } from "../cards.ts";
import type { AppContext } from "./app.ts";
import { cardArt, el } from "./dom.ts";

/** How far a press must travel before it lifts the card. */
const DRAG_START_PX = 4;

/** A card being dragged along the hand row: the slot it left, the slot it
 * would drop into, and the ghost that follows the pointer. */
type Drag = { from: number; to: number; pointer: number; x: number; y: number; lifted: boolean; ghost: HTMLElement | null };

/** A pixel-art hand pointing up, row by row: `#` outline, `w` skin. */
const POINTER_ROWS = [
  "....##......",
  "...#ww#.....",
  "...#ww#.....",
  "...#ww#.....",
  "...#ww###...",
  "...#ww#ww##.",
  ".###ww#ww#w#",
  "#ww#wwwwwww#",
  "#wwwwwwwwww#",
  ".#wwwwwwwww#",
  ".#wwwwwwww#.",
  "..#wwwwwww#.",
  "...#wwwww#..",
  "...#######..",
];
const POINTER_SVG = `<svg viewBox="0 0 12 14" shape-rendering="crispEdges" aria-hidden="true">${POINTER_ROWS.flatMap((row, y) =>
  [...row].map((c, x) => (c === "." ? "" : `<rect x="${x}" y="${y}" width="1" height="1" fill="${c === "#" ? "#2b1d14" : "#f3d9b8"}"/>`)),
).join("")}</svg>`;

/** The Deck page: the hand's five slots along the top, whose cards Hand
 * Ordering lets the player drag into a new order before a run, and the
 * deck's cards out of the hand below (locked for now). The first visit
 * teaches the drag: until the player moves STAIRS, it points at the card
 * and nothing else on the page or the tab row can be used. */
export class DeckPage {
  private drag: Drag | null = null;
  private showing = false;

  constructor(private ctx: AppContext) {}

  /** Whether the Deck tutorial is waiting on the player's first drag, which
   * keeps them on this page. */
  get teaching() {
    return this.showing && !this.ctx.game.save.tutorials.deck;
  }

  /** Called whenever the tab changes, so `teaching` knows the page is open. */
  shown(open: boolean) {
    this.showing = open;
    if (!open) this.cancelDrag();
  }

  render() {
    const teaching = this.teaching;
    el("deck").innerHTML = `<div class="deck-page">
      <section class="deck-hand-area" aria-labelledby="deck-hand-label">
        <h3 id="deck-hand-label" class="deck-label">Hand</h3>
        <div class="deck-hand" id="deck-hand" role="list" aria-label="Hand, in the order its cards are tried">${this.slotsHtml(this.ctx.game.save.hand)}</div>
        ${teaching ? `<div class="deck-tip" role="status"><b>Order your hand</b><p>Inside a run your hand tries its cards from left to right, and the first that can act moves you. Drag STAIRS to another slot to change the order.</p></div>` : ""}
      </section>
      <section class="deck-reserve" aria-label="Deck (locked)">
        <h3 class="deck-label">Deck</h3>
        <div class="deck-reserve-slots" aria-hidden="true">${"<i></i>".repeat(10)}</div>
        <p class="deck-lock"><b>Locked</b>Cards you win will wait here until you add them to your hand.</p>
      </section>
    </div>`;
    this.bindHand();
  }

  /** The hand's slots as `hand` fills them, the dragged card's slot left
   * showing where it will land. */
  private slotsHtml(hand: readonly CardId[], held: number | null = null) {
    const teaching = this.teaching;
    return Array.from({ length: HAND_SLOTS }, (_, i) => {
      const id = hand[i];
      if (!id) return `<div class="deck-slot empty" role="listitem" aria-label="Empty slot ${i + 1}"></div>`;
      const locked = teaching && id !== "stairs";
      const card = CARDS[id];
      return `<div class="deck-slot${i === held ? " held" : ""}" role="listitem"><button type="button" class="deck-card" data-slot="${i}" ${locked ? "disabled" : ""} aria-label="${card.name}, slot ${i + 1} of ${hand.length}. Drag, or press the left and right arrow keys, to move it." title="${card.name}: ${card.text}">${cardArt(id, card.name)}</button>${teaching && id === "stairs" ? `<span class="deck-pointer${this.ctx.game.save.settings.reduceMotion ? " still" : ""}">${POINTER_SVG}</span>` : ""}</div>`;
    }).join("");
  }

  private bindHand() {
    const row = el("deck-hand");
    row.onpointerdown = (e) => {
      const card = (e.target as HTMLElement).closest<HTMLButtonElement>(".deck-card");
      if (!card || card.disabled || this.drag || e.button > 0) return;
      e.preventDefault();
      row.setPointerCapture(e.pointerId);
      const from = Number(card.dataset.slot);
      this.drag = { from, to: from, pointer: e.pointerId, x: e.clientX, y: e.clientY, lifted: false, ghost: null };
    };
    row.onpointermove = (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointer) return;
      if (!d.lifted && Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_START_PX) return;
      if (!d.lifted) this.lift(d);
      d.ghost!.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
      const to = this.slotAt(e.clientX);
      if (to !== d.to) {
        d.to = to;
        this.preview(d);
      }
    };
    row.onpointerup = (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointer) return;
      this.cancelDrag();
      if (d.lifted) this.drop(d.from, d.to);
    };
    row.onpointercancel = () => {
      this.cancelDrag();
      this.render();
    };
    row.onkeydown = (e) => {
      const card = (e.target as HTMLElement).closest<HTMLButtonElement>(".deck-card");
      const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      if (!card || !step) return;
      e.preventDefault();
      const from = Number(card.dataset.slot), to = from + step;
      if (to < 0 || to >= this.ctx.game.save.hand.length) return;
      this.drop(from, to);
      el("deck-hand").querySelector<HTMLButtonElement>(`[data-slot="${to}"]`)?.focus();
    };
  }

  /** The card leaves its slot and a ghost of it follows the pointer. */
  private lift(d: Drag) {
    d.lifted = true;
    el("deck-hand").classList.add("dragging");
    const card = el("deck-hand").querySelector<HTMLElement>(`[data-slot="${d.from}"]`)!;
    const box = card.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "deck-ghost";
    ghost.style.width = `${box.width}px`;
    ghost.style.height = `${box.height}px`;
    ghost.innerHTML = card.innerHTML;
    document.body.append(ghost);
    d.ghost = ghost;
    this.preview(d);
  }

  /** Shows the hand as it would be with the card dropped in `d.to`. */
  private preview(d: Drag) {
    el("deck-hand").innerHTML = this.slotsHtml(moveCard(this.ctx.game.save.hand, d.from, d.to), d.to);
  }

  /** The slot whose middle is nearest `x`, among the slots holding cards. */
  private slotAt(x: number) {
    const slots = Array.from(el("deck-hand").querySelectorAll<HTMLElement>(".deck-slot")).slice(0, this.ctx.game.save.hand.length);
    let best = 0, bestGap = Infinity;
    slots.forEach((slot, i) => {
      const box = slot.getBoundingClientRect(), gap = Math.abs(x - (box.left + box.width / 2));
      if (gap < bestGap) [best, bestGap] = [i, gap];
    });
    return best;
  }

  private cancelDrag() {
    this.drag?.ghost?.remove();
    this.drag = null;
    document.getElementById("deck-hand")?.classList.remove("dragging");
  }

  /** Commits a move; the first move of STAIRS finishes the tutorial. */
  private drop(from: number, to: number) {
    const save = this.ctx.game.save;
    const moved = save.hand[from];
    if (from === to || !this.ctx.game.arrangeHand(from, to)) return this.render();
    const taught = this.teaching && moved === "stairs";
    if (taught) save.tutorials.deck = true;
    this.ctx.save();
    this.render();
    if (!taught) return;
    this.ctx.update();
    this.praise();
  }

  private praise() {
    const modal = this.ctx.modal;
    modal.innerHTML = `<small>HAND ORDERING</small><h2>Well arranged!</h2><p>Your hand will now try its cards in this order. Each run takes the hand as you leave it here, so try different orders and see which carries you farthest.</p><button class="wide" id="deck-praise-ok">Onward</button>`;
    modal.showModal();
    el("deck-praise-ok").onclick = () => modal.close();
  }
}
