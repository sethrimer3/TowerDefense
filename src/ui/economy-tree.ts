/** One Knowledge tree shared by city tiles and the Study. Purchases keep the
 * existing skill saves, prices, prerequisites and staffed research clock. */
import type { Save } from '../save.ts';
import { realmActive, type EconomyBuilding } from '../realm.ts';
import { SUBJECTS } from '../upgrade-subjects.ts';
import { SKILLS, TREES, skillCost, type SkillId } from '../skill-trees.ts';
import { skillPurchase, skillRank } from '../progression.ts';
import { researchLeft, researchSeconds, startResearch } from '../research-jobs.ts';
import type { GraphNode } from './upgrade-graph.ts';
import { skillFace } from './skill-icons.ts';
export { isEconomyBuilding } from '../realm.ts';

export const economySkills = (kind: EconomyBuilding) => SUBJECTS.find(s => s.id === 'realm')!.topics.find(t => t.id === kind)!.skills!;
export const economyNode = (id: SkillId, rank: number) => `economy:${id}:${rank}`;

export function economyNodeSkill(kind: EconomyBuilding, node: string): { id: SkillId; rank: number } | undefined {
  const [prefix, id, r] = node.split(':'), rank = Number(r);
  if (prefix === 'economy' && economySkills(kind).includes(id as SkillId)
    && Number.isInteger(rank) && rank >= 1 && rank <= SKILLS[id as SkillId].max) return { id: id as SkillId, rank };
}

export function economyLabel(kind: EconomyBuilding, node: string) {
  const step = economyNodeSkill(kind, node);
  return step ? `${SKILLS[step.id].name} · Rank ${step.rank}` : kind === 'mine' ? 'Mine' : 'Library';
}

export function economyTree(save: Save, kind: EconomyBuilding): GraphNode[] {
  const root = `k:${kind}`, skills = economySkills(kind);
  const nodes: GraphNode[] = [{ id: root, state: 'owned', face: `<canvas width="48" height="48" data-icon="${kind}"></canvas>`, tag: kind === 'mine' ? 'Mine' : 'Library' }];
  for (const id of skills) {
    const skill = SKILLS[id], level = skillRank(save, id), available = skillPurchase(save, id).available;
    const prerequisite = TREES.flatMap(t => t.nodes).find(n => n.id === id)?.requires.find(p => skills.includes(p));
    // Keep the owned chain, its next rank and one locked preview visible.
    for (let rank = 1; rank <= Math.min(skill.max, level + 2); rank++) nodes.push({
      id: economyNode(id, rank),
      parent: rank > 1 ? economyNode(id, rank - 1) : prerequisite ? economyNode(prerequisite, 1) : root,
      state: rank <= level ? 'owned' : rank === level + 1 && available ? 'next' : 'locked',
      face: skillFace(id),
      tag: `${skill.name} ${rank}`, hue: kind === 'mine' ? 'hue-verdant' : 'hue-storm',
    });
  }
  return nodes;
}

export function economyAllocated(save: Save, kind: EconomyBuilding) {
  return economySkills(kind).reduce((sum, id) => sum + Array.from({ length: save.skills[id] }, (_, rank) => skillCost(id, rank)).reduce((a, b) => a + b, 0), 0);
}

export function startEconomyResearch(save: Save, kind: EconomyBuilding, node: string, now: number, researchers: number) {
  const step = economyNodeSkill(kind, node);
  return !!step && step.rank === skillRank(save, step.id) + 1 && realmActive(save, 'library')
    && startResearch(save, { kind: 'skill', id: step.id }, now, researchers);
}

const duration = (ms: number) => {
  const seconds = Math.ceil(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
};

export function economyCard(save: Save, kind: EconomyBuilding, node: string, researchers: number): string {
  const step = economyNodeSkill(kind, node), name = kind === 'mine' ? 'Mine' : 'Library';
  if (!step) return `<div class="ug-card-head"><b>${name}</b><small>Knowledge tree</small></div>
    <button class="ug-buy" data-economy-smithy="${kind}" ${realmActive(save, 'mine') ? '' : 'disabled'}>Smithy upgrades<small>Efficiency and power · metal equipment</small></button>`;
  const skill = SKILLS[step.id], level = skillRank(save, step.id), offer = skillPurchase(save, step.id), owned = step.rank <= level;
  const next = step.rank === level + 1, job = save.researchJob;
  const active = job?.kind === 'skill' && job.id === step.id && job.rank + 1 === step.rank;
  const unlocked = realmActive(save, 'library');
  const why = !unlocked ? 'Place the Library in your city to research.'
    : owned ? 'Researched.' : !next ? 'Research the preceding rank first.'
    : !offer.available ? 'Research the preceding branch first.' : active ? 'Research is in progress.'
    : job ? 'The lab is working on another upgrade.'
    : !researchers && !save.settings.instantResearch ? 'Assign a librarian to the lab to research.'
    : !offer.affordable ? `Needs ${offer.price} Knowledge.` : '';
  const enabled = !owned && next && offer.canBuy && !job && unlocked && (researchers > 0 || save.settings.instantResearch);
  const time = active ? researchLeft(save, researchers) : researchSeconds(step.rank - 1) * 1000 / Math.max(1, researchers);
  return `<div class="ug-card-head"><b>${skill.name} · Rank ${step.rank}</b><small>${level} / ${skill.max} ranks</small></div>
    <p>${skill.text}.</p><p>${why}</p>
    <button class="ug-buy" data-economy-buy="${node}" ${enabled ? '' : 'disabled'}>${owned ? 'Researched' : active ? 'Researching' : 'Learn'}<small>${owned ? '' : `${skillCost(step.id, step.rank - 1)} Knowledge`}</small>${owned ? '' : `<small>${Number.isFinite(time) ? duration(time) : 'Paused: assign a researcher'}</small>`}</button>`;
}
