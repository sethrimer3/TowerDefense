/** Siege-local strike spell resource. No persisted currency or combat formulas. */
import type { Soldier, ScenarioSpell, ScenarioSpellGate } from "../defend/sim.ts";
export const SIEGE_MANA = { enabled: true, start: 1, cap: 8 } as const;
export const SPELL_MANA = { frostNova: 1, necromancy: 1, meteor: 2, reinforcements: 3 } as const;
export const manaFor = (unit: Soldier) => unit.kind === "flagBearer" ? 2 : 1;
export class SiegeMana {
  private amount: number = SIEGE_MANA.start;
  get value() {
    return this.amount;
  }
  canCast(spell: ScenarioSpell) {
    return this.amount >= SPELL_MANA[spell];
  }
  spend(spell: ScenarioSpell) {
    if (!this.canCast(spell)) return false;
    this.amount -= SPELL_MANA[spell];
    return true;
  }
  gain(amount = 1) {
    this.amount = Math.min(SIEGE_MANA.cap, this.amount + Math.max(0, Number.isFinite(amount) ? Math.floor(amount) : 0));
  }
  readonly gate: ScenarioSpellGate = {
    canCast: (spell) => this.canCast(spell),
    spend: (spell) => {
      this.spend(spell);
    },
  };
}
