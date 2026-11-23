# Android app

The game ships to Google Play as a Capacitor wrapper around the same Vite
build that GitHub Pages serves. There is one codebase: every change merged
into `main` reaches both the web game and the next Android build.

## Pieces

- `capacitor.config.ts`: app ID `io.github.sethrimer3.towerdefense` (the Play
  package name, permanent once uploaded), name, and `webDir: "dist"`.
- `android/`: the native project made by `npx cap add android`. Generated
  parts (`app/src/main/assets/public`, `capacitor-cordova-android-plugins`,
  build outputs) are git-ignored; `npx cap sync android` recreates them from
  `dist/` and `node_modules/`.
  - `app/build.gradle` reads `versionCode`, `versionName` and `admobAppId` from
    Gradle properties (`-PversionCode=7`) or the environment
    (`ANDROID_VERSION_CODE`, `ANDROID_VERSION_NAME`, `ADMOB_APP_ID`). Unset, the
    AdMob app ID is Google's sample, which only serves test ads. It signs the
    release with the upload key when `ANDROID_KEYSTORE_PATH`,
    `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`
    are set.
  - `AndroidManifest.xml` carries the AdMob app ID meta-data.
  - Launcher icons and splash screens come from `public/GameIcon.png`:
    `python3 scripts/android/icons.py` redraws them (needs Pillow).
- `src/play-store.ts`: `isNativeApp()` (Capacitor's bridge sets
  `window.Capacitor`) and `appStore()`, null in a browser. Nothing here
  imports a plugin, so Node tests and the Pages build are unaffected.
- `src/play-store-native.ts`, loaded by dynamic import only in the app:
  - AdMob (`@capacitor-community/admob`): initialises, shows Google's consent
    form (UMP) when required, preloads a rewarded ad, and reports the reward
    only after the ad is dismissed with the reward earned. The Shop's
    Privacy options button appears when UMP says it must.
  - Play Billing (`@capgo/native-purchases`): buys the non-consumable
    product (`full_game` by default) and asks Play at start-up whether it is
    owned, which restores it on a new phone and removes it after a refund.
    The buy button shows Play's local price.
  - IDs come from the web build's environment: `VITE_ADMOB_REWARDED_ID`
    (default Google's test rewarded unit) and `VITE_PLAY_PRODUCT_ID`.
- `src/ui/shop.ts` uses the store when there is one and its stand-ins (the
  five-second card, the owned flag) otherwise.
- `public/privacy.html`: the privacy policy Play and AdMob ask for, served at
  `https://sethrimer3.github.io/TowerDefense/privacy.html`.

## CI

`.github/workflows/android.yml` runs on pull requests that touch the Android
pieces (build check only) and on every push to `main`:

1. `npm ci`, `npm run build` with the `ADMOB_REWARDED_ID` and
   `PLAY_PRODUCT_ID` repository variables, `npx cap sync android`.
2. `./gradlew bundleRelease` with `versionCode` = the workflow's run number,
   signed when the `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` secrets exist.
3. The `.aab` is kept as a run artifact.
4. With the key and `PLAY_SERVICE_ACCOUNT_JSON`, it is uploaded to Play's
   internal testing track (`PLAY_RELEASE_STATUS` variable, `draft` by
   default; `completed` once the app's first release is live).

Promoting a build from internal testing to production is done by hand in
Play Console. Setup steps for the accounts are in `docs/android-release.md`.

## Building locally

Needs Android Studio (or the Android SDK) and Java 21.

```sh
npm run build && npx cap sync android
npx cap open android        # Android Studio: run on a phone or emulator
cd android && ./gradlew bundleRelease
```
