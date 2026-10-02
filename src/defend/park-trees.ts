/** The parks' trees, standing over everyone below them: drawn after the
 * units from the sprites `park-art.ts` bakes, each fading to half opacity
 * while anyone (an enemy, soldier or civilian) is under its canopy, so
 * nobody is lost from sight, and filling back in once they have passed.
 * Their shadows lie in the city layer (`shadow-art.ts`). Presentation only. */
import type { CityMap } from "./citygen.ts";
import { ART, parkArt, type TreeSprite } from "./park-art.ts";

/** A tree's opacity while someone is under it. */
export const UNDER_ALPHA = 0.5;
/** How fast a tree fades, in opacity a second. */
const FADE = 3;

/** Someone who can stand under a tree: position and size in cells. */
export type Under = { x: number; y: number; size: number };

/** Whether `u` stands under tree `t`'s canopy. */
export const under = (t: TreeSprite, u: Under) => {
  const dx = u.x - t.cx, dy = u.y - t.cy, r = t.r + u.size / 2;
  return dx * dx + dy * dy < r * r;
};

export class ParkTrees {
  private map: CityMap | null = null;
  private trees: TreeSprite[] = [];
  /** Each tree's opacity, easing toward 1 or `UNDER_ALPHA`. */
  readonly alpha: number[] = [];
  private off: HTMLCanvasElement | null = null;

  sync(map: CityMap) {
    if (map === this.map) return;
    this.map = map;
    this.trees = parkArt(map).trees;
    this.alpha.length = 0;
    for (let k = 0; k < this.trees.length; k++) this.alpha.push(1);
  }

  /** Eases each tree toward half opacity while anyone is under it, `dt`
   * seconds on (at once under reduced motion). */
  update(units: readonly Under[], dt: number, reduceMotion: boolean) {
    const step = reduceMotion ? 1 : Math.min(1, dt * FADE);
    this.trees.forEach((t, k) => {
      let covered = false;
      for (const u of units) if (under(t, u)) {
        covered = true;
        break;
      }
      const goal = covered ? UNDER_ALPHA : 1, a = this.alpha[k];
      this.alpha[k] = a < goal ? Math.min(goal, a + step) : Math.max(goal, a - step);
    });
  }

  /** Draws the trees onto `c` (the camera applied), `px` canvas pixels a
   * cell. With `shade`, they are drawn apart first and `shade` darkens them
   * (drawing source-atop) as the battle's light darkens the city below. */
  draw(c: CanvasRenderingContext2D, px: number, shade?: (o: CanvasRenderingContext2D) => void) {
    if (!this.trees.length) return;
    let target = c;
    if (shade) {
      this.off ??= document.createElement("canvas");
      if (this.off.width !== c.canvas.width || this.off.height !== c.canvas.height) {
        this.off.width = c.canvas.width;
        this.off.height = c.canvas.height;
      }
      target = this.off.getContext("2d")!;
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.clearRect(0, 0, this.off.width, this.off.height);
      target.setTransform(c.getTransform());
    }
    const k = px / ART;
    target.save();
    target.imageSmoothingEnabled = false;
    this.trees.forEach((t, i) => {
      if (!t.canvas) return;
      target.globalAlpha = this.alpha[i];
      target.drawImage(t.canvas, t.x * k, t.y * k, t.w * k, t.h * k);
    });
    target.restore();
    if (!shade) return;
    target.save();
    target.globalCompositeOperation = "source-atop";
    shade(target);
    target.restore();
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.off!, 0, 0);
    c.restore();
  }
}
