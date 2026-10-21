import { pathBadge, pathLook, paintPathIcons } from "./path-badge.ts";
import { buildingSheet, type StatSheet } from "./specialty.ts";
/** The Tiles tab: the player's tiles laid out in a hall of the keep they
 * defend, under its great window. Each tile shows the Knowledge upgrades
 * it carries (`marksHtml`: a diamond for each building it became, a pip in
 * its path's colour for each rank, and its path's badge on its face).
 * Buildings upgraded one at a time are spread, a tile a copy, unless
 * stacked, when copies with the same upgrades share a stack; kinds whose
 * upgrades every copy shares (city tiles, walls, skills) are always one
 * stack marked with its quantity (`universal`). A tap opens the tile in
 * place: its basic stats, then each Knowledge upgrade it carries as an
 * ability in its path's colour (`buildingSheet`), with buying another and
 * the kind's upgrades in the Mine's Smithy and the Library's Study. A press
 * held on a tile (`HOLD_MS`, as on the Defend board) turns to Defend with
 * that copy's upgrade tree open (`tileTree`), where each building is
 * upgraded. The filters show one type at a time; the stacks can be spread
 * into single tiles and gathered again; the Shop shows every kind for
 * sale. Every change of layout animates
 * (`flip`): tiles slide to their new places, copies gather into their
 * stacks and spill out of them. */
