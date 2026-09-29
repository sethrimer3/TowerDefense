import type { Encounter, Gain, Heal } from "./state.ts";
import { paintContents } from "./tile-painters.ts";
import { materialImage } from "./material-sprites.ts";
import { tileCenter, toTileSpace, type FrameContext } from "./render-frame.ts";

/** How long each popup shows, and the fade that ends it (ms). */
const POPUP_MS = 1000;
const FADE_MS = 250;
/** How far a popup rises over its life, in tiles. */
const REWARD_RISE = 0.7;
const DAMAGE_RISE = 0.9;
/** Damage numbers start this far up their tile, clear of the sprite struck. */
const DAMAGE_START = 0.35;
/** Rewards without a sprite are written in the feedback text's gold. */
const REWARD_COLOR = "#f3d69a";
/** Damage the hero deals, the darker damage it takes, and HP it heals. */
const DAMAGE_COLOR = "#ff4040";
const HERO_DAMAGE_COLOR = "#b3121f";
const HEAL_COLOR = "#5fdc6a";
/** How far a strike leans into its target at the moment it lands, in tiles. */
const LUNGE = 0.3;

type Popup = { x: number; y: number; start: number };
type Offset = { dx: number; dy: number };
const STILL: Offset = { dx: 0, dy: 0 };

/** What rises off the board over its tiles: the damage number of each strike
 * in a fight as it lands, the HP each potion heals, and each reward picked
 * up, one after another. */
export class BoardPopups {
  private rewards: (Popup & { gain: Gain })[] = [];
  /** Damage and heal numbers. */
  private numbers: (Popup & { text: string; color: string })[] = [];
  /** The last heal raised. */
  private healed = 0;
  private fight: Encounter | null = null;
  /** How many of the fight's strikes have landed. */
  private landed = 0;
  private seed = NaN;

  /** Takes the game's new rewards, each queued to start as the one before
   * it ends, the fight's strikes that have landed by `now`, and a new heal.
   * A new run clears whatever was still showing. */
  update(game: { run: { seed: number }; gains: Gain[]; encounter: Encounter | null; lastHeal: Heal | null }, now: number) {
    if (game.run.seed !== this.seed) {
      this.seed = game.run.seed;
      this.rewards = [];
      this.numbers = [];
    }
    const heal = game.lastHeal;
    if (heal && heal.id !== this.healed) {
      this.healed = heal.id;
      this.numbers.push({ x: heal.x, y: heal.y + DAMAGE_START, start: now, text: `+${heal.to - heal.from}`, color: HEAL_COLOR });
    }
    const last = this.rewards.at(-1);
    let start = last ? Math.max(now, last.start + POPUP_MS) : now;
    for (const gain of game.gains.splice(0)) {
      this.rewards.push({ x: gain.x, y: gain.y, start, gain });
      start += POPUP_MS;
    }
    this.strike(game.encounter, now);
    this.rewards = this.rewards.filter((p) => now < p.start + POPUP_MS);
    this.numbers = this.numbers.filter((p) => now < p.start + POPUP_MS);
  }
  private strike(fight: Encounter | null, now: number) {
    if (fight !== this.fight) {
      this.fight = fight;
      this.landed = 0;
    }
    if (!fight) return;
    const strikes = fight.bout.strikes;
    while (this.landed < strikes.length && fight.start + strikes[this.landed].at <= now) {
      const s = strikes[this.landed++], on = s.by === "hero" ? fight.to : fight.from;
      this.numbers.push({
        x: on.x, y: on.y + DAMAGE_START, start: fight.start + s.at, text: String(s.damage),
        color: s.by === "hero" ? DAMAGE_COLOR : HERO_DAMAGE_COLOR,
      });
    }
  }
  /** Nothing is rising or waiting to. */
  get idle() {
    return !this.rewards.length && !this.numbers.length;
  }

  draw(f: FrameContext) {
    for (const p of this.numbers) this.drawText(f, p, p.text, p.color, DAMAGE_RISE, 0.55);
    for (const p of this.rewards) {
      if (f.now < p.start) continue;
      if (!this.drawSprite(f, p)) this.drawText(f, p, p.gain.text, REWARD_COLOR, REWARD_RISE, 0.42);
    }
  }
  /** The popup's opacity and how far it has risen (in tiles) at `now`. */
  private phase(f: FrameContext, p: Popup, rise: number) {
    const age = f.now - p.start;
    return {
      alpha: Math.max(0, Math.min(1, (POPUP_MS - age) / FADE_MS)),
      rise: f.look.reduceMotion ? 0 : (rise * age) / POPUP_MS,
    };
  }
  private drawText(f: FrameContext, p: Popup, text: string, color: string, rise: number, size: number) {
    const c = f.c, { alpha, rise: up } = this.phase(f, p, rise), at = tileCenter(f, p.x, p.y + up);
    c.save();
    c.globalAlpha = alpha;
    c.font = `700 ${Math.max(11, f.s * size)}px Cinzel`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineWidth = Math.max(2, f.s * 0.1);
    c.strokeStyle = "#000";
    c.strokeText(text, at.x, at.y);
    c.fillStyle = color;
    c.fillText(text, at.x, at.y);
    c.restore();
  }
  /** The reward's own sprite, rising; false when it has none (yet). */
  private drawSprite(f: FrameContext, p: Popup & { gain: Gain }) {
    const art = p.gain.art;
    if (!art) return false;
    const image = "material" in art ? materialImage(art.material) : null;
    if ("material" in art && !image) return false;
    const c = f.c, { alpha, rise } = this.phase(f, p, REWARD_RISE), look = f.look;
    c.save();
    c.globalAlpha = alpha;
    toTileSpace(c, f, p.x, p.y + rise);
    if ("tile" in art)
      paintContents(c, art.tile, { x: p.x, y: p.y, time: f.now, spritesOff: look.spritesOff, reduceMotion: look.reduceMotion, area1: look.area1, lifted: true });
    else {
      c.imageSmoothingEnabled = false;
      c.drawImage(image!, 3, 3, 18, 18);
      if (art.quantity > 1) {
        const count = `×${art.quantity}`;
        c.font = "700 8px Cinzel";
        c.textAlign = "left";
        c.lineWidth = 2;
        c.strokeStyle = "#000";
        c.strokeText(count, 18, 21);
        c.fillStyle = REWARD_COLOR;
        c.fillText(count, 18, 21);
      }
    }
    c.restore();
    return true;
  }
}

/** How far the hero and the enemy lean into their strikes at `now`: whoever
 * is striking reaches toward the other, furthest as the strike lands. */
export function lunges(fight: Encounter | null, now: number, reduceMotion: boolean): { hero: Offset; enemy: Offset } {
  const t = fight ? now - fight.start : 0;
  const s = fight && !reduceMotion ? fight.bout.strikes.find((s) => s.start <= t && t < s.end) : undefined;
  if (!fight || !s) return { hero: STILL, enemy: STILL };
  const reach = LUNGE * Math.sin((Math.PI * (t - s.start)) / (s.end - s.start));
  // One step apart, though the Delve's wrap can put them a board apart.
  const dx = Math.sign(fight.to.x - fight.from.x) * (Math.abs(fight.to.x - fight.from.x) > 1 ? -1 : 1),
    dy = Math.sign(fight.to.y - fight.from.y);
  return s.by === "hero"
    ? { hero: { dx: dx * reach, dy: dy * reach }, enemy: STILL }
    : { hero: STILL, enemy: { dx: -dx * reach, dy: -dy * reach } };
}
