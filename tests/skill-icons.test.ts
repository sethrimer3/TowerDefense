import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILL_ART, SKILL_ICON_SIZE, skillFace } from "../src/ui/skill-icons.ts";
import { economySkills } from "../src/ui/economy-tree.ts";

test("every Mine and Library skill has pixel art for its tree node", () => {
  for (const kind of ["mine", "library"] as const)
    for (const id of economySkills(kind)) {
      assert.ok(SKILL_ART[id], `${id} has art`);
      assert.match(skillFace(id), /data-skill-icon/);
    }
});

test("skill art is square, in palette, and carries no baked outline", () => {
  for (const [id, art] of Object.entries(SKILL_ART)) {
    assert.equal(art!.rows.length, SKILL_ICON_SIZE, id);
    for (const row of art!.rows) {
      assert.equal(row.length, SKILL_ICON_SIZE, id);
      for (const ch of row) if (ch !== ".") assert.ok(art!.palette[ch], `${id} uses ${ch}`);
    }
    // The outline is drawn by paintSkillIcon; the art keeps none of its colour.
    assert.ok(!Object.values(art!.palette).includes("#140c08"), id);
  }
});
