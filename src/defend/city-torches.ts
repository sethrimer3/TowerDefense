/** Shared solar schedule: a stable, independent +/- five-second offset per
 * fixture. Scenery hashes never draw from the battle's random streams. */
import { DAY_MS, skyAtTime } from '../daylight.ts';
import { hash01 } from './grid.ts';
export const TORCH_JITTER_MS = 5000;
function crossing(from: number, to: number, falling: boolean) {
  for (let k = 0; k < 28; k++) {
    const mid = (from + to) / 2, dark = skyAtTime(mid).sun.strength <= .035;
    if (dark === falling) to = mid; else from = mid;
  }
  return (from + to) / 2;
}
/** Begin when the last sunlight shadows are almost gone, before full dusk. */
export const TORCH_DUSK = crossing(DAY_MS * .42, DAY_MS * .5, true);
export const TORCH_DAWN = crossing(DAY_MS * .83, DAY_MS, false);
export const torchDelay = (id: number, x = 0, y = 0) => (hash01(id, Math.round(x * 8), Math.round(y * 8), 1773) * 2 - 1) * TORCH_JITTER_MS;
export function torchLevel(time: number, id: number, x = 0, y = 0) {
  const delay = torchDelay(id, x, y), on = TORCH_DUSK + delay, off = TORCH_DAWN + delay;
  const rise = Math.max(0, Math.min(1, (time - on) / 700));
  const fall = Math.max(0, Math.min(1, (off - time) / 700));
  return Math.min(rise, fall);
}
export const PERSON_TORCH_STRENGTH = .45;
