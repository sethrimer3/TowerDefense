/** Existing Gunpowder research shown as three successive Knowledge ranks. */
import type { Save } from "../save.ts";
import { skillRank } from "../progression.ts";
import { SKILLS } from "../skill-trees.ts";
import type { GraphNode } from "./upgrade-graph.ts";

export function bombTree(save: Save): GraphNode[] {
  const rank = skillRank(save, "gunpowder");
  return [{ id: "bomb", state: "owned", face: '<canvas width="32" height="32" data-icon="bomb"></canvas>' },
    ...Array.from({ length: SKILLS.gunpowder.max }, (_, i): GraphNode => ({
      id: `gunpowder:${i}`, parent: i ? `gunpowder:${i - 1}` : "bomb",
      state: i < rank ? "owned" : i === rank ? "next" : "locked",
      face: `<span class="banner-node-glyph" aria-hidden="true">${SKILLS.gunpowder.icon}</span>`,
      tag: ["I", "II", "III"][i],
    })),
  ];
}
