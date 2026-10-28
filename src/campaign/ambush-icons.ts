/** Ambush's little HUD sprites: the gold coin, a won star and the empty slot
 * a lost star leaves, as pixel art in black outlines. Each is painted once to
 * a small canvas and handed out as a data URL for `<img>` tags drawn at a
 * whole multiple of their size. Presentation only. */

const COIN = ["..kkkk..", ".kllyyk.", "klyyyydk", "klyddydk", "kyyddydk", "kyyyyddk", ".kddddk.", "..kkkk.."];
const STAR = ["...k...", "..kyk..", "kkklykk", "kyyyydk", ".kyyyk.", ".kykyk.", "kk...kk"];

const GOLD: Record<string, string> = { k: "#120c06", l: "#fff1b0", y: "#f2c14e", d: "#b5762a" };
const SLOT: Record<string, string> = { k: "#120c06", l: "#7a7064", y: "#4e463d", d: "#3a342d" };

export type AmbushIcon = "coin" | "star" | "slot";
const cache = new Map<AmbushIcon, string>();

/** Rows of one character a pixel: "." is clear, every other one a colour. */
export function iconPixels(icon: AmbushIcon): { rows: readonly string[]; colors: Record<string, string> } {
  return icon === "coin" ? { rows: COIN, colors: GOLD } : { rows: STAR, colors: icon === "star" ? GOLD : SLOT };
}

export function iconUrl(icon: AmbushIcon): string {
  let url = cache.get(icon);
  if (url) return url;
  const { rows, colors } = iconPixels(icon),
    canvas = document.createElement("canvas");
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const c = canvas.getContext("2d")!;
  rows.forEach((row, y) =>
    [...row].forEach((p, x) => {
      if (p === ".") return;
      c.fillStyle = colors[p];
      c.fillRect(x, y, 1, 1);
    }),
  );
  url = canvas.toDataURL();
  cache.set(icon, url);
  return url;
}

/** An `<img>` of an icon at `scale` screen pixels a pixel. */
export function iconImg(icon: AmbushIcon, scale = 2, extra = ""): string {
  const { rows } = iconPixels(icon);
  return `<img class="ambush-icon" src="${iconUrl(icon)}" width="${rows[0].length * scale}" height="${rows.length * scale}" alt="" ${extra}>`;
}
