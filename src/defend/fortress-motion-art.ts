/** Shared top-down articulation. Stride follows distance, never idle wall time. */
import { ENEMIES } from "./catalog.ts";
import { fortressLift, FORTRESS_FALL } from "./fortress.ts";
import type { Enemy } from "./sim.ts";
import type { Brush } from "./battle-art.ts";

export const FORTRESS_GAIT = { stride: .65, stance: .74, reach: .22, dustLife: .4 } as const;
const legBank = (local: number, side: number) => (local + (side === 1 || side === 2 ? 1 : 0)) % 2;

export function fortressBodyY(core: Enemy, px: number, reduced = false) {
  const state = core.walker;
  // Reduce Motion snaps the drop while retaining the correct gameplay state.
  return (core.y - (reduced && state?.phase === "falling" ? 0 : fortressLift(core))) * px;
}

/** Diagonal banks alternate; stance exactly cancels chassis travel. */
export function fortressFootStride(walk: number, stride: number, local: number, side: number) {
  const bank = legBank(local, side);
  const cycle = (walk / stride + bank * .5) % 1, stance = FORTRESS_GAIT.stance;
  const swing = cycle < stance ? 0 : (cycle - stance) / (1 - stance);
  const forward = cycle < stance ? (.5 * stance - cycle) * stride
    : (-.5 + swing * swing * (3 - 2 * swing)) * stance * stride;
  return { forward, lift: Math.sin(swing * Math.PI), settle: Math.max(0, 1 - cycle / .12) };
}

export function drawFortressLegs({ c, px }: Brush, core: Enemy, reduced = false, blight = false) {
  const def = ENEMIES[core.kind], scale = (def.fortress!.partScale ?? 1) * px;
  const walk = reduced ? 0 : core.walker?.walk ?? 0;
  const falling = core.walker?.phase === "falling";
  const grounded = core.walker?.phase === "grounded";
  const k = falling ? Math.min(1, core.walker!.fall / FORTRESS_FALL) : grounded ? 1 : 0;
  const facing = core.facing ?? { x: 0, y: 1 };
  const length = Math.hypot(facing.x, facing.y) || 1;
  const ux = facing.x / length, uy = facing.y / length;
  const stride = FORTRESS_GAIT.stride * (def.fortress!.partScale ?? 1);
  // A folded knee can almost double back on itself. A miter on the expanded
  // contour would turn that acute corner into a long, animated triangle.
  c.save(); c.lineCap = "round"; c.lineJoin = "round";
  const sideCounts = [0, 0, 0, 0];
  for (const leg of core.fortressParts ?? []) {
    if (leg.fortressPart?.role !== "leg") continue;
    const side = leg.fortressPart.side ?? (leg.fortressPart.dx < 0 ? 0 : 2);
    const local = sideCounts[side]++;
    const nx = side === 0 ? -1 : side === 2 ? 1 : 0, ny = side === 1 ? -1 : side === 3 ? 1 : 0;
    const hipX = (core.x + leg.fortressPart.dx - nx * .3 * (def.fortress!.partScale ?? 1)) * px;
    const hipY = fortressBodyY(core, px, reduced) + (leg.fortressPart.dy - ny * .3 * (def.fortress!.partScale ?? 1)) * px;
    if (leg.hp <= 0) {
      c.fillStyle = blight ? "#000000" : "#302b30";
      c.fillRect(hipX - scale * .09, hipY - scale * .09, scale * .18, scale * .18);
      continue;
    }
    const step = fortressFootStride(walk, stride, local, side);
    const forward = step.forward, lift = step.lift * scale * .13;
    const footX = leg.x * px + ux * forward * px + nx * scale * (FORTRESS_GAIT.reach + k * .16);
    const footY = leg.y * px + uy * forward * px + ny * scale * (FORTRESS_GAIT.reach + k * .16) - lift;
    const bend = .22 + (reduced ? 0 : step.settle * .035);
    const kneeX = (hipX + footX) / 2 + nx * scale * bend;
    const kneeY = (hipY + footY) / 2 + ny * scale * bend;
    const limb = (width: number, color: string) => {
      c.strokeStyle = color; c.lineWidth = scale * width;
      c.beginPath(); c.moveTo(hipX, hipY); c.lineTo(kneeX, kneeY); c.lineTo(footX, footY); c.stroke();
    };
    limb(.22, blight ? "#000000" : "#292830");
    if (!blight) limb(.11, "#838390");
    c.fillStyle = blight ? "#000000" : "#575664";
    c.fillRect(footX - scale * .16, footY - scale * .14, scale * .32, scale * .28);
    if (!blight) {
      c.fillStyle = "#bab6b7"; c.fillRect(kneeX - scale * .06, kneeY - scale * .06, scale * .12, scale * .12);
    }
  }
  c.restore();
}

