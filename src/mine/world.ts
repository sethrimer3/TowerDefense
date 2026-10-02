/** The Mine's world: a side view of the ground as one grid of pixels (cells),
 * each holding one material, with falling-sand physics for the loose ones.
 * Dirt and grass fall and slide into steep mounds (each step one cell across
 * and two up); loose rocks drop straight down; stone, ore and bedrock stay
 * where they are. Only the chunks where something changed are stepped, so a
 * settled world costs almost nothing. */

export const W = 128;
export const H = 480;
export const CELLS = W * H;

/** Materials. Solid ones (GRASS..TIMBER) block miners; fixtures
 * (LADDER..LAMP) are built in open air and can be walked through. */
export const AIR = 0, GRASS = 1, DIRT = 2, ROCK = 3, STONE = 4, IRON = 5, GOLD = 6, BEDROCK = 7, TIMBER = 8, RUBBLE = 9,
  LADDER = 10, RAIL = 11, TORCH = 12, LAMP = 13;
export type Material = number;
export const MATERIAL_COUNT = 14;

export const isSolid = (m: Material) => m >= GRASS && m <= RUBBLE;
export const isFixture = (m: Material) => m >= LADDER;
export const isPassable = (m: Material) => m === AIR || m >= LADDER;
/** Falls and slides like sand. */
export const isLoose = (m: Material) => m === GRASS || m === DIRT || m === RUBBLE;
export const isOre = (m: Material) => m === IRON || m === GOLD;

/** Simulation ticks a miner spends digging out each material. */
export const DIG_TICKS: Record<number, number> = {
  [GRASS]: 40, [DIRT]: 45, [RUBBLE]: 40, [ROCK]: 110, [STONE]: 150, [IRON]: 190, [GOLD]: 200, [TIMBER]: 60,
};

const CHUNK = 16;
const CW = W / CHUNK, CH = H / CHUNK;

export const idx = (x: number, y: number) => y * W + x;
export const inBounds = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;

/** A fixed number in [0, 1) for a few integers, with no stream to consume. */
export function hash01(a: number, b: number, c: number) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 1D value noise in [0, 1): `scale` cells between control points. */
function noise1(x: number, scale: number, seed: number) {
  const i = Math.floor(x / scale), f = x / scale - i, t = f * f * (3 - 2 * f);
  return hash01(i, 0, seed) * (1 - t) + hash01(i + 1, 0, seed) * t;
}

/** The shape of a generated world, fixed by its seed: where the ground
 * started and where its stone begins, column by column. */
export type Strata = { surface: Int16Array; stoneTop: Int16Array };

export function strata(seed: number): Strata {
  const surface = new Int16Array(W), stoneTop = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    const s = 46 + (noise1(x, 26, seed) - 0.5) * 12 + (noise1(x, 9, seed + 1) - 0.5) * 4;
    surface[x] = Math.round(s);
    stoneTop[x] = surface[x] + 18 + Math.round(noise1(x, 14, seed + 2) * 12);
  }
  // Ease the ground into slopes the dirt holds (no step more than two up).
  for (let pass = 0; pass < 4; pass++)
    for (let x = 1; x < W; x++) {
      if (surface[x] - surface[x - 1] > 2) surface[x] = surface[x - 1] + 2;
      if (surface[x - 1] - surface[x] > 2) surface[x - 1] = surface[x] + 2;
    }
  return { surface, stoneTop };
}

/** The grid of a world fresh from its seed: sky, a grass skin, dirt with
 * rocks in it, then stone threaded with iron and, deeper, gold, over an
 * uneven floor of bedrock. */
export function generate(seed: number): Uint8Array {
  const cells = new Uint8Array(CELLS);
  const { surface, stoneTop } = strata(seed);
  const bedrock = (x: number) => H - 3 - Math.round(noise1(x, 6, seed + 3) * 4);
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      let m = AIR;
      if (y >= bedrock(x)) m = BEDROCK;
      else if (y >= stoneTop[x]) m = STONE;
      else if (y > surface[x]) m = DIRT;
      else if (y === surface[x]) m = GRASS;
      cells[idx(x, y)] = m;
    }
  const rand = (i: number) => hash01(i, 17, seed);
  // Rocks lodged in the dirt.
  for (let i = 0; i < 45; i++) {
    const x = Math.floor(rand(i * 3) * W), top = surface[x] + 2, depth = stoneTop[x] - top;
    if (depth <= 1) continue;
    const y = top + Math.floor(rand(i * 3 + 1) * depth), big = rand(i * 3 + 2) < 0.3;
    blob(cells, x, y, big ? 2 : 1, ROCK, seed + i, (m) => m === DIRT);
  }
  // Ore veins: short random walks through the stone, gold only deep down.
  const veins = (count: number, ore: Material, minDepth: number, length: number, salt: number) => {
    for (let i = 0; i < count; i++) {
      const r = (k: number) => hash01(i, k, seed + salt);
      let x = Math.floor(r(0) * W), y = minDepth + Math.floor(r(1) * (H - 8 - minDepth));
      const steps = 3 + Math.floor(r(2) * length);
      for (let s = 0; s < steps; s++) {
        blob(cells, x, y, r(10 + s) < 0.3 ? 2 : 1, ore, seed + salt + i * 31 + s, (m) => m === STONE);
        x += Math.floor(r(40 + s) * 3) - 1;
        y += Math.floor(r(80 + s) * 3) - 1;
      }
    }
  };
  const stoneMin = Math.min(...stoneTop);
  veins(420, IRON, stoneMin + 4, 9, 101);
  veins(160, GOLD, stoneMin + 30, 6, 202);
  return cells;
}

