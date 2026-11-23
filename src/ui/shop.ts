/** The Shop: watch an ad for idle time for the Mine and the Library, buy the
 * game to claim that idle time without the ad, and whether a ready ad puts a
 * red dot on the tab. In landscape (or with the `extraTabs` setting) it is
 * a tab of its own; otherwise it heads the Settings page. In the Android
 * app the ad is AdMob's and buying goes through Google Play
 * (`play-store.ts`); in a browser both are stand-ins: the ad is a short
 * in-game card and buying sets `save.shop.owned`. */
import { countdown } from "../away.ts";
import { AD_IDLE_MS, AD_PLAY_MS, adReady, idleLabel } from "../idle-bank.ts";
import { t } from "../i18n/index.ts";
import { appStore, readyStore } from "../play-store.ts";
import type { Save } from "../save.ts";

export interface ShopHost {
  save(): Save;
  clock(): number;
  readonly modal: HTMLDialogElement;
  /** The ad was watched (or claimed): pays its idle time, rising from `from`. */
  rewardAd(from: Element): void;
  /** Buys the game (through Play in the app, a stand-in in a browser). */
  buy(): void | Promise<void>;
  /** Saves after a setting changed (the red dot follows it). */
  update(): void;
}

/** The ad button's face: watch, claim (bought), or the wait for the next. */
function adFace(save: Save, now: number) {
  const gain = `<b class="shop-gain">${idleLabel(AD_IDLE_MS)}</b>`;
  if (!adReady(save.shop, now)) return { text: `${t("shop.readyIn", { time: countdown(save.shop.adReadyAt - now) })}`, ready: false };
  return { text: `${t(save.shop.owned ? "shop.claim" : "shop.watchAd")} ${gain}`, ready: true };
}

/** The buy button's face, with Play's local price once the app knows it. */
function buyFace(save: Save) {
  if (save.shop.owned) return t("shop.owned");
  const price = readyStore()?.price();
  return price ? `${t("shop.buy")} ${price}` : t("shop.buy");
}

/** Whether AdMob's privacy options must be offered (the app, some regions). */
const privacyShown = () => readyStore()?.privacyOptions() === true;

/** The shop's panel: the ad, the purchase and the notice checkbox. */
export function shopHtml(save: Save, now: number) {
  const ad = adFace(save, now);
  return `<div class="shop-panel">
    <button class="wide shop-ad${ad.ready ? " ready" : ""}" data-shop="ad" ${ad.ready ? "" : "disabled"}>${ad.text}</button>
    <button class="wide shop-buy" data-shop="buy" ${save.shop.owned ? "disabled" : ""}>${buyFace(save)}</button>
    <label class="setting">${t("setting.adNotify")}<input type="checkbox" data-shop="notify" ${save.settings.adNotify ? "checked" : ""}></label>
    <button class="wide" data-shop="privacy" ${privacyShown() ? "" : "hidden"}>${t("shop.privacy")}</button>
  </div>`;
}

/** An ad or a purchase is under way in the app (taps wait for it). */
let busy = false;

/** The Shop tab's page. */
export const shopPageHtml = (save: Save, now: number) =>
  `<div class="page-title"><h2>${t("nav.shop")}</h2></div>${shopHtml(save, now)}`;

/** Wires every shop panel under `root`. */
export function bindShop(root: ParentNode, host: ShopHost) {
  for (const panel of Array.from(root.querySelectorAll<HTMLElement>(".shop-panel"))) {
    const ad = panel.querySelector<HTMLButtonElement>('[data-shop="ad"]')!;
    ad.onclick = () => {
      const save = host.save();
      if (!adReady(save.shop, host.clock())) return;
      if (save.shop.owned) { host.rewardAd(ad); return; }
      const store = appStore();
      if (!store) { playAd(host, ad); return; }
      if (busy) return;
      busy = true;
      store.then((s) => s.showAd()).then((rewarded) => { if (rewarded) host.rewardAd(ad); }, () => {})
        .finally(() => { busy = false; });
    };
    panel.querySelector<HTMLButtonElement>('[data-shop="buy"]')!.onclick = () => {
      if (busy) return;
      busy = true;
      Promise.resolve(host.buy()).finally(() => { busy = false; });
    };
    panel.querySelector<HTMLButtonElement>('[data-shop="privacy"]')!.onclick = () => {
      void readyStore()?.showPrivacyOptions().catch(() => {});
    };
    const notify = panel.querySelector<HTMLInputElement>('[data-shop="notify"]')!;
    notify.onchange = () => {
      host.save().settings.adNotify = notify.checked;
      host.update();
    };
  }
}

/** Brings each shop panel's ad button up to date (the wait counts down). */
export function refreshShop(root: ParentNode, save: Save, now: number) {
  const ad = adFace(save, now);
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('.shop-panel [data-shop="ad"]'))) {
    if (button.innerHTML !== ad.text) button.innerHTML = ad.text;
    button.disabled = !ad.ready;
    button.classList.toggle("ready", ad.ready);
  }
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('.shop-panel [data-shop="buy"]'))) {
    const text = buyFace(save);
    if (button.textContent !== text) button.textContent = text;
    button.disabled = save.shop.owned;
  }
  const privacy = privacyShown();
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('.shop-panel [data-shop="privacy"]'))) {
    button.hidden = !privacy;
  }
}

/** The stand-in ad: a card that counts down, then pays. It cannot be
 * dismissed early. */
function playAd(host: ShopHost, from: Element) {
  const { modal } = host;
  if (modal.open) return;
  modal.classList.add("ad-dialog");
  modal.innerHTML = `<small>${t("shop.ad")}</small><h2>${t("shop.idle")} <b class="shop-gain">${idleLabel(AD_IDLE_MS)}</b></h2><p class="ad-count" aria-live="polite"></p><div class="ad-bar"><i></i></div>`;
  const count = modal.querySelector<HTMLElement>(".ad-count")!, bar = modal.querySelector<HTMLElement>(".ad-bar > i")!;
  const start = performance.now();
  const block = (e: Event) => e.preventDefault();
  modal.addEventListener("cancel", block);
  const tick = () => {
    const left = Math.max(0, AD_PLAY_MS - (performance.now() - start));
    count.textContent = String(Math.ceil(left / 1000));
    bar.style.width = `${100 * (1 - left / AD_PLAY_MS)}%`;
    if (left > 0) { requestAnimationFrame(tick); return; }
    modal.removeEventListener("cancel", block);
    modal.close();
    modal.classList.remove("ad-dialog");
    host.rewardAd(from);
  };
  modal.showModal();
  tick();
}
