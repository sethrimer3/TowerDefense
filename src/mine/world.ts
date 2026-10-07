/** The Mine's world: a side view of the ground as one grid of pixels (cells),
 * each holding one material, with falling-sand physics for the loose ones.
 * Dirt and grass fall and slide into steep mounds (each step one cell across
 * and two up); gravel and loose dirt slide at one across and one down; loose
 * rocks drop straight; stone, ore and bedrock stay where they are. Lava creeps
 * like a slow liquid. Water lies over the grid as a layer of its own, so it
 * can fill open air and run down ladders: it falls, finds the way downhill
 * and levels out. Only the chunks where something changed are stepped, so a
 * settled world costs almost nothing. */

/** The world's width and depth in cells: a prospect holds plenty of ore,
 * but not without end. */
export const W = 384;
export const H = 480;
export const CELLS = W * H;

/** Materials. Solid ones block miners and can be dug; fixtures (LADDER..LAMP)
 * are built in open air and can be walked through; lava is neither. */
export const AIR = 0, GRASS = 1, DIRT = 2, ROCK = 3, STONE = 4, COPPER = 5, GOLD = 6, BEDROCK = 7, TIMBER = 8, RUBBLE = 9,
  LADDER = 10, RAIL = 11, TORCH = 12, LAMP = 13, GRAVEL = 14, LOOSE = 15, LAVA = 16, SILVER = 17,
  HARD_STONE = 18, DENSE_STONE = 19, WORK_LAMP = 20;
export type Material = number;
export const MATERIAL_COUNT = 21;

const table = (...ms: Material[]) => {
  const t = new Uint8Array(MATERIAL_COUNT);
  for (const m of ms) t[m] = 1;
  return t;
};
const SOLID = table(GRASS, DIRT, ROCK, STONE, HARD_STONE, DENSE_STONE, COPPER, SILVER, GOLD, BEDROCK, TIMBER, RUBBLE, GRAVEL, LOOSE);
const FIXTURE = table(LADDER, RAIL, TORCH, LAMP, WORK_LAMP);
const LOOSE_SET = table(GRASS, DIRT, RUBBLE, GRAVEL, LOOSE);
/** Loose ground that slides on a drop of one, not two. */
const RUNNY = table(GRAVEL, LOOSE);
const WOOD = table(TIMBER, LADDER, RAIL, TORCH);
const SOIL = table(GRASS, DIRT, LOOSE, GRAVEL, RUBBLE);

export const isSolid = (m: Material) => SOLID[m] === 1;
export const isFixture = (m: Material) => FIXTURE[m] === 1;
export const isPassable = (m: Material) => m === AIR || FIXTURE[m] === 1;
/** Falls and slides like sand. */
export const isLoose = (m: Material) => LOOSE_SET[m] === 1;
export const isOre = (m: Material) => m === COPPER || m === SILVER || m === GOLD;
export const isStone = (m: Material) => m === STONE || m === HARD_STONE || m === DENSE_STONE;
/** Burns: shoring, ladders, the ties under the rails, torches. */
export const isWood = (m: Material) => WOOD[m] === 1;
/** Drinks up water lying on it. */
export const isSoil = (m: Material) => SOIL[m] === 1;

/** Simulation ticks a miner spends digging out each material. */
export const DIG_TICKS: Record<number, number> = {
  [GRASS]: 40, [DIRT]: 45, [RUBBLE]: 40, [ROCK]: 110, [STONE]: 330, [HARD_STONE]: 990, [DENSE_STONE]: 2970,
  [COPPER]: 180, [SILVER]: 190, [GOLD]: 200, [TIMBER]: 60, [GRAVEL]: 50, [LOOSE]: 35,
};

/** Depth below the surface, as a share of the mine's diggable ground. */
export function stoneAtDepth(y: number, surface: number): Material {
  const depth = (y - surface) / (H - 8 - surface);
  return depth >= 0.6 ? DENSE_STONE : depth >= 0.3 ? HARD_STONE : STONE;
}

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
 * rocks in it, then stone threaded with copper, deeper silver and deeper
 * still gold, natural caves winding through it (`caves`), over an uneven
 * floor of bedrock. */
