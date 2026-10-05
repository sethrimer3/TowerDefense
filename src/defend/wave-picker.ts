/**
 * The starting wave picker: a parchment list of every wave a defense may
 * start on, each with its difficulty (the wave's enemy budget) and a bar
 * for how it compares with the furthest wave in reach.
 */
import { startingWave, waveReach, type DefendSave } from "./progress.ts";
import { waveDifficulty } from "./waves.ts";
import { isBossWave } from "./weather.ts";

/** A difficulty in a few characters: 950, 12.4k, 1.2M. */
export function difficultyLabel(n: number): string {
  if (n < 10_000) return n.toLocaleString("en-US");
  const units: [string, number][] = [["k", 1e3], ["M", 1e6], ["B", 1e9], ["T", 1e12]];
  let [unit, size] = units[0];
  for (const u of units) if (n >= u[1]) [unit, size] = u;
  const v = n / size;
  return `${v >= 100 ? Math.floor(v) : Math.floor(v * 10) / 10}${unit}`;
}

/** The dialog's markup: the waves in reach, the chosen one pressed. */
export function wavePickerHTML(save: DefendSave): string {
  const reach = waveReach(save), chosen = startingWave(save);
  const top = Math.log(waveDifficulty(reach) + 1);
  const rows: string[] = [];
  for (let wave = 1; wave <= reach; wave++) {
    const difficulty = waveDifficulty(wave), boss = isBossWave(wave);
    const share = top > 0 ? Math.max(4, Math.round((Math.log(difficulty + 1) / top) * 100)) : 100;
    rows.push(`<button class="wave-row${boss ? " boss" : ""}" data-wave="${wave}" aria-pressed="${wave === chosen}">` +
      `<span class="wave-name">Wave <b>${wave}</b>${boss ? `<em>Boss</em>` : ""}</span>` +
      `<span class="wave-bar" aria-hidden="true"><i style="width:${share}%"></i></span>` +
      `<span class="wave-difficulty" title="Difficulty ${difficulty.toLocaleString("en-US")}"><small>Difficulty</small>${difficultyLabel(difficulty)}</span></button>`);
  }
  return `<small>THE WATCH AWAITS ITS ORDERS</small><h2 id="defend-wave-title">Starting wave</h2>
    <p>Begin the next defense on any wave up to <b>${reach}</b>. Each wave's difficulty is how much the enemy brings against the city.</p>
    <div class="wave-list">${rows.join("")}</div>
    <div class="dialog-actions"><button data-wave-close>Close</button></div>`;
}
