import { drawFortressRubble } from "./fortress-motion-art.ts";
import { drawBlightFortress, drawBlightLasers } from "./blight-fortress-art.ts";
import { isBlightFlier } from "./blight-fliers.ts";
import { drawBlightFlier } from "./blight-flier-art.ts";
import { drawWormShadow, wormBodyVisible } from "./blight-worm-art.ts";
import { basicUnitSprite } from "./basic-unit-art.ts";
import { drawSprite } from "./damage-art.ts";
import { ART, UNIT_CONTOUR_ART_PIXELS, DARK_UNIT_INK, PLAYER_UNIT_INK, NEUTRAL_UNIT_INK, MARKED_UNIT_INK, BROOD_UNIT_INK, PORTAL_UNIT_INK } from "./art-scale.ts";
import {drawChrono} from "./chrono-art.ts";
import { drawFortress } from "./fortress-art.ts";
import { drawIceEnemy } from "./ice-enemy-art.ts";
import { enemySize } from "./catalog.ts";
import { drawEnemyHealthbars, trackHealthbarPeak } from "./healthbars.ts";
import { drawZoneEnemyBody, zoneEnemyRows } from "./zone-enemy-art.ts";
import { drawBlackHoles, drawHostileMarks, drawPoisonClouds } from "./hostile-art.ts";
import { drawFirework, drawSiegeEngine, drawSiegeShots, siegeLights } from "./siege-art.ts";
import { boatLights, drawBoat } from "./boat-art.ts";
/** What DEFEND draws fresh each battle frame over the city layer: struck and
 * damaged buildings, blast scorches, then the units, projectiles and effects.
 * Every painter takes a `Brush`: the board's context and its pixels per cell. */
import { hash01 } from "./grid.ts";
import { HOPLITE, JAVELINEER, LANCER, SPEARMAN, ARCHER_UNIT, ASSASSIN_UNIT, BRAWLER, CIVILIAN, DARK_WIZARD, ENEMIES, FIRE_MAGE, GATLING_GUNNER, GUNNER, MACHINE_GUNNER, MUSKETEER, RAIL_SNIPER, ROCKETEER, SLINGER, SNIPER, SOLDIER, VALKYRIE, watchRadius, type EnemyDef } from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { center } from "./pathing.ts";
import { paintKeepFlash } from "./structure-art.ts";
import type { CarriedLight } from "./lighting.ts";
import { drawFireballs, drawMageBolts, drawMage } from "./mage-art.ts";
import { drawArrows, drawBreath, drawShells, drawSparks } from "./projectile-art.ts";
import { drawWisps } from "./wisp-art.ts";
import { drawLasers } from "./laser-art.ts";
import { drawStabs, drawValkyrie } from "./valkyrie-art.ts";
import { drawHero, drawSwings } from "./hero-art.ts";
import { drawMeleeCape } from "./melee-cape.ts";
import { drawBlades, drawShade } from "./shade-art.ts";
import { drawNano } from "./nano-art.ts";
import { drawDarkWizard } from "./dark-art.ts";
import { drawRaisings, drawRisen } from "./necro-art.ts";
import { drawImpacts, drawMeteors } from "./meteor-art.ts";
import { drawFrostBursts } from "./frost-art.ts";
import { drawCalled, drawDrops, drawStaggered } from "./reinforce-art.ts";
import { drawExplosion, drawScorches as drawScorchArt } from "./blast-art.ts";
import { BUILDING_FLASH, type DefendSim, type Effect, type Enemy, type Soldier } from "./sim.ts";
import { hallPaths } from "./muskets.ts";
import { sniperAim } from "./snipers.ts";
import { drawDarklingBodies, drawSimpleEnemies, drawSimpleTroops } from "./simple-units.ts";
import { drawPixel, enemySprite } from "./pixel-sprites.ts";
import { isMelee, meleeFacing } from "./melee-facing.ts";
import { UnitOutline, type UnitInks } from "./unit-outline.ts";
import { drawGarrisons, garrisoned } from "./garrison-icons.ts";

export type Brush = { c: CanvasRenderingContext2D; px: number };

/** The black rim drawn under the troops' bodies, fists and weapons. */
const RIM = "#0b0907";
/** Where rims go while units are drawn for merged outlines
 * (`unit-outline.ts`): its outline layer, under every unit's body. */
let rims: CanvasRenderingContext2D | null = null;
/** The context to draw a rim for a unit being drawn on `c`, at `c`'s
 * opacity. */
function rimOf(c: CanvasRenderingContext2D) {
  if (!rims) return c;
  rims.globalAlpha = c.globalAlpha;
  return rims;
}

/** Struck buildings flash pale for a moment; hurt houses and walls darken,
 * and other hurt structures wear a health bar. */
export function drawDamage(b: Brush, sim: DefendSim) {
  drawStrikes(b, sim);
  drawHurt(b, sim);
}

function drawStrikes({ c, px }: Brush, sim: DefendSim) {
  for (const bd of sim.map.buildings) {
    const f = sim.flash[bd.id];
    if (f <= 0 || !sim.intact(bd)) continue;
    const r = bd.rect;
    if (bd.kind === "keep") {
      const x = Math.round(r.x * px), y = Math.round(r.y * px);
      paintKeepFlash(c, { x, y, w: Math.round((r.x + r.w) * px) - x, h: Math.round((r.y + r.h) * px) - y, px }, (f / BUILDING_FLASH) * .55);
      continue;
    }
    c.fillStyle = `rgba(255,244,220,${(f / BUILDING_FLASH) * 0.55})`;
    c.fillRect(r.x * px, r.y * px, r.w * px, r.h * px);
  }
}

function drawHurt(b: Brush, sim: DefendSim) {
  for (const bd of sim.map.buildings) {
    const hp = sim.hp[bd.id],
      max = sim.maxHp[bd.id];
    // Houses and walls show their hurt only in their art's damage stages.
    if (!sim.intact(bd) || hp >= max || bd.kind === "keep" || bd.kind === "house" || bd.kind === "wall" || bd.kind === "gate") continue;
    healthBar(b, bd, hp / max);
  }
}

