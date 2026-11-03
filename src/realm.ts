/** Economy buildings must be physically placed; stored crews survive lifting them. */
import type { Save } from './save.ts';
export type EconomyBuilding = 'mine' | 'library';
export const realmActive = (save: Save, kind: EconomyBuilding) => save.defend.layout.structures.some(s=>s.kind===kind);
export const realmPower = (save: Save, id: 'minerEfficiency'|'minerPower'|'librarianEfficiency'|'librarianPower') => 1 + (save.settings.devSmithy ? 50 : save.training[id] ?? 0) * .02;
