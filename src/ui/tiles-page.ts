import { syncCards, cardLabel, equipCard, evolveCard, unevolveCard } from "../cards.ts";
import type { PathId } from "../knowledge-paths.ts";
import { cardDetailHtml } from "./card-detail.ts";
/** The Tiles tab: the player's tiles laid out in a hall of the keep they
 * defend, under its great window. Identical tiles stack, one stack a kind
 * marked with its quantity (`tileStacks`); a tap opens the stack in place,
 * spilling its copies out (which stand in the city, which wait in the
 * palette), with buying another, the kind's upgrades in the Mine's Smithy
 * and the Library's Study, and its higher tier. The filters show one type
 * at a time; the stacks can be spread into single tiles and gathered again;
 * the Shop shows every kind for sale. Every change of layout animates
 * (`flip`): tiles slide to their new places, copies gather into their
 * stacks and spill out of them. */
import { play } from "../sound.ts";
import { daylight } from "../library/render.ts";
import { BALLISTA_DESCRIPTION, BOMB_RADIUS, GATE_DESCRIPTION, SPIKES_DESCRIPTION, STRUCTURES, footprint, shareName, type PaletteItem } from "../defend/catalog.ts";
import { paintIcon, type IconItem } from "../defend/structure-art.ts";
import {
  CONSUMABLE_TEXT, TILE_FILTERS, TILE_NAMES, TILE_TYPE, TILE_TYPE_NAMES, buyTile, canBuyTile, higherTier, isConsumable, offerText, shopOffer, tileCopies,
  tileStacks, tileTopic, type TileFilter, type TileId, type TileStack,
} from "../tiles.ts";
import { topicHas } from "./ledger.ts";
import { Chamber } from "./chamber.ts";
import { flip } from "./flip.ts";
import { replay, sparksOver } from "./flourish.ts";
import { holdToRepeat } from "./hold-repeat.ts";
import type { AppContext } from "./app.ts";

/** Copies shown at most for one kind (a hoard of bombs stays one row or two). */
const SHOWN = 12;
const ICON: Partial<Record<TileId, IconItem>> = { warBanner: "banner" };
const iconOf = (id: TileId): IconItem => ICON[id] ?? (id as IconItem);

export class TilesPage {
  private chamber: Chamber | null = null;
  private mode: "collection" | "shop" = "collection";
  private filter: TileFilter = "all";
  private stacked = true;
  private open: TileId | null = null;
  private openCard: number | null = null;

  constructor(private ctx: AppContext, private root: HTMLElement) {}

  private get save() {
    return this.ctx.save();
  }
  private get reduced() {
    return this.save.settings.reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /** The tab is shown: builds the hall once, then lays out the tiles. */
  render() {
    if (!this.chamber) this.build();
    this.draw();
  }

  private build() {
    this.chamber = new Chamber(this.root, "keep");
    this.chamber.content.innerHTML = `<div class="tiles-hall">
        <header class="tiles-head">
          <div class="tiles-modes" role="group" aria-label="View">
            <button data-mode="collection">Collection</button><button data-mode="shop">Shop</button>
          </div>
          <button class="tiles-stacking" data-stacking aria-pressed="true" title="Gather identical tiles into one stack, or spread them out"></button>
        </header>
        <div class="tiles-filters" role="group" aria-label="Tile types"></div>
        <div class="tiles-shelf"><div class="tiles-grid"></div><div class="tiles-ghosts" aria-hidden="true"></div></div>
        <p class="tiles-foot"></p>
      </div>`;
    const c = this.chamber.content;
    c.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => (b.onclick = () => this.relayout(() => {
      this.mode = b.dataset.mode as typeof this.mode;
      if (this.mode === "shop") this.stacked = true;
    })));
    c.querySelector<HTMLButtonElement>("[data-stacking]")!.onclick = () => this.relayout(() => {
      this.stacked = !this.stacked;
      this.open = null;
    });
    // One listener for everything in the grid, which is redrawn often.
    c.querySelector<HTMLElement>(".tiles-filters")!.onclick = (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>("[data-filter]");
      if (b) this.relayout(() => (this.filter = b.dataset.filter as TileFilter));
    };
    c.querySelector<HTMLElement>(".tiles-grid")!.onclick = (e) => this.press(e.target as Element);
    holdToRepeat(c, ["data-buy-tile"]);
  }

