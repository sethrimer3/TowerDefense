/** Small adapters: completed, relevant Knowledge only. Pending jobs and
 * wallet changes do not change the artifact; no geometry enters a save. */
import type { Save } from '../save.ts';
import type { Topic } from '../upgrade-subjects.ts';
import { isSpell, pathsOf } from '../knowledge-paths.ts';
import type { CircleState } from './formation.ts';
export function studyCircle(save: Save, topic: Topic): CircleState {
  const upgrades = (topic.skills ?? []).map(id => ({ id: `skill:${id}`, rank: save.skills[id] }));
  if (isSpell(topic.id)) {
    for (const p of pathsOf(topic.id)) {
      const r = save.pathResearch[p.id];
      upgrades.push({ id: `path:${p.id}`, rank: r?.rank ?? 0 });
      if (r?.crowned) upgrades.push({ id: `crown:${p.id}`, rank: 1 });
    }
    const selected = save.spellPaths[topic.id];
    if (selected) upgrades.push({ id: `equipped:${selected}`, rank: 1 });
  }
  return { topic: `study:${topic.id}`, upgrades };
}
