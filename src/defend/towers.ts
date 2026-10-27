import {captureShot,shotField,chronoTarget,stepChrono,sweptEnemies,chargeIdle} from "./chrono.ts";
import { fireMine, landMine, mineRange } from "./mines.ts";
import { sheltered } from "./boats.ts";
import { stepBowJavelin, stepSkyArrow } from "./archer-attunements.ts";
import { buildingPaths } from "../specializations.ts";
/** DEFEND towers and their projectiles. Archer towers shoot the nearest
 * enemy in range with homing arrows; cannon towers lob a shell at the
 * nearest ground enemy (not too close), which bursts where the target stood
 * when it fired. */
import { dist, sq } from "../exact.ts";
import {
  BALLISTA,
  archerCooldown,
  archerDamage,
  archerRange,
  CANNON_RANGE,
  cannonCooldown,
  cannonDamage,
  cannonSplash,
  ENEMIES,
  isArcherTower,
  isCannonTower,
} from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { center, nearest } from "./pathing.ts";
import { shootBallista, wallBallistaReload } from "./wall-defenses.ts";
import { burstBall } from "./muskets.ts";
import { bulletHit, pierceHits } from "./snipers.ts";
import { knockBack } from "./gunners.ts";
import type { Arrow, DefendSim, Enemy } from "./sim.ts";
import { railHit, railOn } from "./revolutionary.ts";
import { fireNanoShell, nanoReload } from "./nanobots.ts";
import { FIRE_ARROWS, GUNNERY, SHARP, SIEGE_SHOT, pathRank } from "../knowledge-paths.ts";
import { ARROW_LOOPS, BOILING_OIL, keepRank } from "../keep-upgrades.ts";
import { hawkDamage, hawkReload, hawkTarget, type HawkFocus } from "./hawk-focus.ts";
import { stepWispTower, finishWisps } from "./wisp-arrow.ts";
import { stepWispFire } from "./wisp-fire.ts";

/** The towers' path ranks (`knowledge-paths.ts`, each 0 unless worn) and
 * which branch tower each is: the Brazier tower lights its arrows (`lit`),
 * the Hawk tower sees further (`hawk`), the Gun battery reloads faster
 * (`battery`), the Mortar tower hits harder (`mortar`). A plain tower
 * wearing one of their paths (old fixtures' `Bonuses.paths`) shoots as
 * that tower. */
const paths = (sim: Pick<DefendSim, "bonuses">, b?: Building) => {
  const p = buildingPaths(sim, b), k = b?.kind;
  const fire = pathRank(p, "brazierTower", "fireArrows"), sharp = pathRank(p, "hawkTower", "sharpshooters");
  const gunnery = pathRank(p, "batteryTower", "gunnery"), siege = pathRank(p, "mortarTower", "siegeShot");
  return {
    fire, sharp, gunnery, siege,
    lit: k === "brazierTower" || fire > 0, hawk: k === "hawkTower" || sharp > 0,
    battery: k === "batteryTower" || gunnery > 0, mortar: k === "mortarTower" || siege > 0,
  };
};
const byDistanceFrom = (c: { x: number; y: number }) => (a: Enemy, b: Enemy) => sq(a.x - c.x) + sq(a.y - c.y) - (sq(b.x - c.x) + sq(b.y - c.y));

/** How far an archer tower shoots. */
export const archerTowerRange = (sim: Pick<DefendSim, "levels" | "bonuses">, b?: Building) => {
  const { sharp, hawk } = paths(sim, b);
  return archerRange(sim.levels.archerRange) * (hawk ? SHARP.range[sharp] : 1);
};
/** How far a cannon tower lobs its shells. */
export const cannonTowerRange = (sim: Pick<DefendSim, "bonuses">, b?: Building) => b?.kind === "minelayerTower" ? mineRange() : CANNON_RANGE + (paths(sim, b).siege >= 3 ? SIEGE_SHOT.range : 0);