function healthBar({ c, px }: Brush, bd: Building, frac: number) {
  const r = bd.rect;
  const bw = r.w * px,
    bh = Math.max(2, px * 0.22);
  c.fillStyle = "rgba(0,0,0,0.7)";
  c.fillRect(r.x * px, r.y * px - bh - 1, bw, bh);
  c.fillStyle = frac > 0.5 ? "#8fcf6a" : frac > 0.25 ? "#e3b14c" : "#d9635a";
  c.fillRect(r.x * px, r.y * px - bh - 1, bw * frac, bh);
}

/** How brightly a torch at (x, y) still burns, 0 (out) to 1. */
export type Burning = (x: number, y: number, id: number) => number;

/** Draw enemies, or your troops, as plain squares (`simple-units.ts`). */
export type Simple = { enemies?: boolean; troops?: boolean; reduceMotion?: boolean; merged?: boolean; effects?: boolean };

/** An enemy's contour: burning noise for the Dark One's, gold while a watch tower
 * marks it, violet for the brood, black for the rest. */
function enemyInk(e: Enemy) {
  if (ENEMIES[e.kind].faction === "darkOne" || ENEMIES[e.kind].portalOutline) return PORTAL_UNIT_INK;
  if (e.marked) return MARKED_UNIT_INK;
  if (e.kind === "mother" || e.kind === "broodling") return BROOD_UNIT_INK;
  return NEUTRAL_UNIT_INK;
}

/** Units, projectiles and effects. With `torches`, units carry a torch,
 * lit while it still burns. */
export function drawUnits(b: Brush, sim: DefendSim, torches: Burning | null, healthbars = false, timing?: { entityMs: number }, simple: Simple = {}, outline?: UnitOutline, sides?: UnitInks, contours?: { defer?: boolean }) {
  // Track the wave peak even when the setting is off.
  if (!healthbars) trackHealthbarPeak(sim);
  drawFortressRubble(b, sim);
  for (const e of sim.enemies) drawWormShadow(b, e, sim.time, simple.effects !== false, simple.reduceMotion);
  drawBlackHoles(b, sim);
  drawPoisonClouds(b, sim);
  drawWatchRadii(b, sim);
  const start = timing ? performance.now() : 0;
  // With `outline`, the units go into its layer and their outlines under
  // them all; fliers' shadows and shields stay on the board beneath.
  const minimumAlpha = new Map<number, number>();
  if (contours) {
    outline ??= new UnitOutline();
    const inks = new Map<number, string>();
    for (const unit of sim.soldiers) {
      inks.set(unit.id, sides?.ink(unit.id) ?? (unit.raidEnemy ? DARK_UNIT_INK : PLAYER_UNIT_INK));
      if (unit.kind === "shade") minimumAlpha.set(unit.id, .5);
      else if (unit.cloak === 0 || unit.risen || unit.called) minimumAlpha.set(unit.id, .15);
    }
    // Every other unit gets a contour too, in the ink its old baked rim had:
    // no unit keeps a full-art-pixel rim of its own.
    for (const enemy of sim.enemies) if (!enemy.raidProxy) inks.set(enemy.id, enemyInk(enemy));
    for (const person of sim.civilians) inks.set(person.id, NEUTRAL_UNIT_INK);
    sides = { ink: id => inks.get(id) };
  }
  const layers = outline?.begin(b.c, !sides || simple.merged !== false, contours ? b.px / ART * UNIT_CONTOUR_ART_PIXELS : undefined);
  const u: Brush = layers ? { c: layers.units, px: b.px } : b;
  let swords: ReturnType<typeof drawSoldiers> = [];
  rims = layers?.rims ?? null;
  const unit = sides && outline ? (id: number) => { rims = outline.ink(sides.ink(id), minimumAlpha.get(id)); } : undefined;
  const rimFor = sides && outline ? (color: string) => outline.ink(color) : undefined;
  try {
    if (!sides) for(const soldier of sim.soldiers)if(soldier.raidEnemy){u.c.save();u.c.strokeStyle='#d66e58';u.c.lineWidth=Math.max(1,b.px*.12);u.c.beginPath();u.c.ellipse(soldier.x*b.px,soldier.y*b.px,b.px*.5,b.px*.25,0,0,Math.PI*2);u.c.stroke();u.c.restore();}
    drawCivilians(u, sim, torches, unit);
    if (simple.troops) {
      const troops = sim.soldiers.filter(o => !garrisoned(o));
      if (contours) {
        const groups = new Map<string | undefined, Soldier[]>();
        for (const troop of troops) { const ink = sides!.ink(troop.id); const group = groups.get(ink); if (group) group.push(troop); else groups.set(ink, [troop]); }
        for (const [ink, group] of groups) drawSimpleTroops(u, group, outline!.ink(ink), sides);
      }
      else if (sides && simple.merged === false) for (const soldier of troops) { unit?.(soldier.id); drawSimpleTroops(u, [soldier], rims ?? undefined, sides); }
      else drawSimpleTroops(u, troops, layers?.rims, sides, rimFor);
    } else swords = drawSoldiers(u, sim, torches, simple.reduceMotion, unit, sides);
    if (contours) {
      const groups = new Map<string | undefined, Enemy[]>();
      for (const enemy of sim.enemies) if (!enemy.raidProxy && wormBodyVisible(enemy)) { const ink = sides!.ink(enemy.id); const group = groups.get(ink); if (group) group.push(enemy); else groups.set(ink, [enemy]); }
      for (const [ink, group] of groups) {
        const rim = outline!.ink(ink);
        const pixels = group.filter(e => ENEMIES[e.kind].darkPixels);
        if (pixels.length) {
          outline!.mergePixelGaps();
          drawDarklingBodies(u, pixels, !simple.enemies);
          outline!.mergePixelGaps(false);
        }
        const others = group.filter(e => !ENEMIES[e.kind].darkPixels);
        if (simple.enemies) drawSimpleEnemies(u, others, rim, sides);
      }
      // Preserve native sprite ordering across factions, after the pixel mass.
      if (!simple.enemies) for (const e of sim.enemies) if (!e.raidProxy && wormBodyVisible(e) && !ENEMIES[e.kind].darkPixels) { unit?.(e.id); drawEnemyArt(u, e, sim, layers ? b : undefined, simple.reduceMotion); }
    }
    else if (simple.enemies) drawSimpleEnemies(u, sim.enemies.filter(e=>!e.raidProxy && wormBodyVisible(e)), layers?.rims, sides, rimFor);
    else {
      for (const e of sim.enemies) if (!e.raidProxy && wormBodyVisible(e)) { unit?.(e.id); drawEnemyArt(u, e, sim, layers ? b : undefined, simple.reduceMotion); }
    }
    if (contours) drawSwords(u, swords, unit);
  } finally {
    rims = null;
  }
  outline?.end(b.c, contours?.defer);
  if (!contours) drawSwords(b, swords);
  drawGarrisons(b, sim, sides);
  if (timing) timing.entityMs += performance.now() - start;
  drawChrono(b.c,b.px,sim,simple.reduceMotion);
  drawArrows(b.c, b.px, sim, simple.reduceMotion);
  drawWisps(b.c, b.px, sim, simple.reduceMotion);
  drawLasers(b.c, b.px, sim);
  drawShells(b.c, b.px, sim);
  drawSiegeShots(b, sim);
  drawBlightLasers(b, sim);
  drawFireballs(b.c, b.px, sim, simple.reduceMotion);
  drawMageBolts(b.c, b.px, sim, simple.reduceMotion);
  drawStabs(b.c, b.px, sim);
  drawSwings(b.c, b.px, sim);
  drawBlades(b.c, b.px, sim);
  drawNano(b.c, b.px, sim);
  drawRaisings(b.c, b.px, sim);
  for (const fx of sim.effects) drawEffect(b, fx);
  drawImpacts(b.c, b.px, sim);
  drawMeteors(b.c, b.px, sim);
  drawFrostBursts(b.c, b.px, sim);
  drawStaggered(b.c, b.px, sim);
  drawDrops(b.c, b.px, sim, simple.reduceMotion, !simple.troops);
  if (healthbars) drawEnemyHealthbars(b, sim);
}

