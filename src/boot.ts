import "./style.css";
import "./theme.css";
import "./loading.css";
import { LoadingScreen } from "./ui/loading-screen.ts";

// Read only the two visual preferences needed before the save module loads.
try {
  const settings = JSON.parse(localStorage.getItem("towerdefense.v1") ?? "null")?.settings;
  document.documentElement.classList.toggle("reduce-motion", settings?.reduceMotion === true);
  document.documentElement.classList.toggle("pixel-font", settings?.pixelFont !== false);
} catch { /* Loading the game handles unavailable storage and malformed saves. */ }

const loading = new LoadingScreen(document.querySelector<HTMLElement>("#loading-screen")!,
  () => document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches);

async function boot() {
  try {
    // Give the wall a painted frame before evaluating the game's larger modules.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const game = await import("./main.ts");
    await document.fonts.ready;
    await loading.complete();
    game.startGame();
  } catch (error) {
    console.error("Game startup failed", error);
    loading.fail();
  }
}

void boot();