/** How far the keep's arrow loops shoot (0 without them). */
export const keepArrowRange = (sim: Pick<DefendSim, "bonuses">) => ARROW_LOOPS.range[keepRank(sim.bonuses.keep, "arrowLoops")];
/** How far out from the keep's walls its boiling oil reaches (0 without it). */
export const keepOilReach = (sim: Pick<DefendSim, "bonuses">) => BOILING_OIL.reach[keepRank(sim.bonuses.keep, "boilingOil")];

/** Cannons won't fire at anything closer than this (cells). */
const CANNON_MIN = 1.5;
/** Arrow speed, cells per second. */
const ARROW_SPEED = 16;
/** How fast each other shot flies, as a share of an arrow's speed. */
const SHOT_SPEED = { stone: 0.7, bullet: 2.2, ball: 1.4, rocket: 0.9, javelin: 0.85 };

export class Towers {
  /** Seconds until each tower may fire again. */
  readonly cooldown = new Map<number, number>();
  readonly focus = new Map<number, HawkFocus>();

  step(sim: DefendSim, dt: number) {
    stepChrono(sim,dt);
    for (const b of sim.map.buildings) {
      if (!sim.intact(b)) {
        if (this.focus.delete(b.id)) this.cooldown.delete(b.id);
        continue;
      }
      if (isCannonTower(b.kind)) this.stepCannon(sim, b, dt);
      else if (b.kind === "nanoTower") this.stepNanoTower(sim, b, dt);
      else if (b.kind === "wispTower") {
        stepWispTower(sim,b,dt);
        if(sim.chrono.size){const c=center(b.rect),range=archerTowerRange(sim,b);
          if(!sim.enemiesNear(c.x,c.y,range).some(e=>e.hp>0&&(e.x-c.x)**2+(e.y-c.y)**2<=range*range)&&this.ready(b,dt))
            chargeIdle(sim,c,range,archerDamage(sim.levels.archerDamage)*sim.bonuses.towerDamage,()=>true,()=>this.cooldown.set(b.id,archerCooldown(sim.levels.archerRate)*sim.bonuses.towerReload));
        }
      }
      else if (isArcherTower(b.kind)) this.stepArcherTower(sim, b, dt);
      else if (b.kind === "wallBallista") this.stepBallista(sim, b, dt);
      else if (b.kind === "keep" && sim.bonuses.keep) this.stepKeep(sim, b, dt);
    }
    if (sim.wispOwners.size || sim.wispFireTrails.length || sim.wispLightningTrails.length) stepWispFire(sim, dt);
    if (sim.wisps.length || sim.wispOwners.size) finishWisps(sim, dt);
  }

  /** Seconds until the keep pours its boiling oil again. */
  private oil = 0;

