// Battle fixtures for any path a building's kind has, including the spare
// ones no branch takes now (`specializations.ts`'s `ATTUNED`): the path is
// set on the placement directly and handed to the battle as it is, so
// their mechanics stay tested and a branch can swap one in later.
import type { BattlePaths, PathId } from "../src/knowledge-paths.ts";
import { pathTopicOf } from "../src/knowledge-paths.ts";
import { bonuses } from "../src/progression.ts";
import type { Save } from "../src/save.ts";

/** Sets structure `uid` on `path` at `rank`. */
export function wear(s: Save, uid: number, path: PathId, rank: number) {
  const p = s.defend.layout.structures.find((o) => o.uid === uid)!;
  p.path = path;
  p.rank = rank;
}
/** The save's bonuses, every structure fighting with the path it wears. */
export function battleBonuses(s: Save) {
  const b = bonuses(s), structurePaths: Record<number, BattlePaths> = { ...b.structurePaths };
  for (const st of s.defend.layout.structures) {
    const topic = pathTopicOf(st.kind);
    if (topic && st.path && st.rank) structurePaths[st.uid] = { [topic]: { path: st.path, rank: st.rank } };
  }
  return { ...b, structurePaths };
}