export function generate(seed: number): Uint8Array {
  const cells = new Uint8Array(CELLS);
  const { surface, stoneTop } = strata(seed);
  const bedrock = (x: number) => H - 3 - Math.round(noise1(x, 6, seed + 3) * 4);
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      let m = AIR;
      if (y >= bedrock(x)) m = BEDROCK;
      else if (y >= stoneTop[x]) m = stoneAtDepth(y, surface[x]);
      else if (y > surface[x]) m = DIRT;
      else if (y === surface[x]) m = GRASS;
      cells[idx(x, y)] = m;
    }
  const rand = (i: number) => hash01(i, 17, seed);
  // Rocks lodged in the dirt.
  for (let i = 0; i < 135; i++) {
    const x = Math.floor(rand(i * 3) * W), top = surface[x] + 2, depth = stoneTop[x] - top;
    if (depth <= 1) continue;
    const y = top + Math.floor(rand(i * 3 + 1) * depth), big = rand(i * 3 + 2) < 0.3;
    blob(cells, x, y, big ? 2 : 1, ROCK, seed + i, (m) => m === DIRT);
  }
  // Ore veins: short random walks through the stone, silver lower down and
  // gold only deep.
  const veins = (count: number, ore: Material, minDepth: number, length: number, salt: number) => {
    for (let i = 0; i < count; i++) {
      const r = (k: number) => hash01(i, k, seed + salt);
      let x = Math.floor(r(0) * W), y = minDepth + Math.floor(r(1) * (H - 8 - minDepth));
      const steps = 3 + Math.floor(r(2) * length);
      for (let s = 0; s < steps; s++) {
        blob(cells, x, y, r(10 + s) < 0.3 ? 2 : 1, ore, seed + salt + i * 31 + s, isStone);
        x += Math.floor(r(40 + s) * 3) - 1;
        y += Math.floor(r(80 + s) * 3) - 1;
      }
    }
  };
  const stoneMin = Math.min(...stoneTop);
  veins(1260, COPPER, stoneMin + 4, 9, 101);
  veins(480, GOLD, stoneMin + 30, 6, 202);
  veins(620, SILVER, stoneMin + 16, 7, 303);
  // Pockets of loose dirt in the dirt and gravel in the stone: sealed in,
  // they hold until someone digs beside them.
  const pockets = (count: number, m: Material, top: (x: number) => number, bottom: (x: number) => number, over: Material, salt: number) => {
    for (let i = 0; i < count; i++) {
      const r = (k: number) => hash01(i, k, seed + salt);
      const x = Math.floor(r(0) * W), t = top(x), depth = bottom(x) - t;
      if (depth <= 2) continue;
      blob(cells, x, t + Math.floor(r(1) * depth), 1 + Math.floor(r(2) * 3), m, seed + salt + i, (c) => over === STONE ? isStone(c) : c === over);
    }
  };
  pockets(78, LOOSE, (x) => surface[x] + 4, (x) => stoneTop[x] - 1, DIRT, 303);
  pockets(210, GRAVEL, (x) => stoneTop[x] + 2, () => H - 12, STONE, 404);
  // Softer seams and harder lenses give the crew a reason to bend a tunnel.
  for (let i = 0; i < 440; i++) {
    const x = Math.floor(hash01(i, 1, seed + 419) * W);
    const y = stoneTop[x] + 5 + Math.floor(hash01(i, 2, seed + 419) * (H - 16 - stoneTop[x]));
    const host = stoneAtDepth(y, surface[x]);
    const softer = host === DENSE_STONE ? HARD_STONE : host === HARD_STONE ? STONE : HARD_STONE;
    blob(cells, x, y, 2 + Math.floor(hash01(i, 3, seed + 419) * 4), softer, seed + 419 + i, isStone);
  }
  caves(cells, seed, stoneTop);
  // Deep down, sealed pools of lava (never under the shaft, nor open to a
  // cave).
  for (let i = 0; i < 33; i++) {
    const r = (k: number) => hash01(i, k, seed + 505);
    const x = 4 + Math.floor(r(0) * (W - 8));
    if (Math.abs(x - W / 2) < 8) continue;
    const y = H - 150 + Math.floor(r(1) * 132), radius = 2 + Math.floor(r(2) * 3);
    if (openNear(cells, x, y, radius + 2)) continue;
    blob(cells, x, y, radius, LAVA, seed + 505 + i, (c) => isStone(c) || isOre(c) || c === GRAVEL);
  }
  return cells;
}

/** Whether any cell within `radius` of (cx, cy) is open air. */
function openNear(cells: Uint8Array, cx: number, cy: number, radius: number) {
  for (let y = cy - radius; y <= cy + radius; y++)
    for (let x = cx - radius; x <= cx + radius; x++) if (inBounds(x, y) && cells[idx(x, y)] === AIR) return true;
  return false;
}