/** Watch-tower radii, very faint. */
function drawWatchRadii({ c, px }: Brush, sim: DefendSim) {
  c.strokeStyle = "rgba(242,210,122,0.16)";
  c.lineWidth = Math.max(1, px * 0.08);
  for (const bd of sim.map.buildings) {
    if (bd.kind !== "watchTower" || !sim.intact(bd)) continue;
    const p = center(bd.rect);
    c.beginPath();
    c.arc(p.x * px, p.y * px, watchRadius(sim.levels.watchRadius) * px, 0, Math.PI * 2);
    c.stroke();
  }
}

/** Civilians, with a flicker of gold over those at work. */
function drawCivilians(b: Brush, sim: DefendSim, torches: Burning | null, unit?: (id: number) => void) {
  const { c, px } = b;
  for (const u of sim.civilians) {
    unit?.(u.id);
    const s = Math.max(2, CIVILIAN.size * px);
    if (!(u.flash <= 0 && drawPixel(c, "civilian", u.x * px - s / 2, u.y * px - s / 2, s))) {
      c.fillStyle = u.flash > 0 ? "#fff" : CIVILIAN.color;
      drawSprite(c,basicUnitSprite("civilian",false,u.flash>0),u.x * px - s / 2,u.y * px - s / 2,s,s);
    }
    if (u.state === "flee") {
      const dot = Math.max(1, px * .07);
      c.fillStyle = "#f2d27a";
      c.fillRect(u.x * px - dot / 2, u.y * px - s / 2 - dot * 5, dot, dot * 3);
      c.fillRect(u.x * px - dot / 2, u.y * px - s / 2 - dot, dot, dot);
    }
    if (torches) drawHandTorch(b, { x: u.x + CIVILIAN.size * 0.6, y: u.y - CIVILIAN.size * 0.4, id: u.id }, sim.time, torches(u.x, u.y, u.id));
    if (u.state === "working" && Math.floor(sim.time * 6) % 2) {
      if (u.jobKind === "sand") {
        c.fillStyle = "#b8874c";
        c.fillRect(u.x * px + s / 2, u.y * px - s / 2, Math.max(1, s / 4), s * 1.4);
        c.fillStyle = "#d8ba71";
        c.fillRect(u.x * px + s / 4, u.y * px + s / 2, Math.max(2, s), Math.max(1, s / 3));
        continue;
      }
      c.fillStyle = "#f2d27a";
      c.fillRect(u.x * px + s / 2, u.y * px - s, Math.max(1, s / 2), Math.max(1, s / 2));
    }
  }
}

/** Swordsmen and archers (who carry a little bow on the off side), the
 * fire mages (`mage-art.ts`, lit by the flame in their hand, not a torch)
 * the valkyries (`valkyrie-art.ts`, lit by their own gold), the dark
 * wizard (`dark-art.ts`, lit by his ruby), the Hero (`hero-art.ts`) and the
 * shade (`shade-art.ts`).
 * Returns the swordsmen's swings, whose swords and trails draw over the
 * enemies. */
