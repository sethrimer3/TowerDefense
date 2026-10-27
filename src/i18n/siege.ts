import type { TranslationRow } from './languages.ts';
/** Siege labels use explicit English fallback pending catalog translations. */
const row=<K extends string>(key:K,english:string)=>[key,english,english,english,english,english,english,english,english,english] as const satisfies TranslationRow;
export const SIEGE_TEXT=[
 row('siege.board','Enemy castle and infantry muster ground'),row('siege.editProfile','Edit profile'),row('siege.bot','BOT'),
 row('siege.ratings','{defense} defense / {mmr} MMR'),row('siege.record','Your attack MMR: {mmr} · {wins}/{games} wins'),
 row('siege.defense','Castle defense rating: {rating} (estimated).'),row('siege.commit','Starting a ranked raid commits it: defeat, forfeit or reload counts as a loss.'),row('siege.provisional','Defense ratings are provisional; castle layout and army matchups affect results.'),
 row('siege.lastResult','Last rated result: {result} · MMR {delta}. This target is available for unrated practice.'),
 row('siege.victory','Victory'),row('siege.defeat','Defeat'),row('siege.practice','Start practice'),row('siege.ranked','Start ranked raid'),row('siege.resume','Resume'),row('siege.pause','Pause'),
 row('siege.forfeit','Forfeit / rebuild'),row('siege.practiceAgain','Practice again'),row('siege.rebuild','Rebuild'),row('siege.next','Find next opponent'),
 row('siege.buyInfantry','Buy an infantry building in Tiles before starting a raid.'),row('siege.deployed','{count} deployed'),row('siege.empty','No infantry buildings owned. Buy a Melee Guild or Ranged Guild in Tiles.'),
 row('siege.ready','{count} infantry buildings deployed. Start the raid to release their troops.'),row('siege.won','Victory! The keep has fallen.'),row('siege.lost','Defeat. Rebuild your formation and try again.'),
 row('siege.paused','Paused · '),row('siege.status','Keep {hp}/{max} · {troops} troops · {seconds}s'),
] as const;
