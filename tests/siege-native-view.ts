import "../src/style.css";
import "../src/theme.css";
import { defaults } from "../src/save.ts";
import { generateCastle } from "../src/campaign/castles.ts";
import { CampaignSim } from "../src/campaign/sim.ts";
import { DefendRenderer } from "../src/defend/render.ts";
import { rankLabel } from "../src/campaign/siege-ranks.ts";
import { flagSvg } from "../src/profile/model.ts";
const game = defaults();
game.profile = { name: "Oak Warden", flag: { base: 12, layers: [{ pattern: "cross", color: 3 }] } };
game.defend.owned.meleeGuild = 4;
game.defend.owned.rangedGuild = 4;
document.documentElement.classList.add("pixel-font");
const rows = [],
  draws: (() => void)[] = [];
for (const mmr of [100, 1000, 1600, 2720]) {
  const c = generateCastle(45, mmr),
    sim = new CampaignSim("siege", 0, [], game.defend.owned, game.defend.levels, c, game);
  sim.start();
  for (let n = 0; n < 240; n++) sim.step(1 / 30);
  const card = document.createElement("article");
  card.style.cssText = "background:var(--wood);border:2px solid var(--brass-nails);padding:8px";
  card.innerHTML = "<h2>" + rankLabel(mmr) + "</h2><p>" + flagSvg(c.owner.flag!) + " " + c.owner.name + " · " + mmr + "</p>";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;height:500px";
  card.append(canvas);
  document.querySelector("#gallery")!.append(card);
  const r = new DefendRenderer(canvas);
  draws.push(() => {
    r.resize(card.clientWidth - 16, 500);
    r.resetCam();
    r.draw(sim.map, sim.renderSim, null, { grid: 0, weather: null, night: 0, now: sim.elapsed * 1000, reduceMotion: true, effects: true });
  });
  rows.push({
    mmr,
    phase: sim.phase,
    attack: sim.raid.attack.soldiers.length,
    defense: sim.raid.defense.soldiers.length,
    homes: c.castle.layout.structures.length,
  });
}
draws.forEach((draw) => draw());
Object.assign(window, { nativeSiegeRows: rows });
document.body.dataset.ready = "true";