import { play } from "../sound.ts";
import { daylight } from "../library/render.ts";
import { BOMB_DAMAGE, BOMB_RADIUS, type PaletteItem } from "../defend/catalog.ts";
import { HOLD_MS } from "../defend/board-pointers.ts";
import { bonuses } from "../progression.ts";
import { paintIcon, type IconItem } from "../defend/structure-art.ts";
import {
  CONSUMABLE_TEXT, TILE_FILTERS, TILE_NAMES, TILE_TYPE, TILE_TYPE_NAMES, buyTile, canBuyTile, isConsumable, marksText, offerText, shopOffer, tileCopies, tileCopyAt,
  tileGroups, tileMarks, tileStacks, tileTopic, tileTree, universal, type TileFilter, type TileId, type TileMark, type TileStack,
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
  /** The tile tapped to open its kind: a spread copy's key or a stack's group. */
  private focus: string | null = null;
  /** A press held on a tile, until it opens the tree or lets go. */
  private holding: { timer: number; x: number; y: number; pointerId: number } | null = null;
  /** The held press opened a tree: the click its release makes is not a tap. */
  private held = false;
  /** A note shown in the foot for a moment (a tree that can't open mid-battle). */
  private note: { text: string; until: number } | null = null;

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
    const grid = c.querySelector<HTMLElement>(".tiles-grid")!;
    grid.onclick = (e) => {
      if (this.held) { this.held = false; return; }
      this.press(e.target as Element);
    };
    this.bindHold(grid);
    holdToRepeat(c, ["data-buy-tile"]);
  }

  private press(target: Element) {
    const buy = target.closest<HTMLButtonElement>("[data-buy-tile]");
    if (buy) return this.buy(buy.dataset.buyTile as TileId);
    const go = target.closest<HTMLButtonElement>("[data-go]");
    if (go) return this.ctx.openChamber(go.dataset.go as "smithy" | "study", go.dataset.topic);
    if (target.closest("[data-close]")) return this.relayout(() => (this.open = null));
    const tree = target.closest<HTMLElement>("[data-tree]");
    if (tree) return this.openTree(tree.dataset.tree as TileId, tree.dataset.copy);
    const tile = target.closest<HTMLElement>("[data-tile]");
    if (tile) {
      const id = tile.dataset.tile as TileId, key = tile.dataset.key ?? null;
      play("knock");
      // A second tap on the tile showing closes it; a tap on another copy shows that one.
      const same = this.open === id && this.focus === key;
      this.relayout(() => { this.open = same ? null : id; this.focus = same ? null : key; });
    }
  }

  /** Press and hold on a tile opens its upgrade tree, as in Defend: held
   * still for `HOLD_MS`; moving, scrolling or letting go first is a tap. */
  private bindHold(grid: HTMLElement) {
    const stop = () => {
      if (this.holding) clearTimeout(this.holding.timer);
      this.holding = null;
    };
    grid.addEventListener("pointerdown", (e) => {
      stop();
      this.held = false;
      if (e.button !== 0 || this.mode === "shop") return;
      const tile = (e.target as Element).closest<HTMLElement>("[data-tile]");
      if (!tile) return;
      const id = tile.dataset.tile as TileId, key = tile.dataset.key;
      if (!tileTree(this.save, id, key)) return;
      const timer = window.setTimeout(() => {
        this.holding = null;
        this.held = true;
        this.openTree(id, key);
      }, HOLD_MS);
      this.holding = { timer, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    });
    grid.addEventListener("pointermove", (e) => {
      const h = this.holding;
      if (h && h.pointerId === e.pointerId && Math.abs(e.clientX - h.x) + Math.abs(e.clientY - h.y) > 8) stop();
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) grid.addEventListener(type, stop);
    this.chamber!.content.querySelector(".tiles-shelf")!.addEventListener("scroll", stop, { passive: true });
    // A long touch would otherwise bring up the browser's menu over the tile.
    grid.addEventListener("contextmenu", (e) => { if ((e.target as Element).closest("[data-tile]")) e.preventDefault(); });
  }

  /** Turns to Defend with the tree of tile `key` of kind `id` open. */
  private openTree(id: TileId, key?: string) {
    const target = tileTree(this.save, id, key);
    if (!target) return;
    play("knock");
    if (this.ctx.openTree(target)) return;
    this.note = { text: "Upgrade trees open in Defend while building: finish the battle first.", until: performance.now() + 3000 };
    this.draw();
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
    if (this.note && performance.now() > this.note.until) this.note = null;
    const all = tileStacks(s, "all"), placed = all.reduce((a, t) => a + t.placed, 0), count = all.reduce((a, t) => a + (t.lasting ? 0 : t.count), 0);
    c.querySelector(".tiles-foot")!.innerHTML = this.note
      ? `<em>${this.note.text}</em>`
      : shop
      ? `Paid with Copper, Silver and Gold from the Mine · tap a tile to buy`
      : `<b>${count}</b> tiles · <b>${placed}</b> standing in the city · <span class="tile-legend"><i class="mark became"></i> became <i class="mark rank"></i> path rank</span> · tap a tile to open it, hold it for its upgrade tree`;
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

  /** The opened tile: its basic stats and the abilities its upgrades give
   * (the copy tapped, or the stack of alike copies), its copies when they
   * are all alike, buying another, and where its upgrades are made. */
  private detailHtml(t: TileStack) {
    const s = this.save, offer = shopOffer(s, t.id), name = TILE_NAMES[t.id], { topic } = tileTopic(t.id);
    const shop = this.mode === "shop";
    const copy = shop || universal(t.id) ? undefined : tileCopyAt(s, t, this.focus);
    const wear = copy?.wear;
    // Alike copies (a hoard of bombs, the city's pieces) laid out, which stand and which wait.
    const copies = t.count && !t.lasting && universal(t.id) && !shop
      ? `<div class="tile-copies" aria-label="Each ${name}">${tileCopies(s, t, isConsumable(t.id) ? SHOWN : Infinity).map((c) =>
        `<span class="tile mini type-${t.type}${c.placed ? " placed" : ""}" data-key="${c.key}" title="${c.placed ? "Standing in the city" : "Waiting in the palette"}"><span class="tile-face"><canvas width="32" height="32" data-icon="${iconOf(t.id)}"></canvas></span><small>${c.placed ? "City" : "Ready"}</small></span>`).join("")}${isConsumable(t.id) && t.count > SHOWN ? `<span class="tile-more">+${t.count - SHOWN} more</span>` : ""}</div>`
      : "";
    const buy = "reason" in offer
      ? ""
      : `<button class="tile-buy" data-buy-tile="${t.id}" ${canBuyTile(s, t.id) ? "" : "disabled"}>Buy one<small>${offerText(offer)}</small></button>`;
    const go = (where: "smithy" | "study") => topicHas(topic, where)
      ? `<button class="tile-go go-${where}" data-go="${where}" data-topic="${topic.id}">${where === "smithy" ? "⚒ Smithy" : "✦ Study"}<small>${where === "smithy" ? "below the Mine" : "below the Library"}</small></button>`
      : "";
    const tree = !shop && t.count && tileTree(s, t.id, copy?.key)
      ? `<button class="tile-go go-tree" data-tree="${t.id}"${copy ? ` data-copy="${copy.key}"` : ""}>♛ Upgrade tree<small>in Defend</small></button>`
      : "";
    const counts = t.lasting ? "ONE BANNER" : `OWNED ${t.count}${isConsumable(t.id) ? "" : ` · ${t.placed} IN THE CITY · ${t.ready} READY`}`;
    const where = copy?.placed ? "IN THE CITY" : "IN THE PALETTE";
    const sheet = this.sheet(t.id, wear);
    return `<div class="tile-detail type-${t.type}" data-key="detail:${t.id}" data-grow role="region" aria-label="${name}">
        <header><span class="tile-face big"><canvas width="48" height="48" data-icon="${iconOf(t.id)}"${wear ? pathLook(t.id, wear.path) : ""}></canvas>${pathBadge(wear)}</span>
          <div><small>${copy && !this.stacked ? where : `${TILE_TYPE_NAMES[TILE_TYPE[t.id]].toUpperCase()} TILE · ${counts}`}</small><h3>${name}</h3>${sheet.about ? `<p>${sheet.about}</p>` : ""}</div>
          <button class="tile-close" data-close aria-label="Close">×</button></header>
        ${sheet.stats.length ? `<ul class="tile-stats" aria-label="Stats">${sheet.stats.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}
        ${sheet.abilities.length ? `<ul class="tile-abilities" aria-label="Abilities">${sheet.abilities.map((a) => `<li class="hue-${a.hue}">${a.text}.</li>`).join("")}</ul>` : ""}
        ${copies}
        <div class="tile-actions">${buy}${tree}${go("smithy")}${go("study")}</div>
      </div>`;
  }

  /** What tile `id` (wearing `wear`) shows: its basic stats and its
   * upgrades' abilities; a line saying what it does where it has no numbers. */
  private sheet(id: TileId, wear?: Wear): StatSheet & { about?: string } {
    if (id === "bomb") return { stats: [`${Number((BOMB_DAMAGE * bonuses(this.save).bombDamage).toFixed(2))} damage`, `${BOMB_RADIUS.toFixed(1)} cell radius`], abilities: [] };
    if (isConsumable(id)) return { stats: [], abilities: [], about: CONSUMABLE_TEXT[id] };
    if (id === "cityTile") return { stats: [], abilities: [], about: "Expands the city limits; the wall moves out to enclose it." };
    return buildingSheet(this.save, id as PaletteItem | "wallSpikes", wear);
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
