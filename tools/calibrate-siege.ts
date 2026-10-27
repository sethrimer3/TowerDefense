/** Reproducible offline baseline; never reads player saves. */
import { CampaignSim } from '../src/campaign/sim.ts';
import { generateCastle } from '../src/campaign/castles.ts';
import { defaultDefendSave } from '../src/defend/progress.ts';
const samples=Math.max(1,Math.min(100,Number(process.env.SIEGE_SAMPLES)||5));
const rows = [];
for (const mmr of [600,800,1000,1200,1400,1600]) {
  let wins=0, seconds=0;
  for(let seed=1;seed<=samples;seed++) {
    const d=defaultDefendSave();
    const castle=generateCastle(seed*7907,mmr);
    const sim=new CampaignSim('siege',0,[],d.owned,d.levels,castle);
    sim.start();
    for(let n=0;n<5000&&sim.phase==='battle';n++)sim.step(.05);
    wins+=Number(sim.phase==='won');seconds+=sim.elapsed;
  }
  rows.push({castleRating:mmr,wins,raids:samples,winRate:wins/samples,averageSeconds:Math.round(seconds/samples)});
}
console.log(JSON.stringify({ruleset:'native-defend-siege', model:'provisional legacy prior → native defense budget',army:'Starter Melee Guild + Ranged Guild, automatic bottom formation, no upgrades',rows},null,2));
