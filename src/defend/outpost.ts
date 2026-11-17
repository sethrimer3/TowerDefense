/** The Ember Forge outpost: a second, smaller city the player builds for
 * the Ember Forge's waves alone. Its keep is a single quarter and half as
 * strong, its city tiles stand only on the middle 8 × 8 tiles
 * (`cityTileOk`), and it has `OUTPOST_TILES.less` fewer city tiles than the
 * player owns (never fewer than `OUTPOST_TILES.least`). It has no Mine or
 * Library, no equipment of its own, and nothing outside Defend reads it:
 * the Realm, the Mine, the Library, the Tiles page and Siege all keep to
 * the home city (`DefendSave.layout`).
 *
 * The Defend page works on it through views (`outpostView`, `outpostGame`):
 * the same save with the outpost's layout, kept copies and palette in place
 * of the home city's, so every edit, upgrade and battle bonus is worked out
 * exactly as at home. Everything else (levels, waves, wallet) is the save's
 * own. Its structures are numbered from `OUTPOST_UID`, apart from the home
 * city's and Siege's. */
import { areaForWave, type AreaId } from "./areas.ts";
import { defaultLayout, type Layout } from "./layout.ts";
import type { PaletteItem } from "./catalog.ts";
import type { DefendSave, Kept } from "./progress.ts";
import type { Save } from "../save.ts";

/** The outpost's city tiles: the player's own less `less`, at least `least`. */
export const OUTPOST_TILES = { less: 10, least: 10 };
/** The outpost keep's HP, as a share of the home keep's. */
export const OUTPOST_KEEP_HP = 0.5;
/** The first uid the outpost's structures take. */
export const OUTPOST_UID = 1_000_000;

/** The outpost as saved: its city and the upgraded copies waiting in its palette. */
export type OutpostSave = { layout: Layout; kept: Kept[] };

export const isOutpostArea = (area: AreaId) => area === "ember";
/** Whether wave `wave` is fought from the outpost. */
export const outpostWave = (wave: number) => isOutpostArea(areaForWave(wave).id);

/** How many city tiles the outpost has, from the player's own count. */
export const outpostTiles = (owned: number) => Math.max(OUTPOST_TILES.least, owned - OUTPOST_TILES.less);

/** A fresh outpost: the small keep near the middle of the field. */
export function defaultOutpost(): OutpostSave {
  return { layout: { ...defaultLayout(), keep: { tx: 6, ty: 6 }, nextUid: OUTPOST_UID, outpost: true }, kept: [] };
}

/** What the outpost's palette holds of each item: the outpost's own city
 * tiles, no Mine or Library, and every other item as owned. */
export function outpostOwned(owned: Record<PaletteItem, number>): Record<PaletteItem, number> {
  return new Proxy(owned, {
    get(t, k, r) {
      if (k === "cityTile") return outpostTiles(t.cityTile);
      if (k === "mine" || k === "library") return 0;
      return Reflect.get(t, k, r);
    },
    set(t, k, v) {
      // A city tile bought while here is one more at home too.
      if (k === "cityTile") t.cityTile += v - outpostTiles(t.cityTile);
      else if (k !== "mine" && k !== "library") (t as Record<string | symbol, unknown>)[k] = v;
      return true;
    },
  });
}

const views = new WeakMap<DefendSave, DefendSave>();
/** `save` as the outpost: its layout, kept copies and palette are the
 * outpost's (made on first use), everything else the save's own. */
export function outpostView(save: DefendSave): DefendSave {
  let view = views.get(save);
  if (view) return view;
  const outpost = () => (save.outpost ??= defaultOutpost());
  let owned: { of: Record<PaletteItem, number>; view: Record<PaletteItem, number> } | null = null;
  view = new Proxy(save, {
    get(t, k, r) {
      if (k === "layout") return outpost().layout;
      if (k === "kept") return outpost().kept;
      if (k === "owned") {
        if (owned?.of !== t.owned) owned = { of: t.owned, view: outpostOwned(t.owned) };
        return owned.view;
      }
      // Its own filler houses, so it never looks like the home city.
      if (k === "seed") return (t.seed + 7919) % 2 ** 32;
      return Reflect.get(t, k, r);
    },
    set(t, k, v) {
      if (k === "layout") outpost().layout = v;
      else if (k === "kept") outpost().kept = v;
      else if (k !== "owned" && k !== "seed") (t as Record<string | symbol, unknown>)[k] = v;
      return true;
    },
  });
  views.set(save, view);
  return view;
}

const games = new WeakMap<Save, { defend: DefendSave; view: Save }>();
/** The whole save with Defend as the outpost (`outpostView`), for the
 * building upgrades and battle bonuses. The outpost has no equipment: the
 * Smithy's gear stays with the home city's buildings. */
export function outpostGame(game: Save): Save {
  let entry = games.get(game);
  if (entry && entry.defend === game.defend) return entry.view;
  const scratch: { equipment: Save["equipment"] } = { equipment: [] };
  const view = new Proxy(game, {
    get(t, k, r) {
      if (k === "defend") return outpostView(t.defend);
      if (k === "equipment") return scratch.equipment;
      return Reflect.get(t, k, r);
    },
    set(t, k, v) {
      if (k === "equipment") scratch.equipment = v;
      else if (k !== "defend") (t as Record<string | symbol, unknown>)[k] = v;
      return true;
    },
  });
  entry = { defend: game.defend, view };
  games.set(game, entry);
  return view;
}
