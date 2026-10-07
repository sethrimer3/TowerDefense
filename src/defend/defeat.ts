/** The summary when the keep falls: how the run went in a few numbers and
 * three small charts, one bar a wave (damage dealt, damage the city took,
 * the enemies' difficulty), drawn as SVG on the parchment. Explicit close buttons
 * return to building. Pure HTML strings, so a test can read them. */
import type { BattleStats, WaveStats } from "./battle-stats.ts";

export type DefeatSummary = { wave: number; best: number; record: number; stats: BattleStats };

/** 12,400 → "12.4k", 1,200,000 → "1.2M". */
export function short(n: number) {
  const v = Math.round(n);
  if (v < 10_000) return v.toLocaleString("en-US");
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 100_000 ? 1 : 0)}k`;
  if (v < 1e9) return `${(v / 1e6).toFixed(1)}M`;
  return `${(v / 1e9).toFixed(1)}B`;
}

/** A pixel-art cross for the close button (the fonts have no ×). */
const CROSS = `<svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shape-rendering="crispEdges">${[0, 1, 2, 3, 4, 5, 6]
  .map((i) => `<rect x="${i}" y="${i}" width="1" height="1"/><rect x="${6 - i}" y="${i}" width="1" height="1"/>`)
  .join("")}</svg>`;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function defeatHTML({ wave, best, record, stats }: DefeatSummary): string {
  const waves = stats.waves.filter((w) => w.wave > 0);
  const t = stats.totals();
  const held = Math.max(0, wave - (waves[0]?.wave ?? wave));
  const note = record
    ? `<em>New record this run: wave ${record}</em>`
    : wave - 1 < best ? `<em>Strengthen the city in the Smithy and the Study, then try again.</em>` : "";
  const tile = (label: string, value: string) => `<div class="defeat-stat"><b>${value}</b><small>${label}</small></div>`;
  const charts = waves.length
    ? `<div class="defeat-charts">${chart("Damage dealt", waves, (w) => w.dealt, "dealt")}${chart("Damage taken", waves, (w) => w.city + w.keep, "taken")}${chart("Enemy difficulty", waves, (w) => w.difficulty, "difficulty")}</div>`
    : "";
  return `<button class="defeat-close" data-defeat-close type="button" aria-label="Close and rebuild the city">${CROSS}</button>
    <div class="defeat-body"><strong>The keep has fallen</strong>
    <span>Fell during wave ${wave} · best ${best}</span>${note}
    <div class="defeat-stats">${[
      tile("waves held", String(held)),
      tile("enemies slain", short(t.slain)),
      tile("damage dealt", short(t.dealt)),
      tile("damage taken", short(t.city + t.keep)),
      tile("troops lost", short(t.troopsLost)),
      tile("buildings fell", short(t.fell)),
      tile("civilians lost", short(t.civiliansLost)),
      tile("time", clock(t.seconds)),
    ].join("")}</div>${charts}</div>
    <div class="defeat-actions"><button type="button" data-defeat-close>Close</button></div>`;
}

/** One measure as a bar a wave, scaled to its own largest; the latest
 * waves when there are more than fit. */
function chart(title: string, all: WaveStats[], value: (w: WaveStats) => number, kind: string) {
  const waves = all.slice(-30);
  const W = 120, H = 48, gap = 1, base = H - 10;
  const top = Math.max(1, ...waves.map(value));
  // Thin bars: a few waves don't swell into blocks.
  const bw = Math.min(16, Math.max(2, (W - gap * (waves.length - 1)) / waves.length));
  const bars = waves
    .map((w, i) => {
      const v = value(w), h = v > 0 ? Math.max(2, (v / top) * (base - 4)) : 0;
      const x = i * (bw + gap);
      return `<g><rect class="defeat-hit" x="${x.toFixed(1)}" y="0" width="${(bw + gap).toFixed(1)}" height="${H}"/><path class="defeat-bar" d="${barPath(x, base, bw, h)}"/><title>Wave ${w.wave}: ${short(v)}</title></g>`;
    })
    .join("");
  const first = waves[0].wave, last = waves[waves.length - 1].wave;
  return `<figure class="defeat-chart defeat-${kind}"><figcaption>${title} <small>· most ${short(top)}</small></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title} by wave, from wave ${first} to ${last}, at most ${short(top)}">
      <line class="defeat-axis" x1="0" x2="${W}" y1="${base + 0.5}" y2="${base + 0.5}"/>${bars}
      <text x="0" y="${H - 1}">${first}</text>${last !== first ? `<text x="${(waves.length - 1) * (bw + gap) + bw}" y="${H - 1}" text-anchor="end">${last}</text>` : ""}
    </svg></figure>`;
}

/** A bar standing on the baseline with its top corners rounded. */
function barPath(x: number, base: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(2, w / 2, h);
  const y = base - h;
  return `M${x.toFixed(1)} ${base}V${(y + r).toFixed(1)}Q${x.toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)}H${(x + w - r).toFixed(1)}Q${(x + w).toFixed(1)} ${y.toFixed(1)} ${(x + w).toFixed(1)} ${(y + r).toFixed(1)}V${base}Z`;
}
