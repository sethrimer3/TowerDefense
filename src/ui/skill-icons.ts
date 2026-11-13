/** Pixel-art icons for the Mine's and the Library's Knowledge skills, shown
 * on their upgrade-tree nodes. Each is 13 × 13 art pixels with no outline:
 * `paintSkillIcon` draws the one-pixel outline around the opaque pixels
 * itself, onto a 15 × 15 canvas. Rows read one palette letter a pixel, `.`
 * clear; letters in `bare` (steam, rain) cast no outline. Skills without art
 * keep their text glyph (`skillFace`). */
import { SKILLS, type SkillId } from "../skill-trees.ts";

export const SKILL_ICON_SIZE = 13;
const OUTLINE = "#140c08";

type SkillArt = { palette: Record<string, string>; bare?: string; rows: string[] };

const ART: Partial<Record<SkillId, SkillArt>> = {
  coffee: {
    palette: { w: "#dfe8ee", l: "#efe6d4", m: "#bcae96", d: "#7d6c58", b: "#4a2810", c: "#7a4a24" },
    bare: "w",
    rows: [
      "....w.....w..",
      "...w.....w...",
      "...w......w..",
      "....w....w...",
      ".............",
      ".lcbbbbbbmd..",
      ".llllllllmdd.",
      ".llllllllmd.d",
      ".llllllllmd.d",
      ".llllllllmdd.",
      ".llllllmmmd..",
      ".lmmmmmmmmd..",
      "..ddddddddd..",
    ],
  },
  waterproofing: {
    palette: { b: "#8cc4f0", r: "#6b3f1f", R: "#a8682e", H: "#d49a52", p: "#8a5a2e", k: "#1e1a24", s: "#3a3442" },
    bare: "b",
    rows: [
      "..b...b...b..",
      ".b...b...b...",
      ".............",
      "......R......",
      ".....RHR.....",
      "....RHRRR....",
      "...RHRRRrR...",
      "..RHRRRRRrR..",
      ".rrrrrrrrrrr.",
      "b.p.kksss.p.b",
      "..p.kkkss.p..",
      "b.p.kkkks.p.b",
      "..ppppppppp..",
    ],
  },
  mineCarts: {
    palette: { r: "#6e6a66", R: "#9a948c", g: "#e0a92c", h: "#b9c2cc", i: "#6f7a86", k: "#3c434c", w: "#5c5650", x: "#b0aaa2", s: "#c4ccd4", t: "#7a4f2a" },
    rows: [
      "....rR.gR....",
      "..RrgRrRrgR..",
      ".hhhhhhhhhhh.",
      ".kiiiiiiiiik.",
      ".kihiiiiihik.",
      "..kiiiiiiik..",
      "..kiiiiiiik..",
      "...kkkkkkk...",
      ".............",
      "...w.....w...",
      "..wxw...wxw..",
      "...w.....w...",
      "sssssssssssss",
    ],
  },
  oreSense: {
    palette: { y: "#ffe27a", W: "#ffffff", d: "#4a4642", m: "#7c766e", l: "#a8a196", g: "#d8962a", G: "#ffd55a" },
    rows: [
      "..y..........",
      ".yWy......y..",
      "..y......yWy.",
      "..........y..",
      "....ddddd....",
      "...dllmgmd...",
      "..dlmgGmmmd..",
      ".dlmmmmmgGmd.",
      ".dmGgmmmmmmd.",
      ".dmmmmmmGgmd.",
      "..dmmmmmmmd..",
      "...ddddddd...",
      ".............",
    ],
  },
  fireproofWood: {
    palette: { L: "#d49a5a", M: "#a8693a", D: "#6e4220", b: "#24508c", B: "#4b8fd0", W: "#cfeaff" },
    rows: [
      ".............",
      "LLLLLLLLLLLM.",
      "MMDMMMMMDMMD.",
      "DDDDDDDDDDDD.",
      "LLLLLL.bbbbb.",
      "MMMDM.bBWBBBb",
      "DDDDD.bWBBBBb",
      "LLLLL.bBBBBBb",
      "MMDMM.bBBBBBb",
      "DDDDD..bBBBb.",
      "LLLLL..bBBBb.",
      "MMMDM...bBb..",
      "DDDDD....b...",
    ],
  },
  fireTraining: {
    palette: { b: "#4b8fd0", W: "#cfeaff", B: "#8fd0f6", k: "#5a5f66", h: "#9aa3ad", t: "#a8693a", T: "#d49a5a", D: "#6e4220" },
    rows: [
      "..W.....W....",
      ".W..W.W..W.W.",
      "...BWWWWB....",
      "..hBBBBBBBh..",
      "..hbbbbbbbh..",
      "..kkkkkkkkk..",
      "..TtDTtDTtD..",
      "..TtDTtDTtD..",
      "...kkkkkkk...",
      "...TtDTtDT...",
      "...TtDTtDT...",
      "...kkkkkkk...",
      ".............",
    ],
  },
  nightWatch: {
    palette: { m: "#d8dcf0", M: "#ffffff", i: "#3c3a40", h: "#7c7682", g: "#f2b84a", f: "#ff7a1a", F: "#fff3a8" },
    rows: [
      "..mm....i....",
      ".mM....i.i...",
      ".m......i....",
      ".m.....iii...",
      ".mM...iiiii..",
      "..mm..ihhhi..",
      "......igggi..",
      "......igfgi..",
      "......ifFfi..",
      "......igFgi..",
      "......igggi..",
      "......iiiii..",
      ".......iii...",
    ],
  },
  enchantedInk: {
    palette: { s: "#c7a8ff", S: "#fff6ff", q: "#e8e0d0", Q: "#ffffff", p: "#9a8a70", k: "#2a2236", v: "#5a2fa8", V: "#a878ff", g: "#e0c8ff" },
    rows: [
      "..........qQ.",
      ".s.......qQ..",
      "sSs.....qQq..",
      ".s......qQ...",
      "....s..qQ....",
      "......pq.....",
      "....kpkk.....",
      "....kvvk.....",
      "..kkkkkkkk...",
      ".kgvvvvvvvk..",
      ".kVvvvvvvvk..",
      ".kvvvvvvvvk..",
      "..kkkkkkkk...",
    ],
  },
  scholars: {
    palette: { y: "#ffd55a", o: "#e0581c", O: "#ffb23a", h: "#b9c2cc", m: "#6f7a86", d: "#3c434c", t: "#a8693a", T: "#6e4220" },
    bare: "y",
    rows: [
      "...y.....y...",
      ".....y.y...y.",
      "..y...y..y...",
      "....oOOOo....",
      "hhhhhhhhhhhh.",
      "..hmmmmmmmmd.",
      "....mmmmmd...",
      ".....mmmd....",
      ".....mmmd....",
      "....mmmmmd...",
      "..ddddddddd..",
      "..tTtTtTtTt..",
      "..TTTTTTTTT..",
    ],
  },
  tactician: {
    palette: { g: "#c08a2a", G: "#f2c95a", r: "#d03a3a", h: "#cfd6de", m: "#8b97a6", d: "#4b5563", t: "#a8693a", T: "#6e4220" },
    rows: [
      "G.G.G........",
      "GGGGG........",
      "GrGrG........",
      "ggggg........",
      ".....hhhhhhh.",
      ".....hhhhhhmd",
      ".....mmmmmmmd",
      "........tT...",
      "........tT...",
      "........tT...",
      "........tT...",
      "........tT...",
      "........TT...",
    ],
  },
};

