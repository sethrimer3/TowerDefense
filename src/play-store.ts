/** The Shop's real ad and purchase, when the game runs as the Android app
 * (Capacitor). In a browser (GitHub Pages) there is no store: `appStore()`
 * is null and the Shop keeps its stand-ins (`ui/shop.ts`). The native side
 * lives in `play-store-native.ts`, loaded only inside the app so the web
 * build never fetches the ad and billing plugins. */

export interface AppStore {
  /** Shows a rewarded ad: true once the player earned the reward. */
  showAd(): Promise<boolean>;
  /** Buys the game: true once Play says it is owned. */
  buy(): Promise<boolean>;
  /** Whether Play holds the purchase (null: Play could not be asked). */
  owned(): Promise<boolean | null>;
  /** The game's local price from Play, once known ("$4.99"). */
  price(): string | null;
  /** Whether the player must be offered AdMob's privacy options. */
  privacyOptions(): boolean;
  /** Opens AdMob's privacy options form. */
  showPrivacyOptions(): Promise<void>;
}

type CapacitorGlobal = { isNativePlatform?: () => boolean };

/** Whether the page runs inside the native app: Capacitor's bridge sets
 * `window.Capacitor` before the page loads. */
export const isNativeApp = () =>
  (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor?.isNativePlatform?.() === true;

let store: Promise<AppStore> | null = null;
let ready: AppStore | null = null;

/** The app's store, starting it on first call; null in a browser. */
export function appStore(): Promise<AppStore> | null {
  if (!isNativeApp()) return null;
  store ??= import("./play-store-native.ts").then(async (m) => (ready = await m.createStore()));
  return store;
}

/** The store once started, for synchronous reads (price, privacy options). */
export const readyStore = () => ready;