/** Fills a rough disc of `radius` around (cx, cy) with `m`, only over cells
 * `over` accepts. */
function blob(cells: Uint8Array, cx: number, cy: number, radius: number, m: Material, seed: number, over: (m: Material) => boolean) {
  for (let y = cy - radius; y <= cy + radius; y++)
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (!inBounds(x, y)) continue;
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d > radius * radius + 0.5 || (radius > 1 && d >= radius * radius && hash01(x, y, seed) < 0.5)) continue;
      if (over(cells[idx(x, y)])) cells[idx(x, y)] = m;
    }
}

/** The live grid and its physics. */
export class World {
  readonly cells: Uint8Array;
  /** Bumped on every change, so the renderer knows when to repaint. */
  version = 0;
  private awake = new Uint8Array(CW * CH);
  private wakeNext = new Uint8Array(CW * CH);
  private flip = false;

  constructor(cells: Uint8Array) {
    this.cells = cells;
    this.awake.fill(1);
  }

  get(x: number, y: number): Material {
    return inBounds(x, y) ? this.cells[idx(x, y)] : y >= H ? BEDROCK : x < 0 || x >= W ? BEDROCK : AIR;
  }
  set(x: number, y: number, m: Material) {
    if (!inBounds(x, y)) return;
    this.cells[idx(x, y)] = m;
    this.version++;
    this.wake(x, y);
  }
  /** Wakes the chunks around (x, y) for the next physics step. */
  wake(x: number, y: number) {
    const cx0 = Math.max(0, (x - 1) >> 4), cx1 = Math.min(CW - 1, (x + 1) >> 4);
    const cy0 = Math.max(0, (y - 2) >> 4), cy1 = Math.min(CH - 1, (y + 1) >> 4);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) this.wakeNext[cy * CW + cx] = 1;
  }

  /** One physics step: every loose cell in an awake chunk, bottom row first,
   * falls one cell if it can. Dirt slides diagonally only onto a drop of two
   * or more, so its slopes settle one across and two up; rock never slides.
   * `blocked` marks cells something else holds (miners), which nothing
   * falls into. */
  step(blocked?: (x: number, y: number) => boolean) {
    const cells = this.cells;
    this.flip = !this.flip;
    const dirs = this.flip ? [1, -1] : [-1, 1];
    for (let i = 0; i < this.awake.length; i++) {
      this.awake[i] |= this.wakeNext[i];
      this.wakeNext[i] = 0;
    }
    const open = (x: number, y: number) => inBounds(x, y) && cells[idx(x, y)] === AIR && !blocked?.(x, y);
    for (let cy = CH - 1; cy >= 0; cy--) {
      let any = false;
      for (let cx = 0; cx < CW; cx++) if (this.awake[cy * CW + cx]) any = true;
      if (!any) continue;
      for (let y = Math.min(H - 2, cy * CHUNK + CHUNK - 1); y >= cy * CHUNK; y--) {
        for (let k = 0; k < W; k++) {
          const x = this.flip ? W - 1 - k : k;
          if (!this.awake[cy * CW + (x >> 4)]) continue;
          const m = cells[idx(x, y)];
          if (m === ROCK) {
            if (open(x, y + 1)) this.move(x, y, x, y + 1);
            continue;
          }
          if (!isLoose(m)) continue;
          if (open(x, y + 1)) {
            this.move(x, y, x, y + 1);
            continue;
          }
          for (const d of dirs) {
            if (open(x + d, y) && open(x + d, y + 1) && open(x + d, y + 2)) {
              this.move(x, y, x + d, y + 1);
              break;
            }
          }
        }
      }
    }
    // A chunk sleeps until something wakes it again.
    this.awake.fill(0);
  }

  private move(x: number, y: number, nx: number, ny: number) {
    const cells = this.cells;
    cells[idx(nx, ny)] = cells[idx(x, y)];
    cells[idx(x, y)] = AIR;
    this.version++;
    this.wake(x, y);
    this.wake(nx, ny);
  }

  /** True while any chunk still has something to settle. */
  get settling() {
    return this.wakeNext.some((v) => v === 1);
  }
}

/** Run-length encodes a grid as base64: (value, run) byte pairs. */
export function encodeGrid(grid: Uint8Array): string {
  const bytes: number[] = [];
  for (let i = 0; i < grid.length; ) {
    const v = grid[i];
    let run = 1;
    while (run < 255 && i + run < grid.length && grid[i + run] === v) run++;
    bytes.push(v, run);
    i += run;
  }
  let s = "";
  for (let i = 0; i < bytes.length; i += 4096) s += String.fromCharCode(...bytes.slice(i, i + 4096));
  return btoa(s);
}

/** The grid `encodeGrid` wrote, or null unless it is well formed: exactly
 * `length` cells, each below `limit`. */
export function decodeGrid(text: unknown, length: number, limit: number): Uint8Array | null {
  if (typeof text !== "string") return null;
  let raw: string;
  try {
    raw = atob(text);
  } catch {
    return null;
  }
  if (raw.length % 2) return null;
  const out = new Uint8Array(length);
  let at = 0;
  for (let i = 0; i < raw.length; i += 2) {
    const v = raw.charCodeAt(i), run = raw.charCodeAt(i + 1);
    if (v >= limit || run === 0 || at + run > length) return null;
    out.fill(v, at, at + run);
    at += run;
  }
  return at === length ? out : null;
}
