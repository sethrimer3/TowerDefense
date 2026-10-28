import { HallBackdrop, paintSconce, ART } from "./hall-art.ts";
import { BRICKS, W, TOP, COURSE, paintBrick, paintBrickBed } from "./brick-wall.ts";

const DROP = 16, BRICK_MS = 90, SETTLE_MS = 100;
// Lay the lower course first so every falling brick has something to land on.
const ORDER = [...BRICKS].sort((a, b) => b.y - a.y || a.x - b.x);

/** The boot screen owns its animation, independent of the game's frame loop.
 * It never consumes a game random stream or changes a player's save. */
export class LoadingScreen {
  private readonly wall: HallBackdrop;
  private readonly torch: HTMLCanvasElement;
  private readonly bricks: HTMLCanvasElement;
  private last = performance.now();
  private elapsed = 0;
  private frame = 0;
  private ready = false;
  private finish: (() => void) | null = null;

  constructor(private root: HTMLElement, private reduced: () => boolean) {
    this.wall = new HallBackdrop(root.querySelector<HTMLCanvasElement>(".loading-stones")!, "vault");
    this.torch = root.querySelector<HTMLCanvasElement>(".loading-torch")!;
    this.bricks = root.querySelector<HTMLCanvasElement>(".loading-bricks")!;
    this.bricks.width = W;
    this.bricks.height = DROP + TOP + COURSE * 2 + 1;
    this.draw();
  }

  private draw = () => {
    const now = Date.now(), reduced = this.reduced();
    const base = this.root.getBoundingClientRect(), torch = this.torch.getBoundingClientRect();
    paintSconce(this.torch, now, "left", reduced);
    // Match the actual wick at art pixel (6, 9), and light the stone's bevels.
    this.wall.draw(now, [{ x: torch.left - base.left + 6.5 * ART, y: torch.top - base.top + 9 * ART }], 0, reduced);
    const time = performance.now();
    // Resume gently after synchronous initialization or a backgrounded tab.
    this.elapsed += Math.min(50, time - this.last);
    this.last = time;
    const target = this.ready ? ORDER.length : ORDER.length - 1;
    if (!this.ready) this.elapsed = Math.min(this.elapsed, target * BRICK_MS);
    const elapsed = this.elapsed;
    const laid = reduced ? target : Math.min(target, Math.floor(elapsed / BRICK_MS));
    const c = this.bricks.getContext("2d")!;
    c.clearRect(0, 0, this.bricks.width, this.bricks.height);
    c.save();
    c.translate(0, DROP);
    paintBrickBed(c);
    for (let i = 0; i < laid; i++) paintBrick(c, ORDER[i]);
    if (!reduced && laid < target) {
      const fall = (elapsed % BRICK_MS) / BRICK_MS;
      const b = ORDER[laid];
      paintBrick(c, { ...b, y: b.y - Math.round((1 - fall * fall) * (DROP + b.y)) });
    }
    c.restore();
    if (this.ready && (reduced || elapsed >= ORDER.length * BRICK_MS + SETTLE_MS)) {
      this.finish?.();
      return;
    }
    this.frame = requestAnimationFrame(this.draw);
  };

  /** Complete the wall only when the game and its fonts are ready. */
  complete(): Promise<void> {
    return new Promise(resolve => {
      this.finish = () => {
        this.root.remove();
        document.documentElement.classList.remove("game-loading");
        const app = document.querySelector<HTMLElement>("#app")!;
        app.inert = false;
        app.removeAttribute("aria-busy");
        resolve();
      };
      this.ready = true;
    });
  }

  fail() {
    cancelAnimationFrame(this.frame);
    this.root.setAttribute("aria-label", "Unable to load the game. Try again.");
    this.root.querySelector<HTMLElement>(".loading-label")!.textContent = "Unable to load game";
    this.bricks.hidden = true;
    const retry = this.root.querySelector<HTMLButtonElement>(".loading-retry")!;
    retry.hidden = false;
    retry.onclick = () => location.reload();
  }
}
