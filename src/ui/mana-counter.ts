/** Small static pixel crystal; resource state has no renderer/simulation clock. */
import { t } from "../i18n/index.ts";
export class ManaCounter {
  readonly el = document.createElement("output");
  private readonly number = document.createElement("span");
  private previous = "";
  constructor() {
    this.el.className = "siege-mana";
    // An <output> is a live region; announcing every kill would drown a
    // screen reader in a crowded fight. The spell buttons carry affordability.
    this.el.setAttribute("aria-live", "off");
    const c = document.createElement("canvas");
    c.width = 12;
    c.height = 16;
    c.setAttribute("aria-hidden", "true");
    const ctx = c.getContext("2d")!;
    const widths = [2, 4, 6, 8, 10, 10, 10, 10, 10, 8, 8, 6, 4, 2];
    for (let y = 0; y < widths.length; y++) {
      const width = widths[y],
        x = (12 - width) / 2;
      ctx.fillStyle = "#080d14";
      ctx.fillRect(x, y + 1, width, 1);
      if (width > 2) {
        ctx.fillStyle = y < 5 ? "#78d6ee" : "#2677b5";
        ctx.fillRect(x + 1, y + 1, width - 2, 1);
        ctx.fillStyle = "#123655";
        ctx.fillRect(x + width - 2, y + 1, 1, 1);
      }
    }
    ctx.fillStyle = "#d8f8ff";
    ctx.fillRect(4, 3, 2, 5);
    ctx.fillStyle = "#9de9ff";
    ctx.fillRect(4, 8, 1, 3);
    this.el.append(c, this.number);
  }
  update(value: number, cap: number) {
    const text = value + " / " + cap;
    if (text === this.previous) return;
    this.previous = text;
    this.number.textContent = text;
    this.el.setAttribute("aria-label", t("siege.manaStatus", { current: value, cap }));
    this.el.title = t("siege.mana");
  }
}
