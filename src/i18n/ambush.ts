import type { TranslationRow } from './languages.ts';
/** New Ambush controls use English fallback until their catalog translations land. */
const row = <K extends string>(key: K, english: string) => [key, english, english, english, english, english, english, english, english, english] as const satisfies TranslationRow;
export const AMBUSH_TEXT = [
 row('ambush.levelSelect','Level select'), row('ambush.levelColumn','Level {level}'), row('ambush.stars','{stars}/{total} stars'),
 row('ambush.gold','gold'), row('ambush.buildings','Buildings'), row('ambush.enemiesLeft','{count} enemies left'), row('ambush.goldEarned','Gold earned'), row('ambush.placeFirst','Place a building beside the road first.'),
 row('ambush.locked','Locked'), row('ambush.starTree','Star tree'), row('ambush.outpost1','Outpost 1'), row('ambush.outpost2','Outpost 2'), row('ambush.keep','Keep'),
 row('ambush.sendWave','Send next wave'), row('ambush.autoSend','Auto-send'), row('ambush.wave','Wave {wave}/{total}'), row('ambush.retry','Retry'), row('ambush.next','Next level'),
 row('ambush.close','Close'), row('ambush.sell','Sell ({gold} gold)'), row('ambush.kills','Kills'), row('ambush.damage','Total damage'), row('ambush.dps','DPS this wave'),
 row('ambush.upgrade','Upgrade'), row('ambush.pause','Pause'), row('ambush.resume','Resume'), row('ambush.victory','Victory'), row('ambush.defeat','Defeat'),
] as const;