  private press(target: Element) {
    const equip = target.closest<HTMLButtonElement>("[data-equip-card]");
    if (equip) {
      if (equipCard(this.save, Number(equip.dataset.equipCard), equip.dataset.equipPath as PathId | undefined, equip.dataset.equipRank ? Number(equip.dataset.equipRank) : undefined)) {
        this.ctx.update(); this.draw();
      }
      return;
    }
    const reset = target.closest<HTMLButtonElement>("[data-unevolve-card]");
    if (reset) {
      if (unevolveCard(this.save, Number(reset.dataset.unevolveCard))) { this.ctx.update(); this.relayout(() => { this.open = this.save.defend.cards.find(c => c.id === this.openCard)?.kind ?? null; }); }
      return;
    }
    const evolve = target.closest<HTMLButtonElement>("[data-evolve-card]");
    if (evolve) {
      if (evolveCard(this.save, Number(evolve.dataset.evolveCard))) { this.ctx.update(); this.relayout(() => { this.open = this.save.defend.cards.find(c => c.id === this.openCard)?.kind ?? null; }); }
      return;
    }
    const cardGo = target.closest<HTMLButtonElement>("[data-card-go]");
    if (cardGo) return this.ctx.openChamber(cardGo.dataset.cardGo as "smithy" | "study", cardGo.dataset.cardTopic, this.openCard ?? undefined);
    const individual = target.closest<HTMLElement>("[data-copy-card]");
    if (individual) return this.relayout(() => { this.openCard = Number(individual.dataset.copyCard); this.open = individual.dataset.tile as TileId; });
    const buy = target.closest<HTMLButtonElement>("[data-buy-tile]");
    if (buy) return this.buy(buy.dataset.buyTile as TileId);
    const go = target.closest<HTMLButtonElement>("[data-go]");
    if (go) return this.ctx.openChamber(go.dataset.go as "smithy" | "study", go.dataset.topic);
    if (target.closest("[data-close]")) return this.relayout(() => (this.open = null));
    const tile = target.closest<HTMLElement>("[data-tile]");
    if (tile) {
      const id = tile.dataset.tile as TileId;
      play("knock");
      this.relayout(() => { this.open = this.open === id ? null : id; this.openCard = null; });
    }
  }

  /** Changes the layout and animates the tiles to it. */
  private relayout(change: () => void) {
    change();
    const grid = this.root.querySelector<HTMLElement>(".tiles-grid")!;
    flip(grid, () => this.draw(), {
      ghosts: this.root.querySelector<HTMLElement>(".tiles-ghosts")!,
      reduced: this.reduced,
      // A stack and its copies come out of (and go back into) each other.
      alias: (key) => (key.includes("#") ? key.split("#")[0] : key.startsWith("detail:") ? null : `${key}#0`),
    });
  }