function drawSoldiers(b: Brush, sim: DefendSim, torches: Burning | null, reduced = false, unit?: (id: number) => void, sides?: UnitInks) {
  const { c, px } = b;
  const swords: { x: number; y: number; swing: Swing; ink?: string; id?: number }[] = [];
  for (const u of sim.soldiers) {
    // Up in a watch tower: a badge over it instead (`garrison-icons.ts`).
    if (garrisoned(u)) continue;
    unit?.(u.id);
    if (u.kind === "flagBearer") {
      const a=px/8;
      c.fillStyle="#c5a46d";c.fillRect(u.x*px-a,u.y*px-3*a,2*a,3*a);
      c.fillStyle="#eed7ac";c.fillRect(u.x*px-a,u.y*px-4*a,2*a,a);
      continue;
    }
    if (u.kind === "mage") {
      drawMage(c, px, u, sim.time, sim, reduced);
      continue;
    }
    if (u.kind === "valkyrie") {
      drawMeleeCape(c, px, u, sim, reduced);
      drawValkyrie(c, px, u, sim);
      continue;
    }
    if (u.kind === "darkWizard") {
      drawDarkWizard(c, px, u, sim);
      continue;
    }
    if (u.kind === "hero") {
      drawHero(c, px, u, sim);
      continue;
    }
    if (u.kind === "shade") {
      drawShade(c, px, u, sim, sides?.ink(u.id), sides ? rimOf(c) : undefined);
      continue;
    }
    if (u.risen) {
      drawMeleeCape(c, px, u, sim, reduced);
      drawRisen(c, px, u, isMelee(u) ? meleeFacing(sim,u).direction : "south");
      continue;
    }
    if (u.called) {
      drawMeleeCape(c, px, u, sim, reduced);
      drawCalled(c, px, u, isMelee(u) ? meleeFacing(sim,u).direction : "south");
      continue;
    }
    if (isGuildTroop(u.kind)) {
      drawGuildTroop(b, sim, u, reduced);
      if (torches && u.cloak !== 0) drawHandTorch(b, { x: u.x + SOLDIER.size * 0.65, y: u.y - SOLDIER.size * 0.45, id: u.id }, sim.time, torches(u.x, u.y, u.id));
      continue;
    }
    const archer = u.kind === "archer";
    const heading = archer ? null : meleeFacing(sim,u);
    const swing = archer ? null : swingOf(sim, u);
    const x = u.x + (swing?.dx ?? 0),
      y = u.y + (swing?.dy ?? 0);
    const s = Math.max(2, (archer ? ARCHER_UNIT.size : SOLDIER.size) * px);
    if (!archer) drawMeleeCape(c, px, u, sim, reduced, x, y);
    if (u.flash <= 0 && drawPixel(c, archer ? "archer" : "swordsman", x * px - s / 2, y * px - s / 2, s)) {
      if (swing) swords.push({ x, y, swing, id: u.id, ...(sides ? { ink: sides.ink(u.id) } : {}) });
      if (torches) drawHandTorch(b, { x: x + SOLDIER.size * 0.65, y: y - SOLDIER.size * 0.45, id: u.id }, sim.time, torches(u.x, u.y, u.id));
      continue;
    }

    c.fillStyle = u.flash > 0 ? "#fff" : archer ? ARCHER_UNIT.color : SOLDIER.color;
    drawSprite(c, basicUnitSprite(archer ? "archer" : "sword", false, u.flash > 0), x * px - s / 2, y * px - s / 2, s, s);
    if (heading) faceMark(c,x*px,y*px,s,Math.cos(heading.angle),Math.sin(heading.angle),"#c2ccd0");
    if (archer) {
      c.fillStyle = "#b58a4f";
      c.fillRect(x * px - s / 2 - Math.max(1, s * 0.3), y * px - s / 2, Math.max(1, s * 0.2), s);
    }
    if (swing) swords.push({ x, y, swing, id: u.id, ...(sides ? { ink: sides.ink(u.id) } : {}) });
    if (torches) drawHandTorch(b, { x: x + SOLDIER.size * 0.65, y: y - SOLDIER.size * 0.45, id: u.id }, sim.time, torches(u.x, u.y, u.id));
  }
  return swords;
}

/** The guilds' troops, square bodies in a black outline like the
 * swordsmen's: a brawler in a tan jerkin jabbing a fist at whatever it
 * punches; a stone thrower in sackcloth with a stone in hand; a sniper in
 * green with a long rifle (a Revolutionary's in navy, its scope glowing); a musketman in red-brown with a short musket and
 * a glowing match; a gunner in slate with a pistol; a machine gunner in
 * olive behind a stocky gun; a Gatling gunner hauling a thick brass gun
 * whose barrels flicker as they turn; a rocketeer with a tube on its
 * shoulder, its rocket's red tip showing while loaded; an assassin in black with a dagger it stabs with, a
 * faint shimmer while cloaked; a spearman in buff with a long spear it
 * thrusts; a hoplite in red behind a round bronze shield; a javelineer in
 * olive with a javelin raised while one is ready; a lancer in blue on a
 * brown horse, its lance couched along the way it rides. */
function faceMark(c: CanvasRenderingContext2D,x:number,y:number,s:number,fx:number,fy:number,color:string) {
  const p=Math.max(1,Math.round(s*.23));
  c.fillStyle=color;
  c.fillRect(Math.round(x+fx*s*.35-p/2),Math.round(y+fy*s*.35-p/2),p,p);
}

