import { rootOf, upgradedFrom } from "../specializations.ts";
import { pathBadge, pathLook, paintPathIcons } from "./path-badge.ts";
import { ballistaTreeHtml, gateTreeHtml, revolutionaryTreeHtml, shadowTreeHtml, upgradeTreeHtml, wallTreeHtml } from "./specialty.ts";
/** The Tiles tab: the player's tiles laid out in a hall of the keep they
 * defend, under its great window. Each tile shows the Knowledge upgrades
 * it carries (`marksHtml`: a diamond for each building it became, a pip in
 * its path's colour for each rank, and its path's badge on its face).
 * Buildings upgraded one at a time are spread, a tile a copy, unless
 * stacked, when copies with the same upgrades share a stack; kinds whose
 * upgrades every copy shares (city tiles, walls, skills) are always one
 * stack marked with its quantity (`universal`). A tap opens the kind in place,
 * spilling its copies out (which stand in the city, which wait in the
 * palette), with buying another, the kind's upgrades in the Mine's Smithy
 * and the Library's Study, and its higher tier. The filters show one type
 * at a time; the stacks can be spread into single tiles and gathered again;
 * the Shop shows every kind for sale. The opened kind lists each set of
 * upgrades its copies carry in words and previews its tree; each building
 * is upgraded where it stands in Defend. Every change of layout animates
 * (`flip`): tiles slide to their new places, copies gather into their
 * stacks and spill out of them. */
import { play } from "../sound.ts";
import { daylight } from "../library/render.ts";
import { BALLISTA_DESCRIPTION, BOMB_RADIUS, GATE_DESCRIPTION, WALL_BLOCK_DESCRIPTION, ITEM_NAMES, SPIKES_DESCRIPTION, STRUCTURES, footprint, footprintName, type PaletteItem } from "../defend/catalog.ts";
import type { PlacedKind } from "../defend/layout.ts";
import { paintIcon, type IconItem } from "../defend/structure-art.ts";
import {
  CONSUMABLE_TEXT, TILE_FILTERS, TILE_NAMES, TILE_TYPE, TILE_TYPE_NAMES, buyTile, canBuyTile, higherTier, isConsumable, marksText, offerText, shopOffer, tileCopies,
  tileGroups, tileMarks, tileStacks, tileTopic, universal, type TileFilter, type TileId, type TileMark, type TileStack,
} from "../tiles.ts";
import { topicHas } from "./ledger.ts";
import { Chamber } from "./chamber.ts";
import { flip } from "./flip.ts";
import { replay, sparksOver } from "./flourish.ts";
import { holdToRepeat } from "./hold-repeat.ts";
import type { AppContext } from "./app.ts";
import type { Wear } from "../specializations.ts";

/** Copies shown at most for one kind (a hoard of bombs stays one row or two). */
const SHOWN = 12;
const ICON: Partial<Record<TileId, IconItem>> = { warBanner: "banner" };
const iconOf = (id: TileId): IconItem => ICON[id] ?? (id as IconItem);

