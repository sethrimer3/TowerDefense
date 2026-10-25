/** The banner's existing Knowledge skills as one standalone, branching tree. */
import type { Save } from "../save.ts";
import { SKILLS, TREES } from "../skill-trees.ts";
import { skillPurchase } from "../progression.ts";
import { SUBJECTS } from "../upgrade-subjects.ts";
import type { GraphNode } from "./upgrade-graph.ts";

export function bannerTree(save: Save): GraphNode[] {
  const ids = SUBJECTS.flatMap(s => s.topics).find(t => t.id === "warBanner")!.skills!;
  return ids.map(id => {
    const skill = SKILLS[id], { level: rank, available } = skillPurchase(save, id);
    const parent = TREES.flatMap(t => t.nodes).find(n => n.id === id)!.requires[0];
    return {
      id, ...(parent ? { parent } : {}),
      state: rank ? "owned" : available ? "next" : "locked",
      face: `<span class="banner-node-glyph" aria-hidden="true">${skill.icon}</span>`,
      tag: `${rank} / ${skill.max}`,
    };
  });
}