function drawGuildTroop(b: Brush, sim: DefendSim, u: Soldier, reduced = false) {
  const { c, px } = b;
  const k = u.kind as keyof typeof GUILD_TROOPS;
  const def = GUILD_TROOPS[k], s = Math.max(2, def.size * px), unit = Math.max(1, Math.round(s * 0.22));
  // Snipers turn their rifles along their lasers.
  const heading = isMelee(u) ? meleeFacing(sim,u) : null;
  const e = heading ? undefined : k === "sniper" || k === "railSniper" ? sniperAim(sim, u) : sim.enemies.find((o) => o.id === u.target);
  let fx = 0, fy = -1;
  if (heading) { fx=Math.cos(heading.angle); fy=Math.sin(heading.angle); }
  else if (e) {
    const d = Math.hypot(e.x - u.x, e.y - u.y) || 1;
    fx = (e.x - u.x) / d;
    fy = (e.y - u.y) / d;
  }
  // A brawler leans into a punch (an assassin into a stab) for a moment after each one lands.
  const since = def.cooldown - u.cd, thrusts = k === "brawler" || k === "assassin" || k === "spearman" || k === "hoplite" || k === "lancer";
  const punch = thrusts && since >= 0 && since < 0.16 ? Math.sin((since / 0.16) * Math.PI) : 0;
  const veiled = u.cloak === 0;
  if (veiled) c.globalAlpha = 0.3 + 0.1 * Math.sin(sim.time * 4 + u.id);
  const x = (u.x + fx * punch * 0.12) * px, y = (u.y + fy * punch * 0.12) * px;
  if (k === "lancer") horse(c, x, y, fx, fy, s, unit, u.flash > 0);
  drawMeleeCape(c, px, u, sim, reduced, x / px, y / px);

  c.fillStyle = u.flash > 0 ? "#fff" : def.color;
  drawSprite(c, basicUnitSprite(k, false, u.flash > 0), Math.round(x - s / 2), Math.round(y - s / 2), Math.round(s), Math.round(s));
  // A lit upper left, like the city's art.
  c.fillStyle = "rgba(255,255,255,0.22)";
  c.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), Math.round(s), unit);
  if (heading) faceMark(c,x,y,s,fx,fy,k === "brawler" ? "#e8b88a" : k === "assassin" ? "#a391b3" : "#c2ccd0");
  if (k === "assassin") {
    // A hood's lit rim, and the dagger thrust at the target.
    const reach = s * (0.5 + punch * 0.6), w = Math.max(1, unit);
    line(c, x + fx * s * 0.3, y + fy * s * 0.3, x + fx * (s * 0.3 + reach), y + fy * (s * 0.3 + reach), w, "#d8dce6");
    c.globalAlpha = 1;
    return;
  }
  if (k === "spearman" || k === "hoplite" || k === "lancer") {
    // The spear along the facing, thrust out with each blow: a spearman's
    // long, a hoplite's short over its shield, a lancer's couched lance.
    const [slen, tip] = k === "spearman" ? [1.7, "#c9ccd4"] : k === "hoplite" ? [1.15, "#c9a24e"] : [1.9, "#e8e4da"];
    const w = Math.max(1, Math.round(unit * 0.8)), len = s * (slen + punch * 0.35);
    const ox = x + fy * s * 0.35 - fx * s * 0.3, oy = y - fx * s * 0.35 - fy * s * 0.3;
    line(c, ox, oy, ox + fx * len, oy + fy * len, w, k === "lancer" ? "#d8d0bc" : "#8e6238");

    c.fillStyle = tip;
    dot(c, ox + fx * len, oy + fy * len, w);
    if (k === "lancer") {
      // A pennant under the lance's point.
      c.fillStyle = "#d8553f";
      dot(c, ox + fx * len * 0.75 - fy * w, oy + fy * len * 0.75 + fx * w, w);
    }
    if (k === "hoplite") {
      // The round bronze shield on its off side, a boss at its heart.
      const sx = x - fy * s * 0.5 + fx * s * 0.25, sy = y + fx * s * 0.5 + fy * s * 0.25, d = Math.max(3, Math.round(s * 0.62));
      round(c, sx, sy, d, "#b08a3e");
      c.fillStyle = "#e9c46a";
      c.fillRect(Math.round(sx - d / 2) + 1, Math.round(sy - d / 2) + 1, Math.max(1, Math.round(d / 3)), Math.max(1, Math.round(d / 3)));
      c.fillStyle = "#7a3a2a";
      dot(c, sx, sy, Math.max(1, Math.round(d / 4)));
    }
    return;
  }
  if (k === "javelineer") {
    // A javelin raised overhead while one is ready to throw.
    if (u.cd < JAVELINEER.cooldown * 0.5) {
      const w = Math.max(1, Math.round(unit * 0.8)), len = s * 1.3;
      const ox = x + s * 0.45 - fx * len * 0.4, oy = y - s * 0.35 - fy * len * 0.4;
      line(c, ox, oy, ox + fx * len, oy + fy * len, w, "#8e6238");
      c.fillStyle = "#c9ccd4";
      dot(c, ox + fx * len, oy + fy * len, w);
    }
    return;
  }
  if (k === "brawler") {
    // Fists: one held up, one thrown at the target.
    const reach = s * (0.55 + punch * 0.45);

    c.fillStyle = "#e8b88a";
    dot(c, x + fx * reach, y + fy * reach, unit);

    c.fillStyle = "#e8b88a";
    dot(c, x + fy*s*0.55-fx*s*0.1, y - fx*s*0.55-fy*s*0.1, unit);
    return;
  }
  if (k === "slinger") {

    c.fillStyle = "#b8b2a6";
    dot(c, x + s * 0.6, y - s * 0.3, unit);
    return;
  }
  // A gun along the facing: a sniper's long, a musket's short and stout,
  // a pistol's stubby, a Gatling's and a rocket tube's thick.
  const GUN = { sniper: [1.5, 0.8, "#3a3a40"], musketeer: [0.95, 1.2, "#5a3d22"], gunner: [0.55, 0.9, "#4a4a52"], machineGunner: [1.05, 1.2, "#2e3430"],
    gatlingGunner: [1.15, 1.9, "#b08a3e"], rocketeer: [1.05, 1.7, "#4a5a3a"], railSniper: [1.75, 0.9, "#8aa4b8"] } as const;
  const [glen, gw, gcol] = GUN[k as keyof typeof GUN];
  const len = s * glen, w = Math.max(1, Math.round(unit * gw));
  const ox = x - fy * s * 0.35, oy = y + fx * s * 0.35;
  line(c, ox, oy, ox + fx * len, oy + fy * len, w, gcol);
  if (k === "gatlingGunner") {
    // The barrels turning: a dark band sliding along the brass.
    const at = 0.35 + 0.5 * ((sim.time * 9 + u.id * 0.37) % 1);
    c.fillStyle = "#3a2a14";
    dot(c, ox + fx * len * at, oy + fy * len * at, Math.max(1, w - 1));
    return;
  }
  if (k === "rocketeer") {
    // The rocket's red tip at the mouth while it is loaded.
    if (u.cd < ROCKETEER.cooldown * 0.6) {
      c.fillStyle = "#d8553f";
      dot(c, ox + fx * len, oy + fy * len, Math.max(1, w - 1));
    }
    return;
  }
  if (k === "musketeer" && hallPaths(sim, u.home).bayonet) {
    // A fixed bayonet past the muzzle.
    const tip = len + s * 0.4;
    line(c, ox + fx * len, oy + fy * len, ox + fx * tip, oy + fy * tip, Math.max(1, w - 1), "#d8dce6");
  }
  if (k === "musketeer") {
    // The slow match, glowing.
    c.fillStyle = (sim.time * 3 + u.id) % 1 < 0.5 ? "#ffd060" : "#ff7a2e";
    dot(c, ox - fx * s * 0.2, oy - fy * s * 0.2, unit);
  } else {
    // The scope: brass, or a Revolutionary's glowing cyan lens.
    c.fillStyle = k === "railSniper" ? "#6ff2ff" : "#e0c070";
    dot(c, ox + fx * len * 0.3, oy + fy * len * 0.3, unit);
  }
}
/** A `d`-pixel square about (x, y) with its corners cut, a pixel-art disc. */
function round(c: CanvasRenderingContext2D, x: number, y: number, d: number, color: string) {
  const x0 = Math.round(x - d / 2), y0 = Math.round(y - d / 2), cut = Math.max(1, Math.round(d / 4));
  c.fillStyle = color;
  c.fillRect(x0 + cut, y0, d - cut * 2, d);
  c.fillRect(x0, y0 + cut, d, d - cut * 2);
  if (d > 4) c.fillRect(x0 + 1, y0 + 1, d - 2, d - 2);
}