  /** The keep's own defenses (`keep-upgrades.ts`): arrows from its loops
   * and boiling oil on whatever reaches its walls. */
  private stepKeep(sim: DefendSim, b: Building, dt: number) {
    const loops = keepRank(sim.bonuses.keep, "arrowLoops"), oil = keepRank(sim.bonuses.keep, "boilingOil");
    const c = center(b.rect);
    if (loops && this.ready(b, dt)) {
      const range = keepArrowRange(sim);
      const near = sim.enemiesNear(c.x, c.y, range).filter((e) => sq(e.x - c.x) + sq(e.y - c.y) <= range * range);
      const idle=near.length?null:chronoTarget(sim,c,range,true,b.id);
      if (!near.length&&!idle) this.cooldown.set(b.id, 0);
      else {
        this.cooldown.set(b.id, ARROW_LOOPS.reload[loops] * sim.bonuses.towerReload);
        const damage = archerDamage(sim.levels.archerDamage) * sim.bonuses.towerDamage * ARROW_LOOPS.damage[loops];
        const targets = loops >= 3 && near.length ? near.sort(byDistanceFrom(c)).slice(0, ARROW_LOOPS.volley) : [idle??nearest(near, c)!];
        for (const t of targets) sim.arrows.push({ x: c.x, y: c.y - 0.8, origin: { x: c.x, y: c.y, building: b.id }, target: t.id, damage, tx: t.x, ty: t.y, life: 2 });
      }
    }
    if (!oil || (this.oil -= dt) > 0) return;
    const r = b.rect, reach = BOILING_OIL.reach[oil];
    const scalded = sim.enemiesNear(c.x, c.y, (r.w + r.h) / 2 + reach).filter((e) => {
      if (ENEMIES[e.kind].flying) return false;
      const dx = Math.max(r.x - e.x, 0, e.x - (r.x + r.w)), dy = Math.max(r.y - e.y, 0, e.y - (r.y + r.h));
      return dx * dx + dy * dy <= reach * reach;
    });
    // Nothing at the walls: the cauldrons wait, hot, for the next.
    if (!scalded.length) return void (this.oil = 0);
    this.oil = BOILING_OIL.every[oil];
    for (const e of scalded) {
      sim.hurtEnemy(e, BOILING_OIL.damage[oil] * sim.bonuses.towerDamage, true, "ranged", { x: c.x, y: c.y, building: b.id }, false, "fire");
      if (BOILING_OIL.burn[oil]) ignite(e, BOILING_OIL.dps[oil] * sim.bonuses.towerDamage, BOILING_OIL.burn[oil]);
      sim.effects.push({ kind: "steam", x: e.x, y: e.y, t: 0, r: 0.7 });
    }
  }

  /** Counts the tower's cooldown down; true once it may fire. */
  private ready(b: Building, dt: number) {
    const cd = (this.cooldown.get(b.id) ?? 0) - dt;
    if (cd <= 0) return true;
    this.cooldown.set(b.id, cd);
    return false;
  }

  private stepArcherTower(sim: DefendSim, b: Building, dt: number) {
    const info = paths(sim, b);
    if (info.hawk) return this.stepHawk(sim, b, info.sharp, dt);
    if (!this.ready(b, dt)) return;
    const c = center(b.rect), { fire, lit } = paths(sim, b);
    const range = archerTowerRange(sim, b);
    const near = sim.enemiesNear(c.x, c.y, range);
    const target = nearest(near, c) ?? chronoTarget(sim,c,range,true,b.id);
    if (!target) return this.cooldown.set(b.id, 0);
    this.cooldown.set(b.id, archerCooldown(sim.levels.archerRate) * sim.bonuses.towerReload);
    let damage = archerDamage(sim.levels.archerDamage) * sim.bonuses.towerDamage;
    // Fire arrows set what they hit burning; at III the tower looses a volley at the nearest few.
    const burn = lit ? damage * (fire ? FIRE_ARROWS.share[fire] : FIRE_ARROWS.hall.share) : 0;
    const targets = fire >= 3 && near.length ? near.filter((e) => sq(e.x - c.x) + sq(e.y - c.y) <= range * range).sort(byDistanceFrom(c)).slice(0, FIRE_ARROWS.volley) : [target];
    for (const t of targets)
      sim.arrows.push({ x: c.x, y: c.y - 0.6, origin: { x: c.x, y: c.y, building: b.id }, target: t.id, damage, tx: t.x, ty: t.y, life: 2, ...(burn ? { burn, burnFor: fire ? FIRE_ARROWS.burn[fire] : FIRE_ARROWS.hall.burn } : {}) });
  }

