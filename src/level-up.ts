import { tileTransform, type FrameContext } from "./render-frame.ts";

/** How long the level-up glow and its "LEVEL UP!" text last. */
export const LEVEL_UP_MS = 2000;
/** The glow and text fade out over the last half second. */
const FADE_MS = 500;
/** The fiery burst flies outward over the first part of it. */
const BURST_MS = 800;
const FLAMES = 16;

/** The hero's level-up, drawn over the board: a fiery flash bursting
 * outward from the hero, a glow around the hero, and "LEVEL UP!" across
 * the board, `age` ms after the level was reached. */
export function drawLevelUp(f: FrameContext, age: number) {
  if (age < 0 || age >= LEVEL_UP_MS) return;
  const fade = Math.min(1, (LEVEL_UP_MS - age) / FADE_MS);
  const c = f.c;
  c.save();
  c.setTransform(tileTransform(f, f.playerX, f.playerY));
  c.globalCompositeOperation = "lighter";
  drawGlow(c, age, fade, f.look.reduceMotion);
  if (!f.look.reduceMotion && age < BURST_MS) drawBurst(c, age / BURST_MS);
  c.restore();
  drawText(f, age, fade);
}

/** Warm light around the hero (in tile space, where a tile is 24 units),
 * breathing slowly unless motion is reduced. */
function drawGlow(c: CanvasRenderingContext2D, age: number, fade: number, reduced: boolean) {
  const pulse = reduced ? 1 : 0.85 + 0.15 * Math.sin(age / 90);
  const glow = c.createRadialGradient(12, 12, 0, 12, 12, 36 * pulse);
  glow.addColorStop(0, `rgba(255, 214, 120, ${0.75 * fade})`);
  glow.addColorStop(0.45, `rgba(255, 140, 40, ${0.45 * fade})`);
  glow.addColorStop(1, "rgba(255, 70, 0, 0)");
  c.fillStyle = glow;
  c.fillRect(-30, -30, 84, 84);
}

/** Tongues of flame and embers flying out in every direction; `t` runs
 * from 0 to 1 over the burst. */
function drawBurst(c: CanvasRenderingContext2D, t: number) {
  const out = 1 - (1 - t) * (1 - t) * (1 - t), alpha = 1 - t;
  // A white-hot flash at the start.
  if (t < 0.3) {
    const flash = c.createRadialGradient(12, 12, 0, 12, 12, 14 + 70 * t);
    flash.addColorStop(0, `rgba(255, 255, 230, ${1 - t / 0.3})`);
    flash.addColorStop(1, "rgba(255, 180, 60, 0)");
    c.fillStyle = flash;
    c.fillRect(-60, -60, 144, 144);
  }
  c.lineCap = "round";
  for (let i = 0; i < FLAMES; i++) {
    // Fixed, uneven angles and reaches, so the burst looks ragged but is the
    // same every time.
    const angle = (i / FLAMES) * Math.PI * 2 + 0.35 * Math.sin(i * 7.3),
      reach = 52 + 20 * (0.5 + 0.5 * Math.sin(i * 3.1)),
      dx = Math.cos(angle), dy = Math.sin(angle);
    const head = 6 + reach * out, tail = Math.max(4, head - 16 - 14 * (1 - t));
    const flame = c.createLinearGradient(12 + dx * tail, 12 + dy * tail, 12 + dx * head, 12 + dy * head);
    flame.addColorStop(0, "rgba(255, 60, 0, 0)");
    flame.addColorStop(0.6, `rgba(255, 140, 30, ${alpha})`);
    flame.addColorStop(1, `rgba(255, 240, 170, ${alpha})`);
    c.strokeStyle = flame;
    c.lineWidth = 6 * (1 - 0.6 * t);
    c.beginPath();
    c.moveTo(12 + dx * tail, 12 + dy * tail);
    c.lineTo(12 + dx * head, 12 + dy * head);
    c.stroke();
    // An ember flung a little further between each pair of flames.
    const ember = angle + Math.PI / FLAMES, far = 8 + (reach + 8) * out;
    c.fillStyle = `rgba(255, ${170 + 60 * (i % 2)}, 60, ${alpha})`;
    c.beginPath();
    c.arc(12 + Math.cos(ember) * far, 12 + Math.sin(ember) * far, 2.4 * (1 - 0.5 * t), 0, Math.PI * 2);
    c.fill();
  }
}

/** "LEVEL UP!" across the upper board, popping in and fading with the glow. */
function drawText(f: FrameContext, age: number, fade: number) {
  const c = f.c, pop = f.look.reduceMotion ? 1 : Math.min(1, 0.6 + age / 375);
  c.save();
  c.globalAlpha = fade;
  c.translate(f.width / 2, f.width * 0.32);
  c.scale(pop, pop);
  c.font = `700 ${Math.max(20, f.width * 0.085)}px Cinzel`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineJoin = "round";
  c.lineWidth = Math.max(3, f.width * 0.012);
  c.strokeStyle = "#3a1200";
  c.shadowColor = "rgba(255, 110, 20, 0.9)";
  c.shadowBlur = 14;
  c.strokeText("LEVEL UP!", 0, 0);
  const fill = c.createLinearGradient(0, -f.width * 0.04, 0, f.width * 0.04);
  fill.addColorStop(0, "#fff3b8");
  fill.addColorStop(0.5, "#ffc24a");
  fill.addColorStop(1, "#ff6a1a");
  c.fillStyle = fill;
  c.fillText("LEVEL UP!", 0, 0);
  c.restore();
}
