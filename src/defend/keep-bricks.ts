import { defendRandom } from "./grid.ts";
import { BRICKS, W, H, MORTAR, FACE, LIGHT, SHADE, CRACK, paintBrick, paintBrickBed, type Brick } from "../ui/brick-wall.ts";

/** The keep's health in the battle's header: a short wall of bricks laid in
 * two courses, black mortar between them. As the keep is hurt the bricks
 * crack and break away from the right, tumbling out of the wall in pieces;
 * mended, they are laid again. Pixel art on a small canvas shown at twice
 * its size. Presentation only. */

type Chip = { x: number; y: number; w: number; vx: number; vy: number; life: number };

export class KeepBricks {
  readonly canvas: HTMLCanvasElement;
  private readonly c: CanvasRenderingContext2D;
  private readonly random = defendRandom("effects");
  /** Health left, 0 to 1, and how many whole bricks it stands for. */
  private fraction = 1;
  private standing = BRICKS.length;
  private chips: Chip[] = [];
  /** Seconds left of the white flash on the brick last hit. */
  private flash = 0;
  private dirty = true;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.className = "defend-keep-bricks";
    this.c = this.canvas.getContext("2d")!;
  }

  /** Sets the keep's health, 0 to 1; bricks it no longer covers break away. */
  set(fraction: number) {
    fraction = Math.max(0, Math.min(1, fraction));
    if (fraction === this.fraction) return;
    if (fraction < this.fraction) this.flash = 0.12;
    const standing = Math.ceil(fraction * BRICKS.length - 1e-9);
    for (let i = standing; i < this.standing; i++) this.shatter(BRICKS[i]);
    this.standing = standing;
    this.fraction = fraction;
    this.dirty = true;
  }

  /** Moves the falling pieces on and repaints when anything changed. */
  step(dt: number) {
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      this.dirty = true;
    }
    if (this.chips.length) {
      for (const p of this.chips) {
        p.vy += 70 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      this.chips = this.chips.filter((p) => p.life > 0 && p.y < H);
      this.dirty = true;
    }
    if (this.dirty) this.paint();
  }

  /** A brick breaks into two or three pieces that pop out and fall. */
  private shatter(b: Brick) {
    const parts = b.w > 3 ? 2 + Math.floor(this.random() * 2) : 1;
    let x = b.x;
    for (let i = 0; i < parts; i++) {
      const w = i === parts - 1 ? b.x + b.w - x : Math.max(1, Math.round(b.w / parts));
      this.chips.push({
        x, y: b.y, w,
        vx: (this.random() - 0.3) * 18,
        vy: -10 - this.random() * 16,
        life: 0.7 + this.random() * 0.4
      });
      x += w;
    }
  }

  private paint() {
    this.dirty = false;
    const c = this.c;
    c.clearRect(0, 0, W, H);
    // The wall's bed: black mortar round dark gaps where bricks have gone.
    paintBrickBed(c);
    // The part of the last brick's share already lost cracks it.
    const share = this.fraction * BRICKS.length - (this.standing - 1);
    BRICKS.slice(0, this.standing).forEach((b, i) => {
      const last = i === this.standing - 1;
      if (last && this.flash > 0) {
        c.fillStyle = "#fff3d6";
        c.fillRect(b.x, b.y, b.w, 3);
        return;
      }
      paintBrick(c, b);
      if (!last || b.w < 3) return;
      c.fillStyle = CRACK;
      if (share < 0.67) {
        c.fillRect(b.x + b.w - 2, b.y, 1, 1);
        c.fillRect(b.x + b.w - 3, b.y + 1, 1, 1);
      }
      if (share < 0.34) {
        c.fillRect(b.x + 1, b.y + 1, 1, 1);
        c.fillRect(b.x + 2, b.y + 2, 1, 1);
        c.fillRect(b.x + b.w - 1, b.y + 1, 1, 2);
      }
    });
    for (const p of this.chips) {
      const x = Math.round(p.x), y = Math.round(p.y);
      c.globalAlpha = Math.min(1, p.life * 3);
      c.fillStyle = MORTAR;
      c.fillRect(x - 1, y - 1, p.w + 2, 5);
      c.fillStyle = FACE;
      c.fillRect(x, y, p.w, 3);
      c.fillStyle = LIGHT;
      c.fillRect(x, y, p.w, 1);
      c.fillStyle = SHADE;
      c.fillRect(x, y + 2, p.w, 1);
    }
    c.globalAlpha = 1;
  }
}
