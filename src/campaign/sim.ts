import { spawnFlagBearers } from "../defend/flag-bearers.ts";
/** Native Siege lifecycle. Ambush geography/economy lives in ambush-sim.ts. */
import { DefendSim } from "../defend/sim.ts";
import * as C from "../defend/catalog.ts";
import { defaultDefendSave, type DefendSave } from "../defend/progress.ts";
import { bonuses as gameBonuses } from "../progression.ts";
import { placedBattlePaths } from "../specializations.ts";
import type { PathId } from "../knowledge-paths.ts";
import type { Save } from "../save.ts";
import { siegeField, type MusterCopy } from "./battlefield.ts";
import { SiegeMana, SIEGE_MANA, manaFor } from "./siege-mana.ts";
import { RaidBattle } from "./raid.ts";
import { generateCastle, type CastleSnapshot } from "./castles.ts";
import { castleGame } from "./castle-model.ts";
import { infantry, type Placement } from "./plans.ts";
export const SIEGE_SECONDS = 120;
export * from "./plans.ts";
export function infantryCopies(save: DefendSave): MusterCopy[] {
  const out: MusterCopy[] = [];
  for (const kind of Object.keys(C.STRUCTURES) as C.StructureKind[])
    if (infantry(kind)) {
      const worn = [...save.layout.structures, ...save.kept].filter((s) => s.kind === kind);
      for (let i = 0; i < (save.owned[kind as C.PaletteItem] || 0); i++) {
        const copy = worn[i];
        out.push({ kind, uid: 100000 + out.length, ...(copy?.path ? { path: copy.path, rank: copy.rank } : {}) });
      }
    }
  return out;
}
export class CampaignSim {
  phase: "build" | "battle" | "won" | "lost" = "build";
  readonly mana?: SiegeMana;
  readonly engine: DefendSim;
  readonly raid: RaidBattle;
  readonly layout: Placement[];
  gold = 0;
  elapsed = 0;
  private acc = 0;
  constructor(
    readonly mode: "siege",
    readonly level: number,
    _layout: Placement[],
    owned: DefendSave["owned"],
    levels: DefendSave["levels"],
    readonly opponent?: CastleSnapshot,
    game?: Save,
  ) {
    const source = game?.defend ?? { ...defaultDefendSave(), owned, levels },
      copies = infantryCopies(source),
      castle = opponent ?? generateCastle(12345, 1000),
      field = siegeField(castle, copies);
    const nativeStructures = copies.map((c) => ({
      uid: c.uid,
      kind: c.kind as Exclude<C.StructureKind, "keep">,
      tx: 0,
      ty: 0,
      qx: 0,
      qy: 0,
      ...(c.path ? { path: c.path as PathId, rank: c.rank } : {}),
    }));
    const adapted = { ...game, defend: { ...source, layout: { ...source.layout, structures: nativeStructures } } } as Save;
    const bonus = { ...(game ? gameBonuses(game) : C.NO_BONUSES), ...placedBattlePaths(adapted) };
    const defense = gameBonuses(castleGame(castle.seed, castle.castle));
    this.raid = new RaidBattle(field, { ...levels }, bonus, defense, castle.seed, castle.castle.levels);
    this.engine = this.raid.attack;
    if (SIEGE_MANA.enabled) {
      this.mana = new SiegeMana();
      this.engine.scenario = { ...this.engine.scenario, spellGate: this.mana.gate };
      this.raid.onDefenderDeath = (unit) => this.mana!.gain(manaFor(unit));
    }
    this.layout = copies.map((c, i) => ({ pad: i, kind: c.kind, ...(c.path ? { path: c.path as PathId, rank: c.rank } : {}) }));
  }
  get map() {
    return this.engine.map;
  }
  get renderSim() {
    return this.raid.prepareRender();
  }
  get allies() {
    return this.engine.soldiers;
  }
  get enemies() {
    return this.engine.enemies;
  }
  place(_pad: number, _kind: C.StructureKind) {
    return false;
  }
  remove(_pad: number) {}
  start() {
    if (this.phase !== "build" || !this.layout.length) return false;
    spawnFlagBearers(this.raid.defense);
    this.phase = "battle";
    return true;
  }
  step(dt: number) {
    if (this.phase !== "battle" || !Number.isFinite(dt) || dt <= 0) return;
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= 1 / 30 && this.phase === "battle") {
      this.acc -= 1 / 30;
      // The timer advances in whole native ticks, without accumulating drift.
      this.elapsed = Math.min(SIEGE_SECONDS, (Math.round(this.elapsed * 30) + 1) / 30);
      this.raid.step(1 / 30);
      if (this.raid.defense.keepHp() <= 0) this.phase = "won";
      else if (this.elapsed >= SIEGE_SECONDS) this.phase = "lost";
    }
  }
}
