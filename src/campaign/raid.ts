/** Two native Defend armies on one native city. This is targeting/ownership glue,
 * not a second implementation of towers, troop attacks, spells or projectiles. */
import { DefendSim, type Enemy, type Soldier, type Civilian, type ScenarioRules } from "../defend/sim.ts";
import type { Building, CityMap } from "../defend/citygen.ts";
import type { Bonuses } from "../defend/catalog.ts";
import { defaultDefendSave, type DefendSave } from "../defend/progress.ts";
import { center, cellCenter } from "../defend/pathing.ts";
import { sideCells } from "../defend/grid.ts";
import { WarBanner } from "../defend/war-banner.ts";
import { chilled } from "../defend/wizard.ts";
import type { siegeField } from "./battlefield.ts";

class Side extends DefendSim {
  allocate!: () => number;
  override newId() {
    return this.allocate ? this.allocate() : super.newId();
  }
}
const pools = [
  "soldiers",
  "civilians",
  "enemies",
  "arrows",
  "shells",
  "divineArrows",
  "wisps",
  "wispFireTrails",
  "wispLightningTrails",
  "mines",
  "siegeShots",
  "flames",
  "frosts",
  "fireballs",
  "mageBolts",
  "blazes",
  "stabs",
  "swings",
  "blades",
  "nanoShells",
  "nanoClouds",
  "nanoBursts",
  "skyPalaces",
  "bolts",
  "ballistaBolts",
  "spikeThrusts",
  "scorches",
  "effects",
  "graves",
  "raisings",
  "meteors",
  "impacts",
  "rime",
  "frostBursts",
  "drops",
  "landings",
  "floods",
  "sinkings",
  "blackHoles",
  "corpses",
] as const;
export class RaidBattle {
  readonly attack: DefendSim;
  readonly defense: DefendSim;
  readonly view: DefendSim;
  private proxies = [new Map<number, Enemy>(), new Map<number, Enemy>()];
  private cache = new Map<PropertyKey, unknown>();
  private ids = 1;
  constructor(
    readonly field: ReturnType<typeof siegeField>,
    levels: DefendSave["levels"],
    attackBonuses: Bonuses,
    defenseBonuses: Bonuses,
    seed: number,
  ) {
    const { map, attackerIds, defenderIds, attackerKeep, defenderKeep } = field;
    const attack = new Side(map, { ...levels }, seed, attackBonuses, attackerKeep),
      defense = new Side(map, { ...defaultDefendSave().levels }, seed ^ 0x62a9, defenseBonuses, defenderKeep);
    attack.allocate = defense.allocate = () => this.ids++;
    this.attack = attack;
    this.defense = defense;
    attack.scenario = this.rules(attackerIds, true);
    defense.scenario = this.rules(defenderIds, false);
    attack.skyPalaces = attack.skyPalaces.filter((p) => attackerIds.has(p.id));
    defense.skyPalaces = defense.skyPalaces.filter((p) => defenderIds.has(p.id));
    const goal = center(map.buildings[defenderKeep].rect);
    attack.warBanner = new WarBanner(goal.x, goal.y, true);
    const own = center(map.buildings[defenderKeep].rect);
    defense.warBanner = new WarBanner(own.x, own.y, true);
    this.synchronize();
    this.targets();
    this.view = new Proxy(attack, {
      get: (target, key) => {
        if (pools.includes(key as (typeof pools)[number])) {
          if (!this.cache.has(key))
            this.cache.set(key, [...(attack[key as (typeof pools)[number]] as unknown[]), ...(defense[key as (typeof pools)[number]] as unknown[])]);
          return this.cache.get(key);
        }
        if (key === "chrono" || key === "wispOwners" || key === "gateOpen") {
          if (!this.cache.has(key)) this.cache.set(key, new Map([...(attack[key] as Map<number, any>), ...(defense[key] as Map<number, any>)]));
          return this.cache.get(key);
        }
        if (key === "keepId") return defenderKeep;
        if (key === "keep") return map.buildings[defenderKeep];
        if (key === "keepHp") return () => defense.keepHp();
        if (key === "keepMaxHp") return () => defense.keepMaxHp();
        if (key === "bonuses") return { ...attack.bonuses, structurePaths: { ...attack.bonuses.structurePaths, ...defense.bonuses.structurePaths } };
        if (key === "intact") return (b: Building) => !b.hidden && target.built[b.id] === b.cells.length;
        if (key === "mapVersion") return attack.mapVersion + defense.mapVersion;
        if (key === "changed") return [...attack.changed, ...defense.changed];
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set: (target, key, value) => {
        if (key === "changed") {
          attack.changed = [];
          defense.changed = [];
          return true;
        }
        return Reflect.set(target, key, value);
      },
    });
  }
  private rules(owned: Set<number>, attacking: boolean): ScenarioRules {
    return {
      manualWaves: true,
      passiveEnemies: true,
      noCivilians: attacking,
      unrestricted: true,
      ignoreKeepLoss: attacking,
      owns: (b) => owned.has(b.id),
      soldierDt: (s, dt) => {
        const enemyProxy = this.proxies[attacking ? 1 : 0].get(s.id);
        if (enemyProxy?.impaled !== undefined) return 0;
        return dt * (enemyProxy ? chilled(enemyProxy) : 1);
      },
    };
  }
  /** Foreign buildings remain collision obstacles; only their owning side runs their attacks. */
  synchronize() {
    const a = this.attack,
      d = this.defense;
    for (const b of this.field.map.buildings) {
      const owner = this.field.attackerIds.has(b.id) || b.id === this.field.attackerKeep ? a : d,
        other = owner === a ? d : a;
      if (other.built[b.id] !== owner.built[b.id] || b.cells.some((c) => other.solid[c] !== owner.solid[c])) {
        for (const c of b.cells) {
          other.solid[c] = owner.solid[c];
          other.ownSolid[c] = owner.solid[c];
          other.foeSolid[c] = owner.solid[c];
        }
        other.changed.push(...b.cells);
        other.mapVersion++;
      }
      other.hp[b.id] = owner.hp[b.id];
      other.maxHp[b.id] = owner.maxHp[b.id];
      other.built[b.id] = owner.built[b.id];
      other.flash[b.id] = owner.flash[b.id];
      if (b.kind === "gate" && owner !== other) for (const c of b.cells) other.ownSolid[c] = owner.solid[c];
    }
  }
  private proxy(
    viewer: DefendSim,
    owner: DefendSim,
    id: number,
    unit: Soldier | Civilian | undefined,
    building: Building | undefined,
    cache: Map<number, Enemy>,
  ): Enemy {
    let proxy = cache.get(id);
    if (proxy) return proxy;
    const p = unit ?? center(building!.rect);
    proxy = {
      id,
      kind: "roach",
      x: p.x,
      y: p.y,
      hp: 1,
      maxHp: 1,
      cd: 0,
      jx: 0,
      jy: 0,
      distract: -1,
      distractT: 0,
      rollT: 0,
      marked: false,
      flash: 0,
      raidProxy: true,
      ...(building ? { raidBuilding: true } : {}),
    };
    if (unit) {
      for (const key of ["x", "y", "maxHp", "flash"] as const)
        Object.defineProperty(proxy, key, {
          enumerable: true,
          get: () => unit[key],
          set: (value) => {
            unit[key] = value;
          },
        });
      Object.defineProperty(proxy, "hp", {
        enumerable: true,
        get: () => unit.hp,
        set: (value) => {
          if (value < unit.hp) owner.hurtDefender(unit, unit.hp - value);
          else unit.hp = value;
        },
      });
    } else {
      const b = building!;
      const spot = () => {
        const candidates = sideCells(b.rect).filter((c) => !owner.solid[c]);
        const front = viewer === this.attack ? b.rect.y + b.rect.h : b.rect.y;
        candidates.sort((a, c) => {
          const p = cellCenter(a),
            q = cellCenter(c);
          return Math.abs(p.y - front) - Math.abs(q.y - front) || Math.abs(p.x - (b.rect.x + b.rect.w / 2)) - Math.abs(q.x - (b.rect.x + b.rect.w / 2));
        });
        return candidates.length ? cellCenter(candidates[0]) : center(b.rect);
      };
      const position = spot();
      Object.defineProperty(proxy, "x", { enumerable: true, get: () => position.x, set: () => {} });
      Object.defineProperty(proxy, "y", { enumerable: true, get: () => position.y, set: () => {} });
      Object.defineProperty(proxy, "maxHp", { enumerable: true, get: () => owner.maxHp[b.id] });
      Object.defineProperty(proxy, "hp", {
        enumerable: true,
        get: () => owner.hp[b.id],
        set: (value) => {
          if (value < owner.hp[b.id]) {
            owner.damageBuilding(b.id, owner.hp[b.id] - value);
            this.synchronize();
          }
        },
      });
    }
    cache.set(id, proxy);
    return proxy;
  }
  private targets() {
    for (const [index, viewer, owner, buildings] of [
      [0, this.attack, this.defense, this.field.defenderIds],
      [1, this.defense, this.attack, this.field.attackerIds],
    ] as const) {
      const cache = this.proxies[index],
        targets: Enemy[] = [];
      for (const s of [...owner.soldiers, ...owner.civilians])
        if (s.hp > 0) {
          if ("kind" in s) s.raidEnemy = owner === this.defense;
          targets.push(this.proxy(viewer, owner, s.id, s, undefined, cache));
        }
      for (const id of buildings) {
        const b = this.field.map.buildings[id];
        if (owner.hp[id] > 0 && !b.hidden) targets.push(this.proxy(viewer, owner, 10000000 + id, undefined, b, cache));
      }
      viewer.enemies = targets;
    }
  }
  step(dt: number) {
    this.cache.clear();
    this.targets();
    this.attack.step(dt);
    this.synchronize();
    this.targets();
    this.defense.step(dt);
    this.synchronize();
    this.targets();
  }
  prepareRender() {
    this.cache.clear();
    return this.view;
  }
}
