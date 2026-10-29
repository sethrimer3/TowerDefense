/** Isolated paired workload: production page versus native engine/renderer, same map and waves. */
import "../src/style.css";
import "../src/theme.css";
import { AmbushBattlePage } from "../src/campaign/ambush-battle-ui.ts";
import { defaults } from "../src/save.ts";
import { soundEnabledBy } from "../src/sound.ts";
import type { StructureKind } from "../src/defend/catalog.ts";
const save = defaults();
save.settings.soundOff = true;
save.settings.reduceMotion = true;
save.defend.speed3 = true;
save.defend.battleSpeed = 3;
soundEnabledBy(() => !save.settings.soundOff);
const page = new AmbushBattlePage(document.querySelector("#ambush")!, 29, { save: () => save, store: () => {} });
const next = () => new Promise<number>(requestAnimationFrame);
function setup() {
  page.reset();
  const s = page.sim;
  s.gold = 100000;
  for (const kind of [
    "archerTower",
    "archerTower",
    "meleeGuild",
    "rangedGuild",
    "cannonTower",
    "wizardTower",
    "archerTower",
    "meleeGuild",
    "rangedGuild",
    "archerTower",
    "cannonTower",
    "archerTower",
  ] as StructureKind[]) {
    let placed = false;
    for (let qy = 1; qy < 50 && !placed; qy++)
      for (let qx = 1; qx < 35; qx++)
        if (s.grid.check(kind, qx, qy, s.buildings).fits) {
          s.placeAt(kind, qx, qy);
          placed = true;
          break;
        }
  }
  s.speed = s.engine.speed = 3;
}
async function measure(mode: "native" | "ambush") {
  setup();
  let stamp = 1000;
  const frames: number[] = [];
  let peak = 0;
  for (let wave = 1; wave <= 20; wave++) {
    const s = page.sim,
      e = s.engine;
    e.enemies = [];
    s.wave = wave - 1;
    (s as unknown as { queue: string[] }).queue = [];
    s.phase = "battle";
    s.send();
    const queue = (s as unknown as { queue: import("../src/campaign/ambush-waves.ts").WaveEntry[] }).queue;
    while (queue.length) {
      const { kind, lane } = queue.shift()!,
        entry = s.field.lanes[lane][0];
      e.releaseEnemy(kind, { x: Math.max(0.5, Math.min(71.5, entry.x)), y: Math.max(0.5, entry.y) });
    }
    peak = Math.max(peak, e.enemies.length);
    for (let frame = 0; frame < 8; frame++) {
      await next();
      stamp += 1000 / 60;
      const start = performance.now();
      if (mode === "ambush") page.frame(stamp);
      else {
        e.update(1 / 60);
        (page as unknown as { draw: () => void }).draw();
      }
      if (frame >= 2) frames.push(performance.now() - start);
    }
  }
  frames.sort((a, b) => a - b);
  return { frames: frames.length, p50: frames[Math.floor(frames.length * 0.5)], p95: frames[Math.floor(frames.length * 0.95)], max: frames.at(-1), peak };
}
Object.assign(window, {
  ambushPerformance: {
    run: async () => {
      const native = await measure("native"),
        ambush = await measure("ambush");
      return { viewport: [innerWidth, innerHeight], waves: 20, speed: 3, native, ambush, p95Ratio: ambush.p95 / native.p95 };
    },
  },
});