/** Every drawn skill's art, for the test that keeps them square and in palette. */
export const SKILL_ART: Readonly<Partial<Record<SkillId, SkillArt>>> = ART;

/** `id`'s pixel icon canvas, or its bare text glyph. */
export const skillIcon = (id: SkillId): string => ART[id]
  ? `<canvas class="skill-icon" data-skill-icon="${id}" aria-hidden="true"></canvas>`
  : SKILLS[id].icon;

/** The tree-node face for `id`: its pixel icon, or its text glyph. */
export const skillFace = (id: SkillId): string => ART[id]
  ? skillIcon(id)
  : `<span class="banner-node-glyph" aria-hidden="true">${SKILLS[id].icon}</span>`;

/** Paints `id`'s art, outlined, onto `canvas` (15 × 15). */
export function paintSkillIcon(canvas: HTMLCanvasElement, id: SkillId) {
  const art = ART[id], size = SKILL_ICON_SIZE + 2;
  if (!art) return;
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d");
  if (!c) return;
  c.clearRect(0, 0, size, size);
  const at = (x: number, y: number) => art.rows[y - 1]?.[x - 1] ?? ".";
  const casts = (x: number, y: number) => { const ch = at(x, y); return ch !== "." && !art.bare?.includes(ch); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const ch = at(x, y);
    const fill = ch !== "." ? art.palette[ch]
      : casts(x - 1, y) || casts(x + 1, y) || casts(x, y - 1) || casts(x, y + 1) ? OUTLINE : undefined;
    if (!fill) continue;
    c.fillStyle = fill;
    c.fillRect(x, y, 1, 1);
  }
}

/** Paints every skill icon (`data-skill-icon`) under `root`. */
export function paintSkillIcons(root: ParentNode) {
  root.querySelectorAll<HTMLCanvasElement>("canvas[data-skill-icon]").forEach((c) => paintSkillIcon(c, c.dataset.skillIcon as SkillId));
}