/** A stroke from (x0, y0) to (x1, y1), `w` pixels wide, in the black outline. */
function line(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, color: string) {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.strokeStyle = color;
  c.lineWidth = w;
  c.stroke();
}

/** A lancer's horse under its rider: a long brown body along the way it
 * rides, its head out in front and its tail behind. */
function horse(c: CanvasRenderingContext2D, x: number, y: number, fx: number, fy: number, s: number, unit: number, white: boolean) {
  const body = "#6e4a26", w = Math.max(2, Math.round(s * 0.9));
  line(c, x - fx * s, y - fy * s, x + fx * s * 0.7, y + fy * s * 0.7, w, white ? "#fff" : body);
  line(c, x + fx * s * 0.7, y + fy * s * 0.7, x + fx * s * 1.25, y + fy * s * 1.25, Math.max(1, Math.round(w * 0.55)), white ? "#fff" : "#8c6232");
  c.fillStyle = "#2a1c10";
  dot(c, x - fx * s * 1.25, y - fy * s * 1.25, Math.max(1, unit + 1));
}

const GUILD_TROOPS = {
  spearman: SPEARMAN,
  hoplite: HOPLITE,
  javelineer: JAVELINEER,
  lancer: LANCER,
  assassin: ASSASSIN_UNIT,
  brawler: BRAWLER,
  slinger: SLINGER,
  sniper: SNIPER,
  musketeer: MUSKETEER,
  gunner: GUNNER,
  machineGunner: MACHINE_GUNNER,
  gatlingGunner: GATLING_GUNNER,
  railSniper: RAIL_SNIPER,
  rocketeer: ROCKETEER,
};
const isGuildTroop = (k: string): k is keyof typeof GUILD_TROOPS => k in GUILD_TROOPS;

/** Each sword and its swing's trail, over whoever it is cutting. */
function drawSwords(b: Brush, swords: { x: number; y: number; swing: Swing; ink?: string; id?: number }[], unit?: (id: number) => void) {
  for (const { x, y, swing, ink, id } of swords) {
    if (id !== undefined) unit?.(id);
    drawSwordTrail(b, x, y, swing);
    drawSword(b, x, y, swing.blade, swing.k < 1 ? 1 : 0.8, ink);
  }
}

// ── Sword swings ───────────────────────────────────────────────────────────
// Presentation only: a strike resets the swordsman's cooldown, so the time
// since it is `SOLDIER.cooldown - cd`, and nothing new enters the sim state.

/** Seconds a swing sweeps its half circle, and its trail's fade after. */
const SWING = 0.22,
  TRAIL_FADE = 0.16;
/** How far a swordsman steps into a swing, in cells, and the blade's reach
 * beyond its body. */
const LUNGE = 0.16,
  BLADE = 0.5;
/** Where a swordsman's sword rests between swings: raised on the off side. */
const REST = -Math.PI * 0.6;
const TAU = Math.PI * 2;

/** What the renderer remembers of each swordsman between frames: the way
 * it last faced, the time into its last swing (a drop means a new one), and
 * which way that swing sweeps (they alternate, forehand and back). */
type SwingMemory = { face: number; t: number; side: 1 | -1 };
const swings = new WeakMap<object, SwingMemory>();

type Swing = {
  /** Lunge offset, in cells. */
  dx: number;
  dy: number;
  /** The blade's angle now, and where this swing began. */
  blade: number;
  from: number;
  /** Where the sweep ends: the trail's head, while the blade goes home. */
  end: number;
  /** How far through the sweep, 0 to 1 (past 1 while the trail fades). */
  k: number;
};