  private stepHawk(sim: DefendSim, b: Building, rank: number, dt: number) {
    const c = center(b.rect), range = archerTowerRange(sim, b), old = this.focus.get(b.id);
    const target = hawkTarget(sim.enemiesNear(c.x, c.y, range), c.x, c.y, range, old);
    const base = archerCooldown(sim.levels.archerRate) * sim.bonuses.towerReload;
    if (!target) {
      this.focus.delete(b.id);
      const idle=chronoTarget(sim,c,range,true,b.id);
      if(!idle){this.cooldown.set(b.id,0);return;}
      if(idle&&this.ready(b,dt)){this.cooldown.set(b.id,archerCooldown(sim.levels.archerRate)*sim.bonuses.towerReload*hawkReload(1,rank,1));sim.arrows.push({x:c.x,y:c.y-.6,target:idle.id,tx:idle.x,ty:idle.y,damage:archerDamage(sim.levels.archerDamage)*sim.bonuses.towerDamage,life:2+range/ARROW_SPEED,origin:{...c,building:b.id}});}
      return;
    }
    let focus = old;
    if (!focus || focus.target !== target.id) {
      focus = { target: target.id, shots: 0 }; this.focus.set(b.id, focus);
      if (old) this.cooldown.set(b.id, hawkReload(base, rank, 1));
    }
    if (!this.ready(b, dt)) return;
    focus.shots = Math.min(501, focus.shots + 1);
    const damage = archerDamage(sim.levels.archerDamage) * sim.bonuses.towerDamage * hawkDamage(rank, focus.shots);
    this.cooldown.set(b.id, hawkReload(base, rank, focus.shots + 1));
    sim.arrows.push({ x: c.x, y: c.y - 0.6, origin: { x: c.x, y: c.y, building: b.id }, target: target.id,
      damage, tx: target.x, ty: target.y, life: 2 + range / ARROW_SPEED });
  }

  private stepBallista(sim: DefendSim, b: Building, dt: number) {
    if (!this.ready(b, dt)) return;
    this.cooldown.set(b.id, shootBallista(sim, b) ? wallBallistaReload(sim) : 0);
  }

  /** C4 nanobots: a harmless shell bursting into a cloud (`nanobots.ts`). */
  private stepNanoTower(sim: DefendSim, b: Building, dt: number) {
    if (!this.ready(b, dt)) return;
    this.cooldown.set(b.id, fireNanoShell(sim, b) ? nanoReload(sim) : 0);
  }

  private stepCannon(sim: DefendSim, b: Building, dt: number) {
    if (!this.ready(b, dt)) return;
    if (b.kind === "minelayerTower") {
      this.cooldown.set(b.id, fireMine(sim, b) ? cannonCooldown(sim.levels.cannonRate) * sim.bonuses.towerReload : 0);
      return;
    }
    const c = center(b.rect), { gunnery, siege, battery, mortar } = paths(sim, b);
    const range = cannonTowerRange(sim, b);
    const ground = sim.enemiesNear(c.x, c.y, range).filter(
      (e) => !ENEMIES[e.kind].flying && sq(e.x - c.x) + sq(e.y - c.y) > CANNON_MIN * CANNON_MIN,
    );
    const target = nearest(ground, c) ?? chronoTarget(sim,c,range,true,b.id,CANNON_MIN);
    if (!target) return this.cooldown.set(b.id, 0);
    const reload = (gunnery ? GUNNERY.reload[gunnery] : battery ? GUNNERY.hall : 1) * (siege ? SIEGE_SHOT.reload : mortar ? SIEGE_SHOT.hall.reload : 1);
    this.cooldown.set(b.id, cannonCooldown(sim.levels.cannonRate) * sim.bonuses.towerReload * reload);
    const dist = Math.sqrt(sq(target.x - c.x) + sq(target.y - c.y));
    sim.shells.push({
      origin: { x: c.x, y: c.y, building: b.id },
      x0: c.x,
      y0: c.y - 0.4,
      x1: target.x,
      y1: target.y,
      ...(target.id < -1 ? {chronoAim:-target.id-2}:{}),
      t: 0,
      dur: 0.45 + dist * 0.07,
      damage: cannonDamage(sim.levels.cannonDamage) * sim.bonuses.towerDamage * (siege ? SIEGE_SHOT.damage[siege] : mortar ? SIEGE_SHOT.hall.damage : 1),
      r: cannonSplash(sim.levels.cannonDamage) * (siege >= 2 ? SIEGE_SHOT.radius : 1),
      ...(battery ? { grape: true } : {}),
      ...(mortar ? { mortar: { life: SIEGE_SHOT.burnLife, dps: cannonDamage(sim.levels.cannonDamage) * sim.bonuses.towerDamage * SIEGE_SHOT.damage[siege] * SIEGE_SHOT.burnShare } } : {}),
    });
  }
}

