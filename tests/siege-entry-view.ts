import "../src/style.css";
import "../src/theme.css";
import { SiegePage } from "../src/campaign/siege-ui.ts";
import { defaults, decode } from "../src/save.ts";
import { newSiege } from "../src/campaign/siege-progress.ts";
import { PATHS } from "../src/knowledge-paths.ts";
const key = "siege-entry.fixture",
  save = localStorage.getItem(key) ? decode(localStorage.getItem(key)!) : defaults();
if (!save.profile) {
  save.profile = {
    name: "Oak Warden",
    flag: { base: 12, layers: [{ pattern: "cross", color: 3, opacity: 75 }] },
  };
  save.siege = newSiege(45);
  save.siege.mmr = 1039;
  for (const [spell, path] of [
    ["meteor", "starfall"],
    ["frostNova", "shatter"],
    ["necromancy", "boneArchers"],
    ["reinforcements", "muster"],
  ] as const) {
    save.spellPaths[spell] = path;
    save.pathResearch[path] = {
      rank: 1,
      spent: PATHS.find((p) => p.id === path)!.ranks[0].cost,
    };
  }
}
save.settings.reduceMotion = matchMedia("(prefers-reduced-motion:reduce)").matches;
document.documentElement.classList.add("pixel-font");
const store = () => localStorage.setItem(key, JSON.stringify(save));
const page = new SiegePage(document.querySelector("#siege")!, {
  save: () => save,
  store,
});
page.show();
Object.assign(window, {
  siegeFixture: {
    save,
    page,
    setMmr: (mmr: number) => {
      save.siege!.mmr = mmr;
      page.reset();
      store();
    },
    win: () => {
      const r = page.sim.raid;
      r.defense.damageBuilding(r.field.defenderKeep, r.defense.keepMaxHp());
      page.sim.step(1 / 30);
      page.frame(performance.now());
    },
    lose: () => {
      page.sim.elapsed = 240;
      page.sim.step(1 / 30);
      page.frame(performance.now());
    },
  },
});
function frame(now: number) {
  page.frame(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
