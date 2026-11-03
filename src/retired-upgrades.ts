/** Legacy shared combat purchases are refunded; individual building trees replace them. */
import { UPGRADES, upgradePrice, type UpgradeId } from './defend/catalog.ts';
import { SKILLS, skillCost, type SkillId } from './skill-trees.ts';
import { rankPrice } from './training-jobs.ts';
import type { TrainingId } from './progression.ts';
import type { Save } from './save.ts';
export const RETIRED_SKILLS: SkillId[]=['drillSergeant','veterans','bladework','fletchers','ballistics'];
export const RETIRED_TRAINING: TrainingId[]=['buildingHp','troopHp','troopDamage','drill','deployRange','towerDamage','towerReload','towerHp'];
export const RETIRED_FORGE: UpgradeId[]=['barracksCapacity','barracksTraining','soldierArms','archerDamage','archerRange','archerRate','cannonDamage','cannonRate','cannonSafe','watchRadius','wizardFlame','wizardIce','darkKeepCompact','chainReach','chainCount','soldierReach','archerSight','archerHunt','mageFireball','mageEmbers','palaceCompact','valkyrieReach'];
export function refundRetired(save: Save) {
 const compact=save.defend.layout.compact.filter(k=>k==="darkKeep"||k==="valkyriePalace");
 if(compact.length)save.defend.legacyCompact=[...new Set([...(save.defend.legacyCompact??[]),...compact])];
 for(const id of RETIRED_SKILLS){for(let r=0;r<save.skills[id];r++)save.knowledge+=skillCost(id,r);save.skills[id]=0;}
 for(const id of RETIRED_TRAINING){for(const j of save.trainingJobs.filter(j=>j.id===id))save.smithy[rankPrice(save.training[id])]+=j.paid??0;for(let r=0;r<save.training[id];r++)save.smithy[rankPrice(r)]+=1+5*r*r;save.training[id]=0;}
 for(const id of RETIRED_FORGE){const u=UPGRADES.find(u=>u.id===id)!;for(let r=0;r<save.defend.levels[id];r++){const p=(u.price??upgradePrice)(r);for(const k of ['copper','silver','gold'] as const)save.smithy[k]+=p[k]??0;}save.defend.levels[id]=0;}
 save.trainingJobs=save.trainingJobs.filter(j=>!RETIRED_TRAINING.includes(j.id));
 if(save.researchJob?.kind==='skill'&&RETIRED_SKILLS.includes(save.researchJob.id)){save.knowledge+=save.researchJob.paid;save.researchJob=null;}
 if(save.forgeJob?.kind==='upgrade'&&RETIRED_FORGE.includes(save.forgeJob.id)){for(const k of ['copper','silver','gold'] as const)save.smithy[k]+=save.forgeJob.paid[k]??0;save.forgeJob=null;}
}
