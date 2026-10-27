/** Native settlement objectives and routing. Enemy attacks stay in Defend. */
import { generateCity, CellType, type Building } from "../defend/citygen.ts";
import { CELL_COUNT, CELLS_W, rectCells, hash, type Rect } from "../defend/grid.ts";
import { ENEMIES, enemySize } from "../defend/catalog.ts";
import type { DefendSim, Enemy } from "../defend/sim.ts";
import { cellAt, center, rectDist, type Point } from "../defend/pathing.ts";
import { routeToBuilding, routeToPoint, routeFlier } from "../defend/enemies.ts";
import { dist } from "../exact.ts";
import type { ambushField } from "./battlefield.ts";
import { buildingRect, type GridBuilding } from "./ambush-grid.ts";
type Field = ReturnType<typeof ambushField>;
type House = { rect: Rect; variant: number };
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function projection(path: Point[], p: Point) {
  let total = 0,
    best = Infinity,
    result = { point: path[0], segment: 1, progress: 0 };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      dx = b.x - a.x,
      dy = b.y - a.y,
      len = dist(dx, dy),
      t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len))),
      point = { x: a.x + dx * t, y: a.y + dy * t },
      d = dist(p.x - point.x, p.y - point.y);
    if (d < best) {
      best = d;
      result = { point, segment: i, progress: total + len * t };
    }
    total += len;
  }
  return result;
}
export class Outpost {
  breached = false;
  fallen = false;
  readonly initial: number;
  private version = -1;
  private alive = 0;
  private signature = "";
  private fractions: number[];
  private pristine: House[];
  private types: Uint8Array;
  constructor(
    readonly rect: Rect,
    readonly houses: number[],
    private engine: DefendSim,
    private field: Field,
    private index: number,
    private palisade = 1,
  ) {
    this.initial = houses.length;
    this.fractions = houses.map(() => 1);
    this.pristine = houses.map((id) => ({ rect: { ...engine.map.buildings[id].rect }, variant: engine.map.buildings[id].variant }));
    this.types = engine.map.type.slice();
  }
  get standing() {
    if (this.version !== this.engine.mapVersion) {
      this.version = this.engine.mapVersion;
      this.alive = this.houses.filter((id) => !this.engine.map.buildings[id].hidden && this.engine.hp[id] > 0).length;
    }
    return this.alive;
  }
  get health() {
    return this.fallen ? 0 : this.breached ? Math.min(1, this.standing / Math.max(1, this.initial)) : 1;
  }
  observe(e: Enemy) {
    if (!this.breached && e.hp > 0 && !ENEMIES[e.kind].flying && rectDist(this.rect, e.x, e.y) <= enemySize(e) / 2) this.breached = true;
    if (this.breached && !this.standing) this.fallen = true;
  }
  update(enemies: readonly Enemy[]) {
    for (const e of enemies) this.observe(e);
    if (this.breached && !this.standing) this.fallen = true;
  }
  replan(buildings: readonly GridBuilding[]) {
    const local = buildings.filter((b) => intersects(buildingRect(b), this.rect)),
      signature = local.map((b) => [b.id, b.kind, b.qx, b.qy].join(":")).join(",");
    if (signature === this.signature) return false;
    this.signature = signature;
    for (let i = 0; i < this.houses.length; i++) {
      const id = this.houses[i];
      if (!this.engine.map.buildings[id].hidden) this.fractions[i] = this.engine.hp[id] / Math.max(1, this.engine.maxHp[id]);
      this.engine.configureLot(id, "house", this.engine.map.buildings[id].rect, false);
    }
    let defs = this.pristine,
      types = this.types;
    if (local.length) {
      const city = new Uint8Array(CELL_COUNT),
        wall = new Uint8Array(CELL_COUNT),
        r = this.rect;
      for (const c of rectCells(r)) {
        const x = c % CELLS_W,
          y = Math.floor(c / CELLS_W);
        if (x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1) wall[c] = 1;
        else city[c] = 1;
      }
      const keep = { uid: 0, kind: "keep" as const, rect: { x: r.x + r.w / 2, y: r.y + r.h / 2, w: 0, h: 0 }, tx: 0, ty: 0, inside: false };
      const structures = local.map((b) => ({ uid: b.id, kind: b.kind, rect: buildingRect(b), tx: 0, ty: 0, inside: true }));
      const map = generateCity({ city, wall, structures: [keep, ...structures] }, hash(this.field.level.seed, this.index, 0x70));
      defs = map.buildings
        .filter((b) => b.kind === "house" && !b.cells.some((c) => this.field.road.has(c)))
        .slice(0, this.initial)
        .map((b) => ({ rect: b.rect, variant: b.variant }));
      types = map.type;
    }
    const players = new Set(buildings.map((b) => b.id)),
      map = this.engine.map;
    for (const c of rectCells(this.rect)) {
      const owner = map.owner[c];
      if (players.has(owner) || map.wall[c]) continue;
      map.owner[c] = -1;
      map.type[c] = this.field.road.has(c) ? CellType.ROAD : types[c] === CellType.HOUSE ? CellType.PARK : types[c];
      this.engine.solid[c] = this.engine.ownSolid[c] = this.engine.foeSolid[c] = map.type[c] === CellType.WATER ? 1 : 0;
    }
    for (let i = 0; i < this.houses.length; i++) {
      const id = this.houses[i],
        house = defs[i];
      if (!house) continue;
      map.buildings[id].variant = house.variant;
      this.engine.configureLot(id, "house", house.rect, true, this.fractions[i]);
      this.engine.hp[id] *= this.palisade;
      this.engine.maxHp[id] *= this.palisade;
    }
    this.engine.mapVersion++;
    return true;
  }
}
export class Outposts {
  readonly posts: Outpost[];
  private marks: number[];
  private routes = new WeakMap<Enemy, { segment: number; raiding?: number; rejoin?: Point }>();
  private fields = new Map<string, { version: number; until: number; field: Float64Array }>();
  constructor(
    readonly engine: DefendSim,
    readonly field: Field,
    palisade = 1,
  ) {
    this.posts = field.outposts.map((p, i) => new Outpost(p.rect, p.houses, engine, field, i, palisade));
    this.marks = this.posts.map((p) => projection(field.path, center(p.rect)).progress);
    for (const post of this.posts)
      for (const id of post.houses) {
        engine.hp[id] *= palisade;
        engine.maxHp[id] *= palisade;
      }
    for (const b of field.map.buildings)
      if (b.fence) {
        engine.hp[b.id] *= (0.1 * palisade) / engine.bonuses.wallHp;
        engine.maxHp[b.id] *= (0.1 * palisade) / engine.bonuses.wallHp;
      }
  }
  get stars() {
    return this.engine.keepHp() > 0 ? 1 + this.posts.filter((p) => !p.fallen).length : 0;
  }
  update() {
    for (const post of this.posts) post.update(this.engine.enemies);
  }
  replan(buildings: readonly GridBuilding[]) {
    const changed = this.posts.filter((p) => p.replan(buildings));
    if (changed.length) this.fields.clear();
    return changed.map((p) => p.rect);
  }
  private cached(key: string, goals: number[]) {
    const old = this.fields.get(key);
    if (old && old.version === this.engine.mapVersion && old.until > this.engine.time) return old.field;
    const field = this.engine.targetField(goals);
    if (this.fields.size >= 64) this.fields.delete(this.fields.keys().next().value!);
    this.fields.set(key, { version: this.engine.mapVersion, until: this.engine.time + 0.25, field });
    return field;
  }
  private target(e: Enemy) {
    for (const p of this.posts) p.observe(e);
    let route = this.routes.get(e);
    if (!route) {
      route = { segment: projection(this.field.path, e).segment };
      this.routes.set(e, route);
    }
    if (route.raiding !== undefined && this.posts[route.raiding].fallen) {
      const p = projection(this.field.path, e);
      route.segment = p.segment;
      route.rejoin = p.point;
      delete route.raiding;
    }
    if (route.rejoin) {
      if (cellAt(route.rejoin.x, route.rejoin.y) !== cellAt(e.x, e.y) && dist(route.rejoin.x - e.x, route.rejoin.y - e.y) > 0.7)
        return { point: route.rejoin, route };
      delete route.rejoin;
    }
    const progress = projection(this.field.path, e).progress;
    for (let i = 0; i < this.posts.length; i++)
      if (!this.posts[i].fallen && progress >= this.marks[i] - 10) {
        route.raiding = i;
        const post = this.posts[i],
          r = post.rect;
        if (rectDist({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, e.x, e.y) > 0) return { post: i, ids: [], point: center(post.rect), route };
        const ids = post.houses.filter((id) => !this.engine.map.buildings[id].hidden && this.engine.hp[id] > 0);
        return { post: i, ids, point: center(post.rect), route };
      }
    while (
      route.segment < this.field.path.length &&
      (cellAt(this.field.path[route.segment].x, this.field.path[route.segment].y) === cellAt(e.x, e.y) ||
        dist(this.field.path[route.segment].x - e.x, this.field.path[route.segment].y - e.y) < 0.7)
    )
      route.segment++;
    return { point: this.field.path[route.segment] ?? center(this.engine.keep.rect), keep: route.segment >= this.field.path.length - 1, route };
  }
  fieldFor(point: Point) {
    const e = point as Enemy,
      t = this.target(e);
    return this.targetField(t);
  }
  private targetField(t: ReturnType<Outposts["target"]>) {
    if (t.post !== undefined && t.ids?.length)
      return this.cached(
        "post:" + t.post,
        t.ids.flatMap((id) => this.engine.map.buildings[id].cells),
      );
    const c = cellAt(t.point.x, t.point.y);
    return this.cached("point:" + c, [c]);
  }
  route(e: Enemy, dt: number) {
    if (ENEMIES[e.kind].flying) {
      routeFlier(this.engine, e, dt);
      return true;
    }
    const t = this.target(e),
      field = this.targetField(t);
    if (t.post !== undefined && t.ids?.length) {
      const id = t.ids.reduce((a, b) =>
        rectDist(this.engine.map.buildings[b].rect, e.x, e.y) < rectDist(this.engine.map.buildings[a].rect, e.x, e.y) ? b : a,
      );
      routeToBuilding(this.engine, e, id, dt, field);
    } else if (t.keep) routeToBuilding(this.engine, e, this.engine.keepId, dt, field);
    else routeToPoint(this.engine, e, dt, field);
    return true;
  }
}
