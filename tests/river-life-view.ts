// An Ambush level with a river through the forest (Old Road), with motion
// on, for tests/river-life.mjs. No player saves.
import "../src/style.css";
import "../src/theme.css";
import { AmbushBattlePage } from "../src/campaign/ambush-battle-ui.ts";
import { defaults } from "../src/save.ts";
import { setPixelArt } from "../src/defend/pixel-sprites.ts";
const save = defaults();
save.settings.reduceMotion = new URLSearchParams(location.search).has("still");
save.settings.effectsOff = false;
save.settings.pixelArt = true;
save.profile = { name: "River Warden", flag: { base: 12, layers: [] } };
setPixelArt(true);
const ambush = new AmbushBattlePage(document.querySelector("#ambush")!, 0, { save: () => save, store: () => {} });
ambush.show();
Object.assign(window, { riverLife: { ambush } });
function frame(now: number) {
  ambush.frame(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