function swingOf(sim: DefendSim, u: Soldier): Swing {
  let m = swings.get(u);
  if (!m) swings.set(u, (m = { face: REST + Math.PI / 2, t: Infinity, side: 1 }));
  m.face = meleeFacing(sim,u).angle;
  const t = SOLDIER.cooldown - u.cd;
  if (t < m.t) m.side = m.side === 1 ? -1 : 1;
  m.t = t;
  if (!(t >= 0 && t < SWING + TRAIL_FADE)) {
    const rest=m.face+Math.PI*.3;
    return { dx: 0, dy: 0, blade: rest, from: rest, end: rest, k: 2 };
  }
  const k = t / SWING;
  const eased = k >= 1 ? 1 : 1 - (1 - k) * (1 - k);
  const from = m.face - (m.side * Math.PI) / 2;
  const lunge = k < 1 ? LUNGE * Math.sin(Math.PI * Math.sqrt(k)) : 0;
  const end = from + m.side * Math.PI * eased;
  // Once the sweep ends, the sword eases back to rest while the trail fades.
  const back = k < 1 ? 0 : (t - SWING) / TRAIL_FADE;
  const rest=m.face+Math.PI*.3;
  const home = end + ((((rest - end) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
  return { dx: Math.cos(m.face) * lunge, dy: Math.sin(m.face) * lunge, blade: end + (home - end) * back * back, from, end, k };
}

/** A pixel square of side `d` centred on (x, y) in canvas pixels. */
function dot(c: CanvasRenderingContext2D, x: number, y: number, d: number) {
  c.fillRect(Math.round(x - d / 2), Math.round(y - d / 2), d, d);
}

/** The small sword, hilt at the body's edge, pointing along `angle`. */
function drawSword({ c, px }: Brush, x: number, y: number, angle: number, reach: number, ink?: string) {
  const d = Math.max(1, Math.round(px * 0.07));
  const ux = Math.cos(angle),
    uy = Math.sin(angle);
  const r0 = SOLDIER.size * 0.5,
    r1 = r0 + BLADE * reach;
  c.fillStyle = "#dfe6ee";
  for (let r = r0 + 0.08; r <= r1; r += d / px) dot(c, (x + ux * r) * px, (y + uy * r) * px, d);
  // The crossguard and grip in brass.
  c.fillStyle = "#c9a14a";
  const g = r0 + 0.06;
  dot(c, (x + ux * g - uy * 0.07) * px, (y + uy * g + ux * 0.07) * px, d);
  dot(c, (x + ux * g + uy * 0.07) * px, (y + uy * g - ux * 0.07) * px, d);
  dot(c, (x + ux * r0) * px, (y + uy * r0) * px, d);
}

/** The swing's trail: a pale crescent of pixels behind the blade's tip,
 * brightest at the blade and fading toward where the swing began, then
 * fading out altogether once the sweep ends. */
function drawSwordTrail({ c, px }: Brush, x: number, y: number, sw: Swing) {
  if (sw.k > 1 + TRAIL_FADE / SWING) return;
  const fade = sw.k <= 1 ? 1 : 1 - ((sw.k - 1) * SWING) / TRAIL_FADE;
  const span = sw.end - sw.from;
  if (Math.abs(span) < 0.05) return;
  const d = Math.max(1, Math.round(px * 0.07));
  const outer = SOLDIER.size * 0.5 + BLADE;
  const steps = Math.max(6, Math.ceil((Math.abs(span) * outer * px) / d));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps; // 0 where the swing began, 1 at the blade
    const a = sw.from + span * f;
    const ux = Math.cos(a),
      uy = Math.sin(a);
    // The crescent thickens toward the blade.
    const rows = 1 + Math.round(f * 2);
    for (let row = 0; row < rows; row++) {
      const r = outer - (row * d) / px;
      c.globalAlpha = fade * f * f * (row ? 0.45 : 0.85);
      c.fillStyle = row ? "#9fc8ff" : "#eef6ff";
      dot(c, (x + ux * r) * px, (y + uy * r) * px, d);
    }
  }
  c.globalAlpha = 1;
}

/** A unit's hand torch, held at `at`: the stick, and while it `burns` a
 * flickering pixel or two of flame. */
function drawHandTorch({ c, px }: Brush, at: { x: number; y: number; id: number }, t: number, burns: number) {
  const s = Math.max(1, px * 0.14);
  const f = Math.sin(t * 17 + at.id * 1.7) * 0.5 + 0.5;
  c.fillStyle = "#5a3b1e";
  c.fillRect(at.x * px - s / 2, at.y * px, s, s * 1.6);
  if (burns <= 0) return;
  c.globalAlpha = burns;
  c.fillStyle = f > 0.5 ? "#ffe6a8" : "#ffb35c";
  c.fillRect(at.x * px - s / 2, at.y * px - s * (1 + f * 0.5), s, s * (1 + f * 0.5));
  c.globalAlpha = 1;
}

/** One enemy as the battle draws it: a siege engine, a boat or a body.
 * The journal's portraits draw through it too, with a stand-in sim that
 * has only `time` and `effects`. */
export function drawEnemyArt(b: Brush, e: Enemy, sim: DefendSim, under = b, reduceMotion = false) {
  const def = ENEMIES[e.kind];
  if (!wormBodyVisible(e)) { drawWormShadow(under, e, sim.time); return; }
  if (def.fortress && !def.blightFortress) return drawFortress(b, e, sim, reduceMotion);
  if (def.blightFortress) return drawBlightFortress(b, e, sim.time, reduceMotion);
  if (isBlightFlier(e.kind)) return drawBlightFlier(b, e, sim.time, reduceMotion, under);
  if (def.darkPixels) {
    // No sprite lookup, rims, shading, torch, or animated decoration.
    const d = b.px / ART * def.darkPixels;
    drawSprite(b.c, basicUnitSprite(e.kind,true),e.x * b.px - d / 2,e.y * b.px - d / 2,d,d);
  }
  else if (def.siege) drawSiegeEngine(b, e, sim.time);
  else if (def.boat) drawBoat(b, e, sim.time, reduceMotion);
  else drawEnemy(b, e, sim, under);
}

/** An assassin's venom on an enemy: green drops oozing off it, one a pixel
 * of art, timed by battle time. */
function drawVenom({ c, px }: Brush, e: Enemy, at: { x: number; y: number; s: number }, t: number) {
  const dot = Math.max(1, Math.round(px / 8));
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.9 + i / 3 + e.id * 0.37) % 1;
    c.fillStyle = k < 0.5 ? "#9be04a" : "#4e8a22";
    c.fillRect(Math.round(at.x + (at.s * (i + 0.5)) / 3), Math.round(at.y + at.s * 0.3 + k * at.s * 0.9), dot, dot);
  }
}

/** Enemies: tiny squares, gold-outlined when marked, with a shadow under
 * fliers; bosses get a dark rim, a crown and a health bar; a Mother and her
 * brood are black with a violet rim, so they show against the night. */
function drawEnemy(b: Brush, e: Enemy, sim: DefendSim, under: Brush) {
  const { c, px } = b;
  const def = ENEMIES[e.kind];
  if (def.fortress) { drawFortress(b, e, sim); return; }
  if (e.kind === "iceGolem" || e.kind === "iceCube") { drawIceEnemy(b, e); return; }
  const s = Math.max(zoneEnemyRows(e.kind) ? 3 : 2, Math.round(enemySize(e) * px));
  const x = Math.round(e.x * px - s / 2),
    y = Math.round(e.y * px - s / 2 - (e.kind === "bombBird" ? (e.dive === undefined ? 1 : Math.max(0, e.dive / 0.6)) * px * 1.5 : 0));
  if (def.flying) {
    under.c.fillStyle = "rgba(0,0,0,0.35)";
    under.c.fillRect(x + px * 0.2, y + px * 0.35, s, s);
  }
  const pixel = e.flash <= 0 ? enemySprite(e.kind) : undefined;
  if (!(pixel && drawPixel(c, pixel, x, y, s)) && !drawZoneEnemyBody(b, e, x, y, s)) {
    c.fillStyle = e.flash > 0 ? "#fff" : def.color;
    drawSprite(c, basicUnitSprite(e.kind, true, e.flash > 0), x, y, s, s);
  }
  drawHostileMarks(b, e, { x, y, s });
  if (e.venom) drawVenom(b, e, { x, y, s }, sim.time);
  if (def.boss) drawBossMarks(b, e, { x, y, s });
  if (def.chainLength) {
    c.fillStyle = "#fff2ba";
    c.fillRect(x, y, Math.max(1, s / 3), Math.max(1, s / 3));
    if (e.kind === "dragon") {
      const flap = 0.5 + Math.sin(e.id + e.cd * 8) * 0.25;
      c.fillStyle = "#793254";
      c.fillRect(x - s * flap, y - s / 2, s * flap, s * 1.5);
      c.fillRect(x + s, y - s / 2, s * flap, s * 1.5);
    }
  }
  if (def.shield && (e.shieldHp ?? 0) > 0) {
    const c = under.c;
    c.save();
    c.fillStyle = e.shieldHp === Infinity ? "rgba(166,124,255,0.12)" : "rgba(72,173,255,0.12)";
    c.strokeStyle = e.shieldHp === Infinity ? "#c1a2ff" : "#72c5ff";
    c.lineWidth = Math.max(1, px * 0.06);
    c.beginPath(); c.arc(e.x * px, e.y * px, def.shield.radius * px, 0, Math.PI * 2); c.fill(); c.stroke();
    if (Number.isFinite(e.shieldHp)) {
      c.fillStyle = "#72c5ff";
      c.fillRect(x - s, y - 3, s * 3 * e.shieldHp! / def.shield.hp, 2);
    }
    c.restore();
  }
  drawBreath(c, px, e, sim.time);
  if (e.kind === "mother") drawMotherMarks(b, { x, y, s });
}

