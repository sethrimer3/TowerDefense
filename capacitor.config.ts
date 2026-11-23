import type { CapacitorConfig } from "@capacitor/cli";

/** The Android app (`android/`): Capacitor wraps the Vite build in `dist/`.
 * `appId` becomes the Play Store package name and can never change once the
 * app is uploaded. See `docs/architecture/android.md`. */
const config: CapacitorConfig = {
  appId: "io.github.sethrimer3.towerdefense",
  appName: "Tower Defense",
  webDir: "dist",
  android: { backgroundColor: "#0d0b09" },
};

export default config;
