/** Reproducible offline baseline; never reads player saves. */
import { CampaignSim } from '../src/campaign/sim.ts';
import { generateCastle } from '../src/campaign/castles.ts';
import { defaultDefendSave } from '../src/defend/progress.ts';
const rows = [];
for (const mmr of [600,800,1000,1200,1400,1600]) {
  let wins=0, seconds=0;
  for(let seed=1;seed<=30;seed++) {
    const d=defaultDefendSave();
    const castle=generateCastle(seed*7907,mmr);
    const sim=new CampaignSim('siege',0,[],d.owned,d.levels,castle);
    sim.start();
    for(let n=0;n<5000&&sim.phase==='battle';n++)sim.step(.05);
    wins+=Number(sim.phase==='won');seconds+=sim.elapsed;
  }
  rows.push({castleRating:mmr,wins,raids:30,winRate:wins/30,averageSeconds:Math.round(seconds/30)});
}
console.log(JSON.stringify({ruleset:'siege-v1',army:'Starter Melee Guild + Ranged Guild, automatic bottom formation, no upgrades',rows},null,2));