/** A Mother's pale eyes and the swollen brood sac on her back. */
function drawMotherMarks({ c }: Brush, sq: { x: number; y: number; s: number }) {
  const { x, y, s } = sq;
  const k = Math.max(1, Math.round(s / 6));
  c.fillStyle = "#3a2350";
  c.fillRect(x + k, y + s - k * 3, s - k * 2, k * 2);
  c.fillStyle = "#e4d6ff";
  c.fillRect(x + k, y + k, k, k);
  c.fillRect(x + s - k * 2, y + k, k, k);
}

/** A crown of spikes and a health bar, so the boss reads at a glance.
 * `sq` is its body square in canvas pixels. */
function drawBossMarks({ c, px }: Brush, e: Enemy, sq: { x: number; y: number; s: number }) {
  const { x, y, s } = sq;
  c.fillStyle = "#f2c94c";
  const k = Math.max(1, s / 5);
  for (let n = 0; n < 3; n++) c.fillRect(x + (n * (s - k)) / 2, y - k, k, k);

}

/** A blast, a puff of dust from a collapse, or sparks from a hit. */
function drawEffect(b: Brush, fx: Effect) {
  const { c, px } = b;
  const k = fx.t / 0.6;
  if (fx.kind === "boom") return drawExplosion(c, px, fx);
  if (fx.kind === "firework") return drawFirework(b, fx);
  if (fx.kind === "steam") return drawSteam(b, fx, k);
  if (fx.kind === "dust" && fx.seed !== undefined) {
    for (let n = 0; n < 22; n++) {
      const a = n * 2.4, spread = fx.r * (.25 + k * .85) * (.5 + hash01(fx.seed, n) * .5);
      const size = px * fx.r * (.12 + hash01(n, fx.seed) * .1) * (1 + k * .8);
      c.fillStyle = `rgba(158,145,125,${(1 - k) * .42})`;
      c.fillRect((fx.x + Math.cos(a) * spread) * px - size / 2, (fx.y + Math.sin(a) * spread) * px - size / 2, size, size);
    }
    return;
  }
  if (fx.kind === "dust") {
    c.fillStyle = `rgba(150,140,125,${0.45 * (1 - k)})`;
    c.beginPath();
    c.arc(fx.x * px, fx.y * px, fx.r * px * (0.6 + k * 0.6), 0, Math.PI * 2);
    c.fill();
    return;
  }
  drawSparks(c, px, fx);
}

/** A hiss of steam where fire or a blast met a magic boat's water: pale
 * pixel puffs rising and thinning. */
function drawSteam({ c, px }: Brush, fx: Effect, k: number) {
  const s = Math.max(1, Math.round(px / 8)) * 2;
  for (let n = 0; n < 7; n++) {
    const a = n * 2.4 + fx.x * 3.1, out = fx.r * (0.2 + 0.6 * k) * (0.5 + hash01(n, Math.round(fx.x * 64), Math.round(fx.y * 64)) * 0.5);
    const x = fx.x + Math.cos(a) * out, y = fx.y + Math.sin(a) * out * 0.7 - k * 0.7;
    c.fillStyle = `rgba(232,238,242,${(0.7 * (1 - k)).toFixed(3)})`;
    c.fillRect(Math.round(x * px - s / 2), Math.round(y * px - s / 2), s, s);
  }
}

// ── Scorches ──────────────────────────────────────────────────────────────

/** Branching cracks, glowing like cooling embers where a blast landed. */
export function drawScorches({ c, px }: Brush, sim: DefendSim) {
  drawScorchArt(c, px, sim.scorches);
}

/** Walking units' footprints for the lighting's shadow pass. */
export function shadowCasters(sim: DefendSim) {
  const def = (e: Enemy): EnemyDef => ENEMIES[e.kind];
  return [
    ...sim.soldiers.filter((u) => !garrisoned(u)).map((u) => ({ x: u.x, y: u.y, size: u.kind === "archer" ? ARCHER_UNIT.size : u.kind === "mage" ? FIRE_MAGE.size : u.kind === "valkyrie" ? VALKYRIE.size : u.kind === "darkWizard" ? DARK_WIZARD.size : isGuildTroop(u.kind) ? GUILD_TROOPS[u.kind].size : u.risen ? u.risen.size : u.called ? u.called.size : SOLDIER.size })),
    ...sim.civilians.map((u) => ({ x: u.x, y: u.y, size: CIVILIAN.size })),
    ...sim.enemies.filter((e) => !e.raidProxy && !def(e).flying).map((e) => ({ x: e.x, y: e.y, size: enemySize(e) })),
  ];
}

/** Light that moves with the battle: every unit's hand torch, and each
 * blast's brief flash (wider and brighter, fading as it burns out). */
export function carriedLights(sim: DefendSim): CarriedLight[] {
  const torches: CarriedLight[] = [...sim.soldiers.filter((u) => !garrisoned(u)), ...sim.civilians].map((u) => ({ x: u.x, y: u.y, id: u.id }));
  for (const fx of sim.effects)
    if (fx.kind === "boom") torches.push({ x: fx.x, y: fx.y, id: fx.seed ?? 0, r: fx.r * 2.4, k: 1.6 * (1 - fx.t / 0.6) });
  torches.push(...siegeLights(sim), ...boatLights(sim));
  return torches;
}
