/** Ambush adds placement, routing and a wallet to native Defend combat. */
import { ambushBonuses } from "../ambush-upgrades.ts";
import { dist } from "../exact.ts";
import { CELLS_W, CELLS_H } from "../defend/grid.ts";
import { AmbushTallies } from "./ambush-tallies.ts";
import { ambushUpgradePrice } from "./ambush-upgrade-price.ts";
import { nextSteps, sameStep, mergePartners, placedBattlePaths, type UpgradeStep, type Wear } from "../specializations.ts";
import { DefendSim, type Enemy } from "../defend/sim.ts";
import { defaultDefendSave } from "../defend/progress.ts";
import { NO_BONUSES, ENEMIES, type StructureKind, type Bonuses, type EnemyKind } from "../defend/catalog.ts";
import { Outposts } from "./outposts.ts";
import { ambushWave, waveHasFliers, AMBUSH_WAVES } from "./ambush-waves.ts";
import type { Stars } from "./levels.ts";
import { ambushField } from "./battlefield.ts";
import { ambushLevel } from "./levels.ts";
import { AmbushGrid, buildingRect, type GridBuilding } from "./ambush-grid.ts";
import { ambushPrice, enemyBounty, startingGold } from "./economy.ts";
import { bonuses as ownedBonuses } from "../progression.ts";
import type { Save } from "../save.ts";
import { AMBUSH_PALETTE } from "./plans.ts";
export { AMBUSH_PALETTE } from "./plans.ts";
export type AmbushBuilding = GridBuilding & { paid: number; placedAt: number; wear?: Wear };
export type AmbushSpell = "meteor" | "frostNova" | "reinforcements" | "necromancy";
export class AmbushSim {
  readonly field;
  readonly level;
  readonly engine: DefendSim;
  readonly grid: AmbushGrid;
  readonly outposts: Outposts;
  readonly waves;
  readonly perks;
  readonly tallies = new AmbushTallies(() => this);
  readonly buildings: AmbushBuilding[] = [];
  phase: "build" | "battle" | "won" | "lost" = "build";
  gold: number;
  goldEarned = 0;
  kills = 0;
  wave = 0;
  elapsed = 0;
  autoSend = false;
  speed: 1 | 2 | 3 = 1;
  waveStarted = 0;
  private lots: number[] = [];
  private sequence = 0;
  private acc = 0;
  private queue: EnemyKind[] = [];
  private spawnClock = 0;
  private between = 2;
  private bonus: Bonuses;
  constructor(
    readonly index: number,
    game: Save,
  ) {
    this.perks = ambushBonuses(game.campaigns.ambush.ranks);
    this.level = ambushLevel(index);
    this.field = ambushField(index);
    this.waves = Array.from({ length: AMBUSH_WAVES.count }, (_, i) => ambushWave(this.level, i + 1));
    const map = this.field.map;
    // Reserve native homes before DefendSim allocates its HP/collision arrays.
    for (let n = 0; n < 256; n++) {
      const id = map.buildings.length,
        rect = { x: 0, y: 0, w: 0, h: 0 };
      map.buildings.push({ id, kind: "watchTower", rect, cells: [], hidden: true, variant: 0, structureUid: id });
      map.structures.push({ uid: id, kind: "watchTower", rect, tx: 0, ty: 0, inside: false });
      this.lots.push(id);
    }
    const owned = ownedBonuses(game);
    this.bonus = {
      ...NO_BONUSES,
      towerDamage: this.perks.damage,
      troopDamage: this.perks.damage,
      troopHp: this.perks.troopHp,
      keepHp: this.perks.keep,
      wallHp: this.perks.keep,
      meteor: owned.meteor ? { ...owned.meteor, rank: 0 } : undefined,
      frostNova: owned.frostNova ? { ...owned.frostNova, rank: 0 } : undefined,
      reinforcements: owned.reinforcements ? { ...owned.reinforcements, rank: 0 } : undefined,
      necromancy: owned.necromancy ? { ...owned.necromancy, rank: 0 } : undefined,
      structurePaths: {},
    };
    this.engine = new DefendSim(map, defaultDefendSave().levels, this.level.seed, this.bonus);
    this.engine.wave = 1 + this.level.zone * 20;
    this.outposts = new Outposts(this.engine, this.field, this.perks.palisade);
    this.engine.scenario = {
      manualWaves: true,
      noCivilians: true,
      routeEnemy: (e, dt) => this.outposts.route(e, dt),
      fieldFor: (e) => this.outposts.fieldFor(e),
      died: (e) => {
        if (e.fortressPart) return;
        const d = ENEMIES[e.kind],
          gold = this.perks.bounty * enemyBounty({ maxHp: e.maxHp, damage: d.damage, cooldown: d.cooldown, speed: d.speed });
        this.gold += gold;
        this.goldEarned += gold;
        this.kills++;
      },
    };
    this.grid = new AmbushGrid(
      map,
      this.level.area,
      this.field.road,
      this.field.castle,
      this.field.outposts.map((p) => p.rect),
      true,
    );
    this.engine.tally = (id, damage, killed) => this.tallies.add(id, damage, killed);
    this.engine.tallyHomes = new Map();
    this.gold = startingGold(this.level.index) + this.perks.gold;
    this.autoSend = game.campaigns.ambush.autoSend === true;
    this.speed = Math.min(game.defend.battleSpeed, game.defend.speed3 ? 3 : 2) as 1 | 2 | 3;
    this.headStart();
  }
  get map() {
    return this.engine.map;
  }
  get stars() {
    return this.outposts.stars as Stars;
  }
  get warning() {
    return ["build", "battle"].includes(this.phase) && (waveHasFliers(this.queue) || (!this.queue.length && !!this.waves[this.wave]?.fliers));
  }
  /** Every strike spell is always at hand, as in Defend; without a researched path it casts plain. */
  get spells() {
    return ["meteor", "frostNova", "reinforcements", "necromancy"] as const;
  }
  cast(spell: AmbushSpell, at: { x: number; y: number }) {
    if (this.phase !== "battle" || !this.spells.includes(spell)) return false;
    const ok =
      spell === "meteor"
        ? this.engine.castMeteor(at)
        : spell === "frostNova"
          ? this.engine.castFrostNova(at)
          : spell === "reinforcements"
            ? this.engine.castReinforcements(at)
            : this.engine.castNecromancy(at) >= 0;
    if (ok) {
      const key =
        spell === "meteor" ? "meteorReadyAt" : spell === "frostNova" ? "frostReadyAt" : spell === "reinforcements" ? "reinforceReadyAt" : "necroReadyAt";
      this.engine[key] = this.engine.time + (this.engine[key] - this.engine.time) * this.perks.cooldown;
    }
    return ok;
  }
  get enemiesLeft() {
    return this.queue.length + this.engine.enemies.filter((e) => !e.fortressPart).length;
  }
  price(kind: StructureKind) {
    return Math.max(10, Math.round((ambushPrice(kind).cost * this.perks.price) / 10) * 10);
  }
  refund(id: number) {
    const b = this.buildings.find((b) => b.id === id);
    return b ? (this.wave < 2 ? b.paid : Math.floor((b.paid * this.perks.refund) / 10) * 10) : 0;
  }
  placeAt(kind: StructureKind, qx: number, qy: number) {
    if (
      !["build", "battle"].includes(this.phase) ||
      !(AMBUSH_PALETTE as readonly string[]).includes(kind) ||
      this.sequence >= this.lots.length ||
      !this.grid.check(kind, qx, qy, this.buildings).fits
    )
      return false;
    const cost = this.price(kind);
    if (cost > this.gold) return false;
    const id = this.lots[this.sequence++],
      b = { id, kind, qx, qy, paid: cost, placedAt: this.elapsed };
    this.engine.configureLot(id, kind, buildingRect(b), true);
    this.buildings.push(b);
    this.tallies.placed(id);
    this.gold -= cost;
    this.replan();
    return true;
  }
  moveTo(id: number, qx: number, qy: number) {
    const b = this.buildings.find((b) => b.id === id);
    if (!b || this.phase !== "build" || !this.grid.check(b.kind, qx, qy, this.buildings, id).fits) return false;
    b.qx = qx;
    b.qy = qy;
    this.engine.configureLot(id, b.kind, buildingRect(b), true);
    this.replan();
    return true;
  }
  remove(id: number) {
    const i = this.buildings.findIndex((b) => b.id === id);
    if (i < 0 || !["build", "battle"].includes(this.phase)) return false;
    const b = this.buildings[i];
    this.gold += this.refund(id);
    this.engine.configureLot(id, b.kind, buildingRect(b), false);
    this.buildings.splice(i, 1);
    this.replan();
    return true;
  }
  get canSend() {
    return ["build", "battle"].includes(this.phase) && !this.queue.length && this.wave < AMBUSH_WAVES.count;
  }
  send() {
    if (!this.canSend || (this.phase === "build" && !this.buildings.length)) return false;
    this.phase = "battle";
    this.nextWave();
    return true;
  }
  private headStart() {
    for (let n = 0; n < this.perks.free; n++) {
      const aim = this.field.path[1];
      let best: { qx: number; qy: number } | undefined,
        score = Infinity;
      for (let qy = 1; qy < CELLS_H / 2; qy++)
        for (let qx = 1; qx < CELLS_W / 2; qx++) {
          if (!this.grid.check("archerTower", qx, qy, this.buildings).fits) continue;
          const d = dist(qx * 2 + 1 - aim.x, qy * 2 + 1 - aim.y);
          if (d < score) {
            score = d;
            best = { qx, qy };
          }
        }
      if (best && this.placeAt("archerTower", best.qx, best.qy)) {
        const b = this.buildings.at(-1)!;
        this.gold += b.paid;
        b.paid = 0;
      }
    }
  }
  private loadout() {
    const d = defaultDefendSave();
    d.layout.structures = this.buildings.map((b) => ({
      uid: b.id,
      kind: b.kind as Exclude<StructureKind, "keep">,
      tx: Math.floor(b.qx / 4),
      ty: Math.floor(b.qy / 4),
      qx: b.qx,
      qy: b.qy,
      ...(b.wear ?? {}),
    }));
    return d;
  }
  upgrades(id: number) {
    const b = this.buildings.find((b) => b.id === id);
    if (!b) return [];
    return nextSteps(b.kind as Exclude<StructureKind, "keep">, b.wear).map((step) => {
      const partners = step.type === "merge" ? mergePartners(this.loadout(), b.kind as Exclude<StructureKind, "keep">, b.wear, b.id) : [];
      const consumed = partners.flatMap((p) => (p.found && "uid" in p.found ? [p.found.uid] : []));
      const kind = step.type === "path" ? b.kind : step.to,
        others = this.buildings.filter((o) => !consumed.includes(o.id));
      const fits = this.engine.hp[b.id] > 0 && this.grid.check(kind, b.qx, b.qy, others, b.id).fits,
        ready = step.type !== "merge" || (partners.length === 2 && consumed.length === 2);
      return {
        step,
        cost: ambushUpgradePrice(b.kind, step),
        ready: ready && fits,
        reason: !ready ? "Needs two other buildings, each maxed on a different branch." : !fits ? "Needs more open space around its new footprint." : "",
        consumed,
      };
    });
  }
  upgrade(id: number, requested: UpgradeStep) {
    if (!["build", "battle"].includes(this.phase)) return false;
    const b = this.buildings.find((b) => b.id === id),
      offer = this.upgrades(id).find((o) => sameStep(o.step, requested));
    if (!b || !offer?.ready || offer.cost > this.gold) return false;
    const health = this.engine.hp[id] / Math.max(1, this.engine.maxHp[id]);
    this.gold -= offer.cost;
    b.paid += offer.cost;
    for (const other of offer.consumed) {
      const i = this.buildings.findIndex((o) => o.id === other),
        partner = this.buildings[i];
      b.paid += partner.paid;
      this.engine.configureLot(partner.id, partner.kind, buildingRect(partner), false);
      this.buildings.splice(i, 1);
    }
    const step = offer.step;
    if (step.type === "path") b.wear = { path: step.path, rank: step.rank };
    else {
      b.kind = step.to;
      delete b.wear;
    }
    this.bonus.structurePaths = placedBattlePaths({ defend: this.loadout() } as Save).structurePaths ?? {};
    if (step.type !== "path") this.engine.configureLot(id, b.kind, buildingRect(b), true, health);
    this.replan();
    return true;
  }
  start() {
    return this.phase === "build" && this.send();
  }
  private replan() {
    for (const rect of this.outposts.replan(this.buildings)) this.grid.refreshTown(rect);
  }
  private nextWave() {
    this.wave++;
    const wave = this.waves[this.wave - 1];
    this.queue = [...wave.kinds];
    this.engine.beginManualWave(this.level.zone * 20 + this.wave, wave.budget, this.queue.length);
    this.spawnClock = 0;
    this.between = AMBUSH_WAVES.breakSeconds;
    this.waveStarted = this.elapsed;
  }
  step(dt: number) {
    if (this.phase !== "battle" || !Number.isFinite(dt) || dt <= 0) return;
    this.acc += Math.min(0.25, dt) * this.speed;
    while (this.acc >= 1 / 30 && this.phase === "battle") {
      this.acc -= 1 / 30;
      this.tick(1 / 30);
    }
  }
  private tick(dt: number) {
    this.elapsed += dt;
    this.spawnClock -= dt;
    if (this.queue.length && this.spawnClock <= 0) {
      const e = this.field.path[0];
      this.engine.releaseEnemy(this.queue.shift()!, { x: Math.max(0.5, e.x), y: Math.max(0.5, e.y) });
      this.spawnClock = AMBUSH_WAVES.spawnGap;
    }
    for (const u of this.engine.soldiers) this.engine.tallyHomes!.set(u.id, u.home);
    this.engine.step(dt);
    this.outposts.update();
    if (this.engine.keepHp() <= 0) this.phase = "lost";
    else if (!this.queue.length && !this.engine.enemies.length) {
      if (this.wave === AMBUSH_WAVES.count) this.phase = "won";
      else if (this.autoSend && (this.between -= dt) <= 0) this.nextWave();
    }
  }
}
