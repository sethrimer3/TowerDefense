import type { TranslationRow } from './languages.ts';
/** Siege labels use explicit English fallback pending catalog translations. */
const row=<K extends string>(key:K,english:string)=>[key,english,english,english,english,english,english,english,english,english] as const satisfies TranslationRow;
export const SIEGE_TEXT=[
 ['siege.mana','Mana','Maná','Mana','Mana','Mana','Mana','マナ','마나','法力'],
 row('siege.manaStatus','{current} / {cap} mana'),row('siege.level','Lv. {level}'),row('siege.levelHint','Level {level}: 1 plus every Smithy upgrade it carries'),row('siege.manaCost','{cost} mana'),
 row('siege.mmr','{mmr} MMR'),row('siege.wins','{wins}/{games} wins'),row('siege.divisionProgress','Progress to the next division'),
 row('siege.mmrChange','MMR {delta}'),row('siege.promoted','Promoted to {rank}'),row('siege.demoted','Demoted to {rank}'),
 row('siege.castlePreview','Opponent castle preview'),row('siege.findMatch','Find Match'),row('siege.attack','Attack'),row('siege.back','Back'),row('siege.you','You'),
 row('siege.rankLabel','{rank} {division}'),
 row('siege.rank.bronze','Bronze'),row('siege.rank.silver','Silver'),row('siege.rank.gold','Gold'),row('siege.rank.platinum','Platinum'),row('siege.rank.diamond','Diamond'),row('siege.rank.master','Master'),row('siege.rank.grandmaster','Grandmaster'),
 row('siege.board','Enemy castle and approach'),row('siege.editProfile','Edit profile'),
 row('siege.commit','Starting a ranked raid commits it: defeat, forfeit or reload counts as a loss.'),row('siege.provisional','Defense ratings are provisional; castle layout and army matchups affect results.'),
 row('siege.lastResult','Last rated result: {result} · MMR {delta}. This target is available for unrated practice.'),
 row('siege.victory','Victory'),row('siege.defeat','Defeat'),row('siege.practice','Start practice'),row('siege.ranked','Start ranked raid'),row('siege.resume','Resume'),row('siege.pause','Pause'),
 row('siege.forfeit','Forfeit / rebuild'),row('siege.practiceAgain','Practice again'),row('siege.rebuild','Rebuild'),row('siege.next','Find Match'),
 row('siege.buyInfantry','Buy an infantry building in Tiles before starting a raid.'),row('siege.remaining','Remaining troops'),
 row('siege.ready','{count} infantry squads ready. Start the raid to release their troops.'),row('siege.won','Victory! The keep has fallen.'),row('siege.lost','Defeat. Rebuild your formation and try again.'),
 row('siege.paused','Paused · '),row('siege.status','Keep {hp}/{max} · {troops} troops · {seconds}s'),
] as const;