/** Natural caves through the stone, as in Terraria: winding passages that
 * swell and pinch as they go (each a walk that mostly keeps its heading,
 * flatter than steep), open caverns with ragged walls, and stalactites and
 * stalagmites along their roofs and floors. They keep clear of the dirt
 * (which would fall in), the bedrock and the shaft's column. */
export function caves(cells: Uint8Array, seed: number, stoneTop: ArrayLike<number>) {
  const top = (x: number) => stoneTop[x] + 6, bottom = H - 12, shaft = W / 2;
  const surface = strata(seed).surface;
  const carve = (cx: number, cy: number, rx: number, ry: number, rough: number, salt: number) => {
    const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1), y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (x < 2 || x >= W - 2 || y < top(Math.max(0, Math.min(W - 1, x))) || y >= bottom || Math.abs(x - shaft) <= 3) continue;
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy > 1 - rough * hash01(x, y, salt)) continue;
        const i = idx(x, y), m = cells[i];
        if (isStone(m) || isOre(m) || m === GRAVEL) cells[i] = AIR;
      }
  };
  // Passages: walks that wander, swelling into chambers now and then.
  for (let w = 0; w < 30; w++) {
    const r = (k: number) => hash01(w, k, seed + 707);
    let x = 4 + r(0) * (W - 8);
    let y = top(Math.floor(x)) + 6 + r(1) * (bottom - top(Math.floor(x)) - 12);
    let hx = r(2) < 0.5 ? -1 : 1, hy = (r(3) - 0.5) * 0.8;
    const steps = 50 + Math.floor(r(4) * 170);
    for (let s = 0; s < steps; s++) {
      const swell = noise1(s, 14, seed + 711 + w), bulge = noise1(s, 37, seed + 733 + w);
      const radius = 1.1 + swell * 2.1 + (bulge > 0.78 ? (bulge - 0.78) * 22 : 0);
      carve(x, y, radius * 1.25, radius, 0.35, seed + 757 + w);
      // Keep the heading, turning a little, flatter than steep.
      hx += (hash01(w, s, seed + 761) - 0.5) * 0.5;
      hy += (hash01(w, s, seed + 769) - 0.5) * 0.45;
      const tx = Math.floor(x);
      if (y < top(Math.max(0, Math.min(W - 1, tx))) + 4) hy += 0.12;
      if (y > bottom - 6) hy -= 0.12;
      hy = Math.max(-0.7, Math.min(0.7, hy));
      const len = Math.sqrt(hx * hx + hy * hy) || 1;
      hx /= len;
      hy /= len;
      x += hx * 1.4;
      y += hy * 1.4;
      if (x < 3 || x > W - 4) hx = -hx;
    }
  }
  // Caverns: wide open rooms with ragged walls.
  for (let c = 0; c < 9; c++) {
    const r = (k: number) => hash01(c, k, seed + 808);
    const x = 10 + r(0) * (W - 20), rx = 6 + r(2) * 10, ry = 3.5 + r(3) * 5;
    const y = top(Math.floor(x)) + ry + 4 + r(1) * (bottom - top(Math.floor(x)) - ry * 2 - 8);
    carve(x, y, rx, ry, 0.45, seed + 811 + c);
    carve(x + (r(4) - 0.5) * rx, y - ry * 0.4, rx * 0.6, ry * 0.7, 0.5, seed + 813 + c);
  }
  // Gravel bared by a cave sets firm (else it would all run at once).
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = idx(x, y);
      if (cells[i] !== GRAVEL) continue;
      let open = false;
      for (let dy = -1; dy <= 1 && !open; dy++) for (let dx = -1; dx <= 1; dx++) if (cells[i + dy * W + dx] === AIR) open = true;
      if (open) cells[i] = stoneAtDepth(y, surface[x]);
    }
  // Stalactites hang from cave roofs, stalagmites rise from their floors.
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      const i = idx(x, y);
      if (cells[i] !== AIR || y < stoneTop[x] + 4) continue;
      const h = hash01(x, y, seed + 909);
      if (isStone(cells[i - W]) && cells[i + W] === AIR && cells[i + 2 * W] === AIR && h < 0.12) {
        cells[i] = cells[i - W];
        if (h < 0.04 && cells[i + 2 * W] === AIR && cells[i + 3 * W] === AIR) cells[i + W] = cells[i];
      } else if (isStone(cells[i + W]) && cells[i - W] === AIR && cells[i - 2 * W] === AIR && h > 0.93) cells[i] = cells[i + W];
    }
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