/** Arrows home in on their target (or where it died) and hit on arrival. */
export function stepArrows(sim: DefendSim, dt: number) {
  const byId = new Map(sim.enemies.map((e) => [e.id, e]));
  for (const a of sim.arrows) {
    a.life -= dt;
    if(a.release){stepReleased(sim,a,dt);continue;}
    if (a.bowJavelin) { stepBowJavelin(sim, a, dt); continue; }
    if (a.sky) { stepSkyArrow(sim, a, dt); continue; }
    const from={x:a.x,y:a.y};
    // A piercing bullet flies straight on, striking all in its line.
    if (a.pierce) { flyThrough(sim, a, dt); continue; }
    const t = byId.get(a.target);
    const alive = t !== undefined && t.hp > 0;
    if (alive) {
      a.tx = t.x;
      a.ty = t.y;
    }
    const dx = a.tx - a.x,
      dy = a.ty - a.y;
    const d = dist(dx, dy);
    const step = ARROW_SPEED * (a.shot ? SHOT_SPEED[a.shot] : 1) * dt;
    const to=d>step?{x:a.x+dx/d*step,y:a.y+dy/d*step}:{x:a.tx,y:a.ty};
    if(captureShot(sim,{kind:"arrow",shot:a},from,to)){a.life=0;continue;}
    if (d > step) {
      a.x += (dx / d) * step;
      a.y += (dy / d) * step;
      continue;
    }
    // An explosive ball bursts where it lands, even if its mark fell.
    if (a.blast) burstBall(sim, a);
    else if (alive) {
      // A Revolutionary's hit may be critical.
      const hit = a.chain ? railHit(sim, a, t) : a.damage;
      const landed = sim.hurtEnemy(t, hit, true, "ranged", a.origin ?? { x: a.x, y: a.y }, true);
      if (a.chain) railOn(sim, a, { x: t.x, y: t.y }, hit);
      if (landed && a.burn) ignite(t, a.burn, a.burnFor!,sim.tallyOrigin(a.origin));
      // A sniper's bullet pins what it hits, or glances on.
      if (a.pin || a.glance) bulletHit(sim, a, t, landed);
      // A Stopping power bullet knocks it back.
      if (a.knock && landed) knockBack(sim, a, t);
    } else if (a.chain) railOn(sim, a, { x: a.x, y: a.y }, a.damage);
    a.life = 0;
  }
  sim.arrows = sim.arrows.filter((a) => a.life > 0);
}

/** A piercing bullet's step: on toward its end, hurting every enemy within
 * its width of the stretch flown (each once), and gone at the end. */
function flyThrough(sim: DefendSim, a: Arrow, dt: number) {
  const x0 = a.x, y0 = a.y, d = dist(a.tx - a.x, a.ty - a.y), step = ARROW_SPEED * SHOT_SPEED.bullet * dt;
  if (d > step) { a.x += ((a.tx - a.x) / d) * step; a.y += ((a.ty - a.y) / d) * step; }
  else { a.x = a.tx; a.y = a.ty; a.life = 0; }
  const end={x:a.x,y:a.y},field=shotField(sim,{kind:"arrow",shot:a},{x:x0,y:y0},end);
  if(field){a.x=x0+(end.x-x0)*field.t;a.y=y0+(end.y-y0)*field.t;}
  for (const e of pierceHits(sim, a, x0, y0)) {
    a.pierce!.hits.push(e.id);
    const landed = sim.hurtEnemy(e, a.damage, true, "ranged", a.origin ?? { x: x0, y: y0 }, true);
    if (a.pin) bulletHit(sim, a, e, landed);
  }
  if(field&&captureShot(sim,{kind:"arrow",shot:a},{x:x0,y:y0},end))a.life=0;
}

