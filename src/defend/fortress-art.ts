import { ENEMIES, enemySize } from "./catalog.ts";
import type { Brush } from "./battle-art.ts";
import type { Enemy } from "./sim.ts";

/** Crisp ashlar, plated legs and roof guns, on the city's 8px/cell grid. */
export function drawFortress({ c, px }: Brush, e: Enemy) {
  const def = ENEMIES[e.kind], fort = def.fortress!;
  const pixel = Math.max(1, Math.round(px / 8));
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  if (e.fortressPart) {
    const size = Math.max(3, Math.round(enemySize(e) * px));
    const x = e.x * px - size / 2, y = e.y * px - size / 2;
    const hurt = e.hp / e.maxHp < .5;
    rect(x - pixel, y - pixel, size + pixel * 2, size + pixel * 2, "#17161c");
    if (e.fortressPart.role === "turret") {
      rect(x, y, size, size, e.flash > 0 ? "#fff0cf" : hurt ? "#665045" : "#b39262");
      rect(x + pixel, y + pixel, size - pixel * 2, pixel, "#dfcfa3");
      rect(x + size / 2 - pixel, y + size / 2, pixel * 2, size, "#28262d");
      if (e.cd > 1.8) rect(x + size / 2 - pixel, y + size * 1.5, pixel * 2, pixel * 2, "#ffb357");
    } else if (e.fortressPart.role === "leg") {
      rect(x, y, size, size, e.flash > 0 ? "#fff" : "#605c67");
      rect(x, y + size / 2, size, pixel, "#b5a58c");
      rect(x - pixel, y + size, size + pixel * 2, pixel, "#28252a");
    } else {
      rect(x, y, size, size, e.flash > 0 ? "#fff" : hurt ? "#50464a" : "#94929d");
      rect(x + pixel, y + pixel, size - pixel * 2, pixel, "#d0c7b8");
      rect(x + size / 2, y + pixel, pixel, size - pixel * 2, "#655765");
    }
    return;
  }
  const width = Math.round(def.size * px), height = Math.round(fort.height * px);
  const x = Math.round(e.x * px - width / 2), y = Math.round(e.y * px - height / 2);
  rect(x - pixel, y - pixel, width + pixel * 2, height + pixel * 2, "#17131b");
  rect(x, y, width, height, def.color);
  for (let row = 0; row < height / pixel; row += 3) {
    for (let col = 0; col < width / pixel; col += 4) {
      const offset = row % 2 ? 2 : 0;
      if ((col + offset) * pixel >= width) continue;
      rect(x + (col + offset) * pixel, y + row * pixel, Math.min(3 * pixel, width - (col + offset) * pixel), pixel * 2, ((row + col) % 3) ? "#70645f" : "#a18b73");
    }
  }
  for (let n = 0; n < width; n += pixel * 4) rect(x + n, y - pixel * 2, pixel * 2, pixel * 3, "#a18b73");
  const armored = e.fortressParts?.some(p => p.hp > 0 && p.fortressPart?.role === "armor");
  rect(e.x * px - pixel * 3, e.y * px - pixel * 4, pixel * 6, pixel * 8, "#25212d");
  rect(e.x * px - pixel * 2, e.y * px - pixel * 3, pixel * 4, pixel * 6, e.flash > 0 ? "#fff" : armored ? "#686675" : "#cf484d");
  // Destroyed components remain as charred sockets, attached to the walker.
  for (const p of e.fortressParts ?? []) if (p.hp <= 0) {
    const dx = e.x + p.fortressPart!.dx, dy = e.y + p.fortressPart!.dy;
    rect(dx * px - pixel * 2, dy * px - pixel * 2, pixel * 4, pixel * 4, "#211b24");
    rect(dx * px - pixel, dy * px, pixel * 3, pixel, "#685043");
  }
}