  /** Lays out the hall's controls and tiles from the save. */
  private draw() {
    syncCards(this.save.defend);
    const c = this.chamber!.content, s = this.save, shop = this.mode === "shop";
    c.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === this.mode)));
    const stacking = c.querySelector<HTMLButtonElement>("[data-stacking]")!;
    stacking.setAttribute("aria-pressed", String(this.stacked));
    stacking.innerHTML = this.stacked ? `<span aria-hidden="true">▣</span> Stacked` : `<span aria-hidden="true">▦</span> Spread`;
    stacking.disabled = shop;
    c.querySelector(".tiles-filters")!.innerHTML = TILE_FILTERS.map((f) => {
      const n = tileStacks(s, f.id, shop).reduce((a, t) => a + (shop ? 1 : t.count), 0);
      return `<button data-filter="${f.id}" class="filter-${f.id}" aria-pressed="${f.id === this.filter}">${f.name}<b>${n}</b></button>`;
    }).join("");
    const stacks = tileStacks(s, this.filter, shop);
    if (this.open && !stacks.some((t) => t.id === this.open)) this.open = null;
    const grid = c.querySelector<HTMLElement>(".tiles-grid")!;
    const shelf = c.querySelector<HTMLElement>(".tiles-shelf")!, scroll = shelf.scrollTop;
    grid.innerHTML = stacks.length
      ? stacks.map((t) => this.stackHtml(t)).join("")
      : `<p class="tiles-empty">${shop ? "Nothing of this type is for sale." : "No tiles of this type yet. Buy some in the Shop."}</p>`;
    shelf.scrollTop = scroll;
    grid.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]").forEach((cv) => paintIcon(cv, cv.dataset.icon as IconItem));
    const all = tileStacks(s, "all"), placed = all.reduce((a, t) => a + t.placed, 0), count = all.reduce((a, t) => a + (t.lasting ? 0 : t.count), 0);
    c.querySelector(".tiles-foot")!.innerHTML = shop
      ? `Paid with Copper, Silver and Gold from the Mine · tap a tile to buy`
      : `<b>${count}</b> tiles · <b>${placed}</b> standing in the city · tap a stack to open it`;
  }

  /** A kind's stack (or, spread, each of its copies), and its opened panel. */
  private stackHtml(t: TileStack) {
    const shop = this.mode === "shop", open = this.open === t.id, offer = shopOffer(this.save, t.id);
    const name = TILE_NAMES[t.id], type = `type-${t.type}`;
    const face = (cls = "") => `<span class="tile-face ${cls}"><canvas width="48" height="48" data-icon="${iconOf(t.id)}"></canvas></span>`;
    let tiles: string;
    if (this.stacked || t.lasting || !t.count) {
      const layers = t.count > 2 ? " layers-2" : t.count > 1 ? " layers-1" : "";
      const sub = shop ? (offerText(offer) || "Not sold") : t.lasting ? "Never used up" : t.placed ? `${t.placed} in the city` : "In the palette";
      tiles = `<button class="tile ${type}${layers}${open ? " open" : ""}${shop && !canBuyTile(this.save, t.id) ? " dear" : ""}" data-key="${t.id}" data-tile="${t.id}" aria-expanded="${open}" title="${name}">
          ${face()}<span class="tile-name">${name}</span>${t.count ? `<b class="tile-count">${t.lasting ? "∞" : `×${t.count}`}</b>` : ""}<small class="tile-sub">${sub}</small></button>`;
    } else {
      tiles = tileCopies(t, isConsumable(t.id) ? SHOWN : Infinity, this.save).map((copy) => `<button class="tile single ${type}${copy.placed ? " placed" : ""}${open && (!copy.cardId || copy.cardId === this.openCard) ? " open" : ""}" data-key="${copy.key}" data-tile="${t.id}" ${copy.cardId ? `data-copy-card="${copy.cardId}"` : ""} title="${name}${copy.placed ? ", in the city" : ""}">
          ${face()}<span class="tile-name">${name}</span><small class="tile-sub">${copy.placed ? "In the city" : "Ready"}</small>${copy.cardId ? `<small class="card-specialization">${cardLabel(this.save.defend.cards.find(c => c.id === copy.cardId)!)}</small>` : ""}</button>`).join("")
        + (isConsumable(t.id) && t.count > SHOWN ? `<button class="tile more ${type}" data-key="${t.id}#more" data-tile="${t.id}"><b class="tile-count">+${t.count - SHOWN}</b><small class="tile-sub">more</small></button>` : "");
    }
    return tiles + (open ? this.detailHtml(t) : "");
  }

  /** The opened stack: what the tile is, its copies, buying another, where
   * its upgrades are made, and its higher tier. */
  private detailHtml(t: TileStack) {
    const s = this.save, offer = shopOffer(s, t.id), name = TILE_NAMES[t.id], { topic } = tileTopic(t.id);
    const copies = this.stacked && t.count && !t.lasting
      ? `<div class="tile-copies" aria-label="Each ${name}">${tileCopies(t, isConsumable(t.id) ? SHOWN : Infinity, this.save).map((copy) =>
        `<button class="tile mini type-${t.type}${copy.placed ? " placed" : ""}" data-key="${copy.key}" data-tile="${t.id}" ${copy.cardId ? `data-copy-card="${copy.cardId}" aria-label="${name} card ${copy.cardId}: ${cardLabel(this.save.defend.cards.find(c => c.id === copy.cardId)!)}"` : ""} title="${copy.placed ? "Standing in the city" : "Waiting in the palette"}"><span class="tile-face"><canvas width="32" height="32" data-icon="${iconOf(t.id)}"></canvas></span><small>${copy.placed ? "City" : "Ready"}</small></button>`).join("")}${isConsumable(t.id) && t.count > SHOWN ? `<span class="tile-more">+${t.count - SHOWN} more</span>` : ""}</div>`
      : "";
    const buy = "reason" in offer
      ? `<em class="tile-reason">${offer.reason}</em>`
      : `<button class="tile-buy" data-buy-tile="${t.id}" ${canBuyTile(s, t.id) ? "" : "disabled"}>Buy one<small>${offerText(offer)}</small></button>`;
    const go = (where: "smithy" | "study") => topicHas(topic, where)
      ? `<button class="tile-go go-${where}" data-go="${where}" data-topic="${topic.id}">${where === "smithy" ? "⚒ Smithy" : "✦ Study"}<small>${where === "smithy" ? "below the Mine" : "below the Library"}</small></button>`
      : "";
    const tier = higherTier(t.id);
    const tierText = tier.into?.evolves
      ? `Research <b>${tier.into.name}</b> and its crown in the Study, then evolve selected cards into <b>${tier.into.evolves.name}</b>. Other cards keep their builds.`
      : tier.from?.evolves
      ? `The higher tier of the ${TILE_NAMES[tier.from.evolves.from as PaletteItem]}: made by the crown of <b>${tier.from.name}</b>.`
      : "";
    const counts = t.lasting ? "ONE BANNER" : `OWNED ${t.count}${isConsumable(t.id) ? "" : ` · ${t.placed} IN THE CITY · ${t.ready} READY`}`;
    return `<div class="tile-detail type-${t.type}" data-key="detail:${t.id}" data-grow role="region" aria-label="${name}">
        <header><span class="tile-face big"><canvas width="48" height="48" data-icon="${iconOf(t.id)}"></canvas></span>
          <div><small>${TILE_TYPE_NAMES[TILE_TYPE[t.id]].toUpperCase()} TILE · ${counts}</small><h3>${name}</h3><p>${this.describe(t.id)}</p></div>
          <button class="tile-close" data-close aria-label="Close">×</button></header>
        ${copies}
        ${this.openCard && this.save.defend.cards.some(c => c.id === this.openCard && c.kind === t.id) ? cardDetailHtml(this.save, this.save.defend.cards.find(c => c.id === this.openCard)!) : ""}
        <div class="tile-actions">${buy}${go("smithy")}${go("study")}</div>
        ${tierText ? `<p class="tile-tier"><span aria-hidden="true">♛</span> ${tierText}</p>` : ""}
      </div>`;
  }

  private describe(id: TileId) {
    if (id === "bomb") return CONSUMABLE_TEXT.bomb.replace("around where it lands", `within ${BOMB_RADIUS.toFixed(0)} cells of where it lands`);
    if (isConsumable(id)) return CONSUMABLE_TEXT[id];
    if (id === "cityTile") return "Expands the city limits. New tiles must touch the city; the wall moves out to enclose them.";
    if (id === "cityGate") return GATE_DESCRIPTION;
    if (id === "wallSpikes") return SPIKES_DESCRIPTION;
    if (id === "wallBallista") return BALLISTA_DESCRIPTION;
    const d = this.save.defend;
    return `${STRUCTURES[id].description} Takes ${shareName(footprint(id, d.layout.compact.includes(id)).size)}.`;
  }

  private buy(id: TileId) {
    if (!buyTile(this.save, id)) return;
    this.ctx.update();
    play("coin");
    this.relayout(() => {});
    const button = this.root.querySelector<HTMLElement>(`[data-buy-tile="${id}"]`);
    replay(this.root.querySelector(`[data-key="${id}"]`), "bought");
    sparksOver(button, "gold");
  }

  /** Each frame while the tab shows: the hall's torches and the light through its window. */
  frame(now: number) {
    this.chamber?.draw(now, this.reduced, daylight(now));
  }
  /** The wallet changed while the tab shows (the mine made a point): redraw what can be bought. */
  refresh() {
    if (this.chamber) this.draw();
  }
}