/** Shells fly their arc and burst on landing. */
export function stepShells(sim: DefendSim, dt: number) {
  for (const s of sim.shells) {
    const start=Math.min(1,s.t/s.dur),end=Math.min(1,(s.t+dt)/s.dur);
    if(!s.mine&&captureShot(sim,{kind:"shell",shot:s},{x:s.x0+(s.x1-s.x0)*start,y:s.y0+(s.y1-s.y0)*start},{x:s.x0+(s.x1-s.x0)*end,y:s.y0+(s.y1-s.y0)*end})){s.t=s.dur;continue;}
    s.t += dt;
    if (s.t < s.dur) continue;
    if(s.chronoAim!==undefined&&!s.chronoReleased)continue;
    if (s.mine) { landMine(sim, s); continue; }
    const friendlyFire = !sim.levels.cannonSafe;
    const seed = sim.explode(s.x1, s.y1, { r: s.r, damage: s.damage, friendlyFire, origin: s.origin });
    if (s.mortar && !sheltered(sim, s.x1, s.y1)) sim.blazes.push({ x: s.x1, y: s.y1, r: s.r, t: 0, life: s.mortar.life, dps: s.mortar.dps, seed, mortar: true, origin: s.origin });
    // Grapeshot: smaller bursts round the landing, one each way.
    if (s.grape)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        sim.explode(s.x1 + dx * s.r * 0.8, s.y1 + dy * s.r * 0.8, { r: s.r * GUNNERY.grapeR, damage: s.damage * GUNNERY.grapeShare, friendlyFire, origin: s.origin });
  }
  sim.shells = sim.shells.filter((s) => s.t < s.dur);
}

/** Sets `e` burning for `seconds` at `dps`, or keeps the hotter, longer burn it has. */
export function ignite(e: Enemy, dps: number, seconds: number, origin?:import("./sim.ts").DamageOrigin) {
  if(dps>=(e.burnDps??0)){if(origin)e.burnOrigin=origin;else if(e.burnOrigin)delete e.burnOrigin;}
  e.burn = Math.max(e.burn ?? 0, seconds);
  e.burnDps = Math.max(e.burnDps ?? 0, dps);
}

/** Released shots keep a committed direction: fan angles never home back together. */
function stepReleased(sim:DefendSim,a:Arrow,dt:number){
  const r=a.release!,from={x:a.x,y:a.y},speed=ARROW_SPEED*(a.shot?SHOT_SPEED[a.shot]:1),step=Math.min(r.left,speed*dt);
  a.x+=r.dx*step;a.y+=r.dy*step;r.left-=step;
  const hits=sweptEnemies(sim,from,a,a.pierce?.width??.12,r.hit);
  for(const {e,t}of hits){
    r.hit.push(e.id);
    if(a.blast){a.tx=from.x+(a.x-from.x)*t;a.ty=from.y+(a.y-from.y)*t;burstBall(sim,a);a.life=0;break;}
    const landed=sim.hurtEnemy(e,a.damage,true,"ranged",a.origin,true);
    if(landed&&a.burn)ignite(e,a.burn,a.burnFor!,sim.tallyOrigin(a.origin));
    if(a.pin||a.glance)bulletHit(sim,a,e,landed);
    if(a.knock&&landed)knockBack(sim,a,e);
    if(!a.pierce){a.life=0;break;}
  }
  if(r.left<=0){if(a.blast&&a.life>0){a.tx=a.x;a.ty=a.y;burstBall(sim,a);}a.life=0;}
}
