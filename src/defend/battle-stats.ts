/** A defense's tally, wave by wave, for the summary shown when the keep
 * falls: the damage dealt and taken, the enemies' difficulty, the losses.
 * Kept beside the battle's state, never part of it, so replays are untouched. */

export type WaveStats = {
  wave: number;
  /** The wave's difficulty budget (`waveDifficulty`). */
  difficulty: number;
  /** Enemies sent at the city. */
  spawned: number;
  slain: number;
  /** Damage dealt to enemies. */
  dealt: number;
  /** Damage taken by the city's buildings and walls, the keep apart. */
  city: number;
  /** Damage taken by the keep. */
  keep: number;
  /** Troops and civilians killed. */
  troopsLost: number;
  civiliansLost: number;
  /** Buildings (wall stones included) knocked down. */
  fell: number;
  seconds: number;
};

export class BattleStats {
  readonly waves: WaveStats[] = [];

  /** Wave `wave` starts, worth `difficulty`, sending `spawned` enemies. */
  begin(wave: number, difficulty: number, spawned: number) {
    this.waves.push({ wave, difficulty, spawned, slain: 0, dealt: 0, city: 0, keep: 0, troopsLost: 0, civiliansLost: 0, fell: 0, seconds: 0 });
  }

  /** The wave being fought; a stand-in before the first, so nothing is lost. */
  get current(): WaveStats {
    if (!this.waves.length) this.begin(0, 0, 0);
    return this.waves[this.waves.length - 1];
  }

  /** Every wave's numbers added up. */
  totals(): Omit<WaveStats, "wave" | "difficulty"> {
    const t = { spawned: 0, slain: 0, dealt: 0, city: 0, keep: 0, troopsLost: 0, civiliansLost: 0, fell: 0, seconds: 0 };
    for (const w of this.waves) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += w[k];
    return t;
  }
}