/** A low rotating carriage and a long, directional barrel or paired rail. */
export function drawFortressGun({ c, px }: Brush, part: Enemy, scale: number, blight = false) {
  const laser = part.fortressPart?.weapon === "laser" || !blight && ENEMIES[part.kind].fortress!.tier >= 3;
  const aim = part.aim;
  const angle = aim ? Math.atan2(aim.y - part.y, aim.x - part.x) : Math.PI / 2;
  const fresh = part.cd > (blight ? (laser ? 2 : ENEMIES[part.kind].cooldown) : 2) - .13;
  const recoil = fresh ? .06 * scale : 0;
  c.save(); c.translate(part.x * px, part.y * px); c.rotate(angle);
  c.fillStyle = blight ? "#000000" : "#36343e";
  c.fillRect(-scale * .25, -scale * .23, scale * .5, scale * .46);
  c.fillStyle = blight ? "#000000" : "#8f8b94";
  c.fillRect(-scale * .17, -scale * .16, scale * .33, scale * .32);
  c.fillStyle = blight ? "#000000" : "#45434d";
  c.fillRect(-recoil, -scale * .13, scale * .82, scale * .26);
  if (laser) {
    c.fillStyle = blight ? "#b83e00" : "#536d85";
    c.fillRect(scale * .2 - recoil, -scale * .07, scale * .62, scale * .14);
    c.fillStyle = blight ? "#ff7312" : "#c5e8ff";
    c.fillRect(scale * .3 - recoil, -scale * .023, scale * .5, scale * .046);
  } else {
    c.fillStyle = blight ? "#ff8515" : "#18171d";
    c.fillRect(scale * .72 - recoil, -scale * .1, scale * .1, scale * .2);
    if (!blight) {
      c.fillStyle = "#b9b2ad"; c.fillRect(scale * .06 - recoil, -scale * .13, scale * .55, scale * .045);
    }
  }
  if (fresh) {
    c.fillStyle = laser ? "rgba(255,106,0,.65)" : "rgba(255,185,75,.7)";
    c.fillRect(scale * .83, -scale * .08, scale * .14, scale * .16);
  }
  if (part.flash > 0) {
    c.fillStyle = `rgba(255,239,210,${Math.min(.3, part.flash * 2.5)})`;
    c.fillRect(-scale * .24, -scale * .22, scale * .48, scale * .44);
  }
  c.restore();
}

export function drawFortressRubble({ c, px }: Brush, sim: { fortressRubble?: { x: number; y: number; r: number; life: number; seed: number }[] }) {
  c.save();
  for (const rock of sim.fortressRubble ?? []) {
    c.globalAlpha = Math.min(1, rock.life / 2) * .6;
    for (let n = 0; n < 8; n++) {
      const a = n * 2.4 + rock.seed, radius = rock.r * Math.sqrt((n + .5) / 8);
      const size = px * (.045 + n % 3 * .025);
      c.fillStyle = n % 2 ? "#77716a" : "#3e3935";
      c.fillRect((rock.x + Math.cos(a) * radius) * px, (rock.y + Math.sin(a) * radius) * px, size, size * .7);
    }
  }
  c.restore();
}
