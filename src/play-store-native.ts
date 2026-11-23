/** The Android app's store: AdMob rewarded ads and the Play Billing
 * purchase of the full game (`play-store.ts` says when it is used). Ad
 * unit and product IDs come from the build's `VITE_ADMOB_REWARDED_ID` and
 * `VITE_PLAY_PRODUCT_ID`; unset, the ad is Google's test unit, which never
 * pays real money, and the product is `full_game`. */
import { AdMob, AdmobConsentStatus, RewardAdPluginEvents } from "@capacitor-community/admob";
import { NativePurchases, PURCHASE_TYPE } from "@capgo/native-purchases";
import type { AppStore } from "./play-store.ts";

/** Google's sample rewarded ad unit for Android. */
const TEST_REWARDED_ID = "ca-app-pub-3940256099942544/5224354917";
const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const adId = env.VITE_ADMOB_REWARDED_ID || TEST_REWARDED_ID;
const isTesting = adId === TEST_REWARDED_ID;
const productId = env.VITE_PLAY_PRODUCT_ID || "full_game";
/** Play's purchase state for a completed (not pending) purchase. */
const PURCHASED = "1";

export async function createStore(): Promise<AppStore> {
  let price: string | null = null;
  let privacy = false;
  let canRequestAds = true;
  /** The next ad, loading or loaded (null: load one before showing). */
  let loading: Promise<boolean> | null = null;

  const load = () => (loading ??= AdMob.prepareRewardVideoAd({ adId, isTesting }).then(() => true, () => {
    loading = null;
    return false;
  }));

  try {
    await AdMob.initialize({ initializeForTesting: isTesting });
    // Google's consent form (GDPR and US states) before the first ad.
    let consent = await AdMob.requestConsentInfo();
    if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
      consent = await AdMob.showConsentForm();
    }
    canRequestAds = consent.canRequestAds;
    privacy = String(consent.privacyOptionsRequirementStatus) === "REQUIRED";
    if (canRequestAds) void load();
  } catch (e) {
    console.warn("AdMob unavailable", e);
  }
  NativePurchases.getProducts({ productIdentifiers: [productId], productType: PURCHASE_TYPE.INAPP })
    .then(({ products }) => { price = products[0]?.priceString ?? null; }, () => {});

  return {
    async showAd() {
      if (!canRequestAds || !(await load())) return false;
      loading = null;
      // The show call settles only when the reward is earned, so the ad's
      // end is its dismissal (or a failure to show).
      let rewarded = false, done = () => {};
      const closed = new Promise<void>((resolve) => { done = resolve; });
      const handles = await Promise.all([
        AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { rewarded = true; }),
        AdMob.addListener(RewardAdPluginEvents.Dismissed, () => done()),
        AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => done()),
      ]);
      AdMob.showRewardVideoAd().then(() => { rewarded = true; }, () => done());
      await closed;
      for (const h of handles) void h.remove();
      void load();
      return rewarded;
    },
    async buy() {
      try {
        const t = await NativePurchases.purchaseProduct({
          productIdentifier: productId,
          productType: PURCHASE_TYPE.INAPP,
          isConsumable: false,
        });
        return t.purchaseState === undefined || t.purchaseState === PURCHASED;
      } catch {
        return false; // Cancelled or failed.
      }
    },
    async owned() {
      try {
        const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
        return purchases.some((p) => p.productIdentifier === productId && (p.purchaseState ?? PURCHASED) === PURCHASED);
      } catch {
        return null;
      }
    },
    price: () => price,
    privacyOptions: () => privacy,
    showPrivacyOptions: () => AdMob.showPrivacyOptionsForm(),
  };
}