export class TilesPage {
  private chamber: Chamber | null = null;
  private mode: "collection" | "shop" = "collection";
  private filter: TileFilter = "all";
  /** Whether copies with the same upgrades share a stack (spread by default). */
  private stacked = false;
  private open: TileId | null = null;

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
    // The hall hangs in the same oak frame as the Defend board, the mine and the library.
    this.root.innerHTML = `<div class="tiles-view"><div class="tiles-room"></div></div>`;
    this.chamber = new Chamber(this.root.querySelector<HTMLElement>(".tiles-room")!, "keep");
    this.chamber.content.innerHTML = `<div class="tiles-hall">
        <header class="tiles-head">
          <div class="tiles-modes" role="group" aria-label="View">
            <button data-mode="collection">Collection</button><button data-mode="shop">Shop</button>
          </div>
          <button class="tiles-stacking" data-stacking aria-pressed="false" title="Gather tiles with the same upgrades into one stack, or spread them out"></button>
        </header>
        <div class="tiles-filters" role="group" aria-label="Tile types"></div>
        <div class="tiles-shelf"><div class="tiles-grid"></div><div class="tiles-ghosts" aria-hidden="true"></div></div>
        <p class="tiles-foot"></p>
      </div>`;
    const c = this.chamber.content;
    c.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => (b.onclick = () => this.relayout(() => {
      this.mode = b.dataset.mode as typeof this.mode;
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
    const buy = target.closest<HTMLButtonElement>("[data-buy-tile]");
    if (buy) return this.buy(buy.dataset.buyTile as TileId);
    const go = target.closest<HTMLButtonElement>("[data-go]");
    if (go) return this.ctx.openChamber(go.dataset.go as "smithy" | "study", go.dataset.topic);
    if (target.closest("[data-close]")) return this.relayout(() => (this.open = null));
    const tile = target.closest<HTMLElement>("[data-tile]");
    if (tile) {
      const id = tile.dataset.tile as TileId;
      play("knock");
      this.relayout(() => { this.open = this.open === id ? null : id; });
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
    paintPathIcons(grid);
    const all = tileStacks(s, "all"), placed = all.reduce((a, t) => a + t.placed, 0), count = all.reduce((a, t) => a + (t.lasting ? 0 : t.count), 0);
    c.querySelector(".tiles-foot")!.innerHTML = shop
      ? `Paid with Copper, Silver and Gold from the Mine · tap a tile to buy`
      : `<b>${count}</b> tiles · <b>${placed}</b> standing in the city · <span class="tile-legend"><i class="mark became"></i> became <i class="mark rank"></i> path rank</span> · tap a tile to open it`;
  }

  /** A kind's tiles: one stack when its copies are all alike (or in the
   * shop), else a stack for each set of upgrades or, spread, every copy;
   * and its opened panel. */
  private stackHtml(t: TileStack) {
    const shop = this.mode === "shop", open = this.open === t.id, offer = shopOffer(this.save, t.id);
    const name = TILE_NAMES[t.id], type = `type-${t.type}`;
    const face = (wear?: Wear) => `<span class="tile-face"><canvas width="48" height="48" data-icon="${iconOf(t.id)}"${wear ? pathLook(t.id, wear.path) : ""}></canvas>${pathBadge(wear)}</span>`;
    const layers = (n: number) => (n > 2 ? " layers-2" : n > 1 ? " layers-1" : "");
    const where = (placed: number, count: number) => (placed === count ? "In the city" : placed ? `${placed} in the city` : count > 1 ? "In the palette" : "Ready");
    let tiles: string;
    if (shop || t.lasting || !t.count || universal(t.id)) {
      const sub = shop ? (offerText(offer) || "Not sold") : t.lasting ? "Never used up" : t.placed ? `${t.placed} in the city` : "In the palette";
      const marks = shop ? "" : this.marksHtml(t.id, tileMarks(this.save, t.id), false);
      tiles = `<button class="tile ${type}${layers(t.count)}${open ? " open" : ""}${shop && !canBuyTile(this.save, t.id) ? " dear" : ""}" data-key="${t.id}" data-tile="${t.id}" aria-expanded="${open}" title="${name}">
          ${face()}<span class="tile-name">${name}</span>${marks}${t.count ? `<b class="tile-count">${t.lasting ? "∞" : `×${t.count}`}</b>` : ""}<small class="tile-sub">${sub}</small></button>`;
    } else if (this.stacked) {
      tiles = tileGroups(this.save, t).map((g) => `<button class="tile ${type}${layers(g.count)}${g.placed ? " placed" : ""}${open ? " open" : ""}" data-key="${g.key}" data-tile="${t.id}" aria-expanded="${open}" title="${name}: ${marksText(t.id, g.marks)}">
          ${face(g.wear)}<span class="tile-name">${name}</span>${this.marksHtml(t.id, g.marks, true)}<b class="tile-count">×${g.count}</b><small class="tile-sub">${where(g.placed, g.count)}</small></button>`).join("");
    } else {
      tiles = tileCopies(this.save, t).map((copy) => {
        const marks = tileMarks(this.save, t.id, copy.wear);
        return `<button class="tile single ${type}${copy.placed ? " placed" : ""}${open ? " open" : ""}" data-key="${copy.key}" data-tile="${t.id}" title="${name}: ${marksText(t.id, marks)}${copy.placed ? ", in the city" : ""}">
          ${face(copy.wear)}<span class="tile-name">${name}</span>${this.marksHtml(t.id, marks, true)}<small class="tile-sub">${copy.placed ? "In the city" : "Ready"}</small></button>`;
      }).join("");
    }
    return tiles + (open ? this.detailHtml(t) : "");
  }

  /** A tile's Knowledge upgrades as a row of marks, in the order taken: a
   * diamond for each building it became, a pip in its path's colour for
   * each rank. `none` says so when it has none (a building that could). */
  private marksHtml(id: TileId, marks: TileMark[], none: boolean) {
    if (!marks.length) return none ? `<span class="tile-marks none" title="No Knowledge upgrades yet">No upgrades</span>` : "";
    return `<span class="tile-marks" title="${marksText(id, marks)}">${marks.map((m) => m.type === "became"
      ? `<i class="mark became"></i>`
      : `<i class="mark rank hue-${m.hue}"></i>`).join("")}</span>`;
  }

  /** The opened stack: what the tile is, its copies, buying another, where
   * its upgrades are made, and its higher tier. */
  private detailHtml(t: TileStack) {
    const s = this.save, offer = shopOffer(s, t.id), name = TILE_NAMES[t.id], { topic } = tileTopic(t.id);
    // Each set of upgrades its copies carry, in words, with its copies.
    const copies = t.count && !t.lasting && !universal(t.id)
      ? `<div class="tile-sets">${tileGroups(s, t).map((g) => `<div class="tile-set">
          <span class="tile mini type-${t.type}${g.placed ? " placed" : ""}" data-key="detail:${g.key}"><span class="tile-face"><canvas width="32" height="32" data-icon="${iconOf(t.id)}"${g.wear ? pathLook(t.id, g.wear.path) : ""}></canvas>${pathBadge(g.wear)}</span><small>×${g.count}</small></span>
          <div><b>${marksText(t.id, g.marks)}</b>${this.marksHtml(t.id, g.marks, false)}<small>${g.placed} in the city · ${g.count - g.placed} ready</small></div></div>`).join("")}</div>`
      : t.count && !t.lasting
      ? `<div class="tile-copies" aria-label="Each ${name}">${tileCopies(s, t, isConsumable(t.id) ? SHOWN : Infinity).map((copy) =>
        `<span class="tile mini type-${t.type}${copy.placed ? " placed" : ""}" data-key="${copy.key}" title="${copy.placed ? "Standing in the city" : "Waiting in the palette"}"><span class="tile-face"><canvas width="32" height="32" data-icon="${iconOf(t.id)}"></canvas></span><small>${copy.placed ? "City" : "Ready"}</small></span>`).join("")}${isConsumable(t.id) && t.count > SHOWN ? `<span class="tile-more">+${t.count - SHOWN} more</span>` : ""}</div>`
      : "";
    const buy = "reason" in offer
      ? `<em class="tile-reason">${offer.reason}</em>`
      : `<button class="tile-buy" data-buy-tile="${t.id}" ${canBuyTile(s, t.id) ? "" : "disabled"}>Buy one<small>${offerText(offer)}</small></button>`;
    const go = (where: "smithy" | "study") => topicHas(topic, where)
      ? `<button class="tile-go go-${where}" data-go="${where}" data-topic="${topic.id}">${where === "smithy" ? "⚒ Smithy" : "✦ Study"}<small>${where === "smithy" ? "below the Mine" : "below the Library"}</small></button>`
      : "";
    // Where it stands in its upgrade tree: what it was upgraded (or merged)
    // from, and the ultimate its line merges into.
    const from = isConsumable(t.id) || t.id === "cityTile" ? undefined : upgradedFrom(t.id as PlacedKind);
    const tier = higherTier(t.id);
    const grown = tier.from
      ? `Merged from three <b>${ITEM_NAMES[tier.from]}</b> buildings, each at the last rank of a different branch: buy ${ITEM_NAMES[rootOf(tier.from)]}s, place them and tap them in Defend to upgrade them with Knowledge.`
      : from
      ? `Upgraded from a <b>${ITEM_NAMES[from]}</b>${rootOf(from) !== from ? ` (itself grown from a ${ITEM_NAMES[rootOf(from)]})` : ""}: buy a ${ITEM_NAMES[rootOf(from)]}, place it and tap it in Defend to upgrade it with Knowledge.`
      : "";
    const tierText = `${grown}${tier.into ? `${grown ? " " : ""}Three of its line, each maxed on a different branch, merge into a <b>${ITEM_NAMES[tier.into]}</b>.` : ""}`;
    const counts = t.lasting ? "ONE BANNER" : `OWNED ${t.count}${isConsumable(t.id) ? "" : ` · ${t.placed} IN THE CITY · ${t.ready} READY`}`;
    return `<div class="tile-detail type-${t.type}" data-key="detail:${t.id}" data-grow role="region" aria-label="${name}">
        <header><span class="tile-face big"><canvas width="48" height="48" data-icon="${iconOf(t.id)}"></canvas></span>
          <div><small>${TILE_TYPE_NAMES[TILE_TYPE[t.id]].toUpperCase()} TILE · ${counts}</small><h3>${name}</h3><p>${this.describe(t.id)}</p></div>
          <button class="tile-close" data-close aria-label="Close">×</button></header>
        ${copies}
        ${isConsumable(t.id) ? "" : t.id === "wallBlock" ? wallTreeHtml() : t.id === "cityGate" ? gateTreeHtml() : t.id === "wallBallista" ? ballistaTreeHtml() : t.id === "revolutionary" ? revolutionaryTreeHtml() : t.id === "shadow" ? shadowTreeHtml() : upgradeTreeHtml(s, t.id)}
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
    if (id === "wallBlock") return WALL_BLOCK_DESCRIPTION;
    const d = this.save.defend;
    return `${STRUCTURES[id].description} Takes ${footprintName(footprint(id, d.layout.compact.includes(id)))}.`;
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