/** Told when a falling cell lands on something `blocked` holds (a miner):
 * the cell (x, y) it fell onto, and what fell. */
export type Hit = (x: number, y: number, m: Material) => void;

/** The live grid and its physics. */
export class World {
  readonly cells: Uint8Array;
  /** The water lying over the grid: 1 where a cell (open air or a fixture)
   * holds water. */
  readonly water: Uint8Array;
  /** Bumped on every change, so the renderer knows when to repaint. */
  version = 0;
  waterCount = 0;
  /** Physics steps taken. */
  steps = 0;
  private awake = new Uint8Array(CW * CH);
  private wakeNext = new Uint8Array(CW * CH);
  private flip = false;
  /** The step each cell's material, and its water, last arrived. */
  private moved = new Uint32Array(CELLS);
  private wet = new Uint32Array(CELLS);

  constructor(cells: Uint8Array, water?: Uint8Array) {
    this.cells = cells;
    this.water = water ?? new Uint8Array(CELLS);
    for (let i = 0; i < CELLS; i++) if (this.water[i] && !isPassable(cells[i])) this.water[i] = 0;
    for (let i = 0; i < CELLS; i++) this.waterCount += this.water[i];
    this.awake.fill(1);
  }

  get(x: number, y: number): Material {
    return inBounds(x, y) ? this.cells[idx(x, y)] : y >= H ? BEDROCK : x < 0 || x >= W ? BEDROCK : AIR;
  }
  wet01(x: number, y: number) {
    return inBounds(x, y) ? this.water[idx(x, y)] : 0;
  }
  set(x: number, y: number, m: Material) {
    if (!inBounds(x, y)) return;
    const i = idx(x, y);
    this.cells[i] = m;
    if (this.water[i] && !isPassable(m)) {
      this.water[i] = 0;
      this.waterCount--;
    }
    this.version++;
    this.wake(x, y);
  }
  /** Puts water in (x, y) or takes it out; water only lies in open cells. */
  setWater(x: number, y: number, on: boolean) {
    if (!inBounds(x, y)) return;
    const i = idx(x, y), v = on ? 1 : 0;
    if (this.water[i] === v || (on && !isPassable(this.cells[i]))) return;
    this.water[i] = v;
    this.waterCount += on ? 1 : -1;
    this.version++;
    this.wake(x, y);
  }
  /** Wakes the chunks around (x, y) for the next physics step. */
  wake(x: number, y: number) {
    const cx0 = Math.max(0, (x - 1) >> 4), cx1 = Math.min(CW - 1, (x + 1) >> 4);
    const cy0 = Math.max(0, (y - 2) >> 4), cy1 = Math.min(CH - 1, (y + 1) >> 4);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) this.wakeNext[cy * CW + cx] = 1;
  }

  /** One physics step over every awake chunk, bottom row first. Loose cells
   * fall one cell if they can, straight through fixtures (crushing them);
   * dirt slides diagonally only onto a drop of two or more, so its slopes
   * settle one across and two up, gravel and loose dirt onto a drop of one;
   * rock never slides. Lava creeps the same way water flows, a step in four,
   * and turns to stone where water touches it. Water falls, runs toward the
   * nearest drop and spreads where water presses on it from above.
   * `blocked` marks cells something else holds (miners), which nothing solid
   * falls into; `hit` hears of a falling cell landing on one. */
  step(blocked?: (x: number, y: number) => boolean, hit?: Hit) {
    const cells = this.cells, water = this.water, steps = ++this.steps;
    this.flip = !this.flip;
    const dirs = this.flip ? [1, -1] : [-1, 1];
    for (let i = 0; i < this.awake.length; i++) {
      this.awake[i] |= this.wakeNext[i];
      this.wakeNext[i] = 0;
    }
    const held = (x: number, y: number) => blocked !== undefined && blocked(x, y);
    const open = (x: number, y: number) => inBounds(x, y) && cells[idx(x, y)] === AIR && !held(x, y);
    const fallInto = (x: number, y: number) => inBounds(x, y) && isPassable(cells[idx(x, y)]) && !held(x, y);
    const wetOpen = (x: number, y: number) => inBounds(x, y) && isPassable(cells[idx(x, y)]) && !water[idx(x, y)];
    const lavaOpen = (x: number, y: number) => wetOpen(x, y) && !held(x, y);
    for (let cy = CH - 1; cy >= 0; cy--) {
      let any = false;
      for (let cx = 0; cx < CW; cx++) if (this.awake[cy * CW + cx]) any = true;
      if (!any) continue;
      for (let y = Math.min(H - 2, cy * CHUNK + CHUNK - 1); y >= cy * CHUNK; y--) {
        for (let k = 0; k < W; k++) {
          const x = this.flip ? W - 1 - k : k;
          if (!this.awake[cy * CW + (x >> 4)]) continue;
          const i = idx(x, y), m = cells[i];
          if (m === ROCK || isLoose(m)) {
            if (fallInto(x, y + 1)) this.move(x, y, x, y + 1);
            else {
              if (hit && inBounds(x, y + 1) && isPassable(cells[i + W]) && held(x, y + 1) && this.moved[i] === steps - 1) hit(x, y + 1, m);
              if (m !== ROCK)
                for (const d of dirs)
                  if (open(x + d, y) && open(x + d, y + 1) && (RUNNY[m] || open(x + d, y + 2))) {
                    this.move(x, y, x + d, y + 1);
                    break;
                  }
            }
          } else if (m === LAVA && this.moved[i] !== steps) this.creep(x, y, dirs, lavaOpen, steps);
          if (water[i] && this.wet[i] !== steps && isPassable(cells[i])) this.flow(x, y, dirs, wetOpen);
        }
      }
    }
    // A chunk sleeps until something wakes it again.
    this.awake.fill(0);
  }

  /** Water at (x, y) moves one cell: down, down a slope, or along toward a
   * drop (or wherever water above pushes it). */
  private flow(x: number, y: number, dirs: number[], open: (x: number, y: number) => boolean) {
    if (open(x, y + 1)) return this.pour(x, y, x, y + 1);
    for (const d of dirs) if (open(x + d, y) && open(x + d, y + 1)) return this.pour(x, y, x + d, y + 1);
    const pressed = y > 0 && this.water[idx(x, y - 1)] === 1;
    for (const d of dirs) {
      if (!open(x + d, y)) continue;
      if (pressed) return this.pour(x, y, x + d, y);
      for (let k = 2; k <= 24 && open(x + d * k, y); k++) if (open(x + d * k, y + 1)) return this.pour(x, y, x + d, y);
    }
  }
  private pour(x: number, y: number, nx: number, ny: number) {
    const a = idx(x, y), b = idx(nx, ny);
    this.water[a] = 0;
    this.water[b] = 1;
    this.wet[b] = this.steps;
    this.version++;
    // Water looks along its row for a drop, so wake the row's far reaches.
    for (let wx = x - 24; wx <= x + 24; wx += 16) this.wake(Math.max(0, Math.min(W - 1, wx)), y);
    this.wake(x + 24 < W ? x + 24 : W - 1, y);
    this.wake(nx, ny);
  }

  /** Lava at (x, y): quenched to stone by water beside it, else it moves
   * like water, but only one step in four (waking its chunk meanwhile). */
  private creep(x: number, y: number, dirs: number[], open: (x: number, y: number) => boolean, steps: number) {
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      if (!this.wet01(x + dx, y + dy)) continue;
      this.setWater(x + dx, y + dy, false);
      this.set(x, y, STONE);
      return;
    }
    let to = -1;
    if (open(x, y + 1)) to = idx(x, y + 1);
    else {
      for (const d of dirs) if (to < 0 && open(x + d, y) && open(x + d, y + 1)) to = idx(x + d, y + 1);
      const pressed = y > 0 && this.cells[idx(x, y - 1)] === LAVA;
      for (const d of dirs) {
        if (to >= 0 || !open(x + d, y)) continue;
        if (pressed) to = idx(x + d, y);
        for (let k = 2; k <= 6 && to < 0 && open(x + d * k, y); k++) if (open(x + d * k, y + 1)) to = idx(x + d, y);
      }
    }
    if (to < 0) return;
    if ((steps + x) % 4) return this.wake(x, y);
    const tx = to % W;
    this.move(x, y, tx, (to - tx) / W);
  }

  private move(x: number, y: number, nx: number, ny: number) {
    const cells = this.cells, a = idx(x, y), b = idx(nx, ny);
    cells[b] = cells[a];
    cells[a] = AIR;
    // Sinking into water lifts the water into the space left behind.
    if (this.water[b]) {
      this.water[b] = 0;
      this.water[a] = 1;
      this.wet[a] = this.steps;
    }
    this.moved[b] = this.steps;
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
