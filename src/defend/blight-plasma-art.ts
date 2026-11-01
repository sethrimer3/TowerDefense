/** Orange plasma: a growing spherical charge, a lofted ball and a huge pulse field. */
import { BLIGHT_PLASMA, plasmaBallRadius, type PlasmaShot } from "./blight-plasma.ts";
import { hash01 } from "./grid.ts";
import type { Brush } from "./battle-art.ts";
import type { DefendSim, Enemy } from "./sim.ts";

/** A parabolic lift over straight ground travel; presentation only. */
export function plasmaShotPose(shot: PlasmaShot) {
  const k = Math.max(0, Math.min(1, shot.t / shot.dur));
  const distance = Math.hypot(shot.x1 - shot.x0, shot.y1 - shot.y0);
  const height = 4 * k * (1 - k) * (2 + distance * .22);
  return { x: shot.x0 + (shot.x1 - shot.x0) * k, y: shot.y0 + (shot.y1 - shot.y0) * k, height };
}

function orb(c: CanvasRenderingContext2D, x: number, y: number, radius: number, seconds: number, seed: number, alpha = 1) {
  c.save(); c.globalAlpha *= alpha;
  const halo = c.createRadialGradient(x, y, radius * .65, x, y, radius * 1.3);
  halo.addColorStop(0, "rgba(255,97,0,.2)"); halo.addColorStop(.65, "rgba(255,97,0,.13)"); halo.addColorStop(1, "rgba(255,64,0,0)");
  const disc = (r: number) => { const p = new Path2D(); p.arc(x, y, r, 0, Math.PI * 2); CanvasRenderingContext2D.prototype.fill.call(c, p); };
  c.fillStyle = halo; disc(radius * 1.3);
  const body = c.createRadialGradient(x - radius * .28, y - radius * .32, radius * .03, x, y, radius);
  body.addColorStop(0, "#ffdda0"); body.addColorStop(.22, "#ffc258"); body.addColorStop(.62, "#ff850b"); body.addColorStop(.88, "#db4500"); body.addColorStop(1, "#8a2100");
  c.fillStyle = body; disc(radius);
  for (let n = 0; n < 6; n++) {
    const a = seconds * (n % 2 ? -.9 : .8) + hash01(seed, n) * 6.28;
    const path = new Path2D(); path.ellipse(x, y, radius * (.48 + n % 3 * .17), radius * (.2 + n % 2 * .18), a, .3, 4.8);
    c.strokeStyle = n % 2 ? "rgba(255,213,101,.55)" : "rgba(255,120,5,.8)";
    c.lineWidth = Math.max(.7, radius * .025);
    CanvasRenderingContext2D.prototype.stroke.call(c, path);
  }
  c.restore();
}

export function drawPlasmaTurret({ c, px }: Brush, part: Enemy, seconds: number, reduced = false) {
  const scale = px * 1.2, x = part.x * px, y = part.y * px;
  c.save(); c.fillStyle = "#000000";
  c.fillRect(x - scale * .65, y - scale * .42, scale * 1.3, scale * .84);
  c.strokeStyle = "#a63700"; c.lineWidth = scale * .08;
  c.beginPath(); c.arc(x, y, scale * .43, 0, Math.PI * 2); c.stroke();
  c.fillStyle = "#fb6a09";
  for (const side of [-1, 1]) c.fillRect(x + side * scale * .48 - scale * .045, y - scale * .24, scale * .09, scale * .48);
  if (part.plasmaCharge) {
    const progress = part.plasmaCharge.elapsed / BLIGHT_PLASMA.charge;
    orb(c, x, y, plasmaBallRadius(part.kind, progress) * px, reduced ? 0 : seconds, part.id);
  }
  c.restore();
}

export function drawPlasma({ c, px }: Brush, sim: DefendSim, reduced = false) {
  const seconds = reduced ? 0 : sim.time;
  for (const shot of sim.plasmaShots) {
    const pose = plasmaShotPose(shot), radius = shot.ballRadius * px;
    c.save(); c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath();
    c.ellipse(pose.x * px, pose.y * px, radius * .8, radius * .35, 0, 0, Math.PI * 2); c.fill(); c.restore();
    if (!reduced) for (let n = 5; n >= 1; n--) {
      const age = Math.max(0, shot.t - n * .045), tail = plasmaShotPose({ ...shot, t: age });
      orb(c, tail.x * px, (tail.y - tail.height) * px, radius * (1 - n * .11), seconds, shot.seed, (1 - n / 6) * .12);
    }
    orb(c, pose.x * px, (pose.y - pose.height) * px, radius, seconds, shot.seed);
  }
  for (const sphere of sim.plasmaSpheres) {
    const fade = Math.min(1, (BLIGHT_PLASMA.life - sphere.t) / .8);
    const pulse = reduced ? 0 : (sphere.t % BLIGHT_PLASMA.pulse) / BLIGHT_PLASMA.pulse;
    const radius = sphere.r * px;
    c.save(); c.globalAlpha *= fade;
    // The translucent volume lets the glowing shattered ground remain visible.
    const g = c.createRadialGradient(sphere.x * px - radius * .22, sphere.y * px - radius * .25, 0, sphere.x * px, sphere.y * px, radius);
    g.addColorStop(0, "rgba(255,190,83,.18)"); g.addColorStop(.7, "rgba(255,104,0,.24)");
    g.addColorStop(.94, "rgba(255,124,12,.38)"); g.addColorStop(1, "rgba(237,67,0,.06)");
    c.fillStyle = g; c.beginPath(); c.arc(sphere.x * px, sphere.y * px, radius, 0, Math.PI * 2); c.fill();
    for (let n = 0; n < 3; n++) {
      c.strokeStyle = `rgba(255,${120 + n * 32},32,${.65 - n * .16})`; c.lineWidth = px * (.06 + n * .015);
      c.beginPath(); c.ellipse(sphere.x * px, sphere.y * px, radius * (1 - n * .012), radius * (n === 0 ? 1 : .3 + n * .2), n * .9, 0, Math.PI * 2); c.stroke();
    }
    if (!reduced) {
      c.strokeStyle = `rgba(255,192,70,${(1 - pulse) * .6})`; c.lineWidth = px * .08;
      c.beginPath(); c.arc(sphere.x * px, sphere.y * px, radius * pulse, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
  }
}
