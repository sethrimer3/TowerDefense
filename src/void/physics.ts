/** Destructible terrain, structural support connectivity, detached debris
 * clusters, and matter restoration/reinforcement for Void Defense. */

import { dist } from "../exact.ts";
import { ORTHO } from "./grid.ts";
import { CellMaterial, type DebrisFragment } from "./model.ts";
import type { VoidWorld } from "./world.ts";

export class VoidPhysics {
  readonly debris: DebrisFragment[] = [];
  /** Set of building IDs that lost at least one pixel this tick and need a local connectivity check. */
  private readonly damagedBuildings = new Set<number>();

  /** Converts cell `idx` into Void and queues any affected building for structural support evaluation. */
  consumeCellIntoVoid(world: VoidWorld, idx: number, spawnDebris = true): void {
    const bId = world.buildingAt[idx];
    const prevMat = world.material[idx];
    world.material[idx] = CellMaterial.VOID;
    world.hp[idx] = 0;
    world.buildingAt[idx] = -1;
    world.grid.markIndexDirty(idx);

    if (bId >= 0) {
      this.damagedBuildings.add(bId);
    }

    if (spawnDebris && prevMat !== CellMaterial.VOID && this.debris.length < 240) {
      const x = world.grid.xOf(idx) + 0.5;
      const y = world.grid.yOf(idx) + 0.5;
      // Pull toward nearest Void neighbor or portal
      let vx = 0;
      let vy = 0;
      for (const [dx, dy] of ORTHO) {
        const nx = (x | 0) + dx;
        const ny = (y | 0) + dy;
        if (world.grid.inBounds(nx, ny) && world.material[world.grid.index(nx, ny)] === CellMaterial.VOID) {
          vx += dx * 2.5;
          vy += dy * 2.5;
        }
      }
      this.debris.push({
        x,
        y,
        vx,
        vy,
        color: prevMat === CellMaterial.SKYSCRAPER ? 0xffd08a4b : prevMat === CellMaterial.WALL ? 0xff9ea7b0 : 0xff7a828c,
        life: 0,
        maxLife: 0.65,
      });
    }
  }

  /** Evaluates structural stability for any building damaged this tick:
   * if a building's remaining pixels split into disconnected fragments and a tiny
   * splinter (< 3 pixels or < 18% of original footprint) loses support, it detaches
   * into salvage/debris. */
  stepStructuralSupport(world: VoidWorld, dt: number): void {
    if (this.damagedBuildings.size > 0) {
      for (const bId of this.damagedBuildings) {
        const b = world.buildings[bId];
        if (!b) continue;
        const intact = b.cells.filter((c) => world.buildingAt[c] === bId && world.material[c] !== CellMaterial.VOID && world.hp[c] > 0);
        if (intact.length === 0) continue;

        const intactSet = new Set<number>(intact);
        const visited = new Set<number>();
        const components: number[][] = [];

        for (const start of intact) {
          if (visited.has(start)) continue;
          const comp: number[] = [];
          const queue = [start];
          visited.add(start);
          while (queue.length > 0) {
            const curr = queue.pop()!;
            comp.push(curr);
            const cx = world.grid.xOf(curr);
            const cy = world.grid.yOf(curr);
            for (const [dx, dy] of ORTHO) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (!world.grid.inBounds(nx, ny)) continue;
              const nIdx = world.grid.index(nx, ny);
              if (intactSet.has(nIdx) && !visited.has(nIdx)) {
                visited.add(nIdx);
                queue.push(nIdx);
              }
            }
          }
          components.push(comp);
        }

        // Any tiny unsupported splinter (<= 2 cells when a larger main structure or Void surrounds it)
        // crumbles into salvage rubble and drifting fragments.
        if (components.length > 1) {
          components.sort((a, bComp) => bComp.length - aComp.length);
          for (let i = 1; i < components.length; i++) {
            const splinter = components[i];
            if (splinter.length <= 2) {
              for (const cIdx of splinter) {
                world.material[cIdx] = CellMaterial.SALVAGE;
                world.hp[cIdx] = 30;
                world.maxHp[cIdx] = 40;
                world.buildingAt[cIdx] = -1;
                world.grid.markIndexDirty(cIdx);
              }
            }
          }
        }
      }
      this.damagedBuildings.clear();
    }

    // Advance drifting debris fragments
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.life >= d.maxLife) {
        this.debris.splice(i, 1);
      }
    }
  }

  /** Deposits matter/land or ferrocrete wall in a circular radius around `(cx, cy)`.
   * Displaces Void cells, restores original baseline cells to their baseline state
   * if repaired, or creates `RECLAIMED` / `WALL` terrain (which diverts Void frontier
   * pressure without inflating original baseline score). */
  depositMatterDisc(
    world: VoidWorld,
    cx: number,
    cy: number,
    radius: number,
    asWall: boolean,
    hpBoost = 1.0,
  ): { displacedVoidCells: number; restoredCells: number } {
    let displacedVoidCells = 0;
    let restoredCells = 0;
    const rCeil = Math.ceil(radius);
    const { w, h } = world.grid;

    for (let y = Math.max(0, Math.floor(cy - rCeil)); y <= Math.min(h - 1, Math.ceil(cy + rCeil)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rCeil)); x <= Math.min(w - 1, Math.ceil(cx + rCeil)); x++) {
        if (dist(x - cx, y - cy) > radius) continue;
        const idx = y * w + x;
        const mat = world.material[idx];

        if (mat === CellMaterial.VOID || mat === CellMaterial.UNCLAIMED) {
          if (mat === CellMaterial.VOID) displacedVoidCells++;
          if (asWall) {
            world.material[idx] = CellMaterial.WALL;
            const wallHp = Math.min(255, Math.round(140 * hpBoost));
            world.hp[idx] = wallHp;
            world.maxHp[idx] = wallHp;
            world.buildingAt[idx] = -1;
          } else if (world.isBaselineCell[idx]) {
            // Reclaim original street/park/foundation
            const origMat = world.originalMaterial[idx];
            const origBld = world.originalBuildingAt[idx];
            world.material[idx] = origBld >= 0 ? origMat : CellMaterial.RECLAIMED;
            world.buildingAt[idx] = origBld;
            const restoredHp = Math.min(255, Math.round(65 * hpBoost));
            world.hp[idx] = restoredHp;
            world.maxHp[idx] = Math.max(world.maxHp[idx], restoredHp);
            restoredCells++;
          } else {
            // Sacrificial non-baseline island cell inside Void
            world.material[idx] = CellMaterial.RECLAIMED;
            const islandHp = Math.min(255, Math.round(75 * hpBoost));
            world.hp[idx] = islandHp;
            world.maxHp[idx] = islandHp;
            world.buildingAt[idx] = -1;
          }
          world.grid.markIndexDirty(idx);
        } else if (world.hp[idx] < world.maxHp[idx]) {
          // Reinforce existing damaged cell
          world.hp[idx] = Math.min(world.maxHp[idx], world.hp[idx] + Math.round(35 * hpBoost));
          world.grid.markIndexDirty(idx);
          restoredCells++;
        } else if (asWall && mat === CellMaterial.STREET && world.towerAt[idx] < 0) {
          // Upgrade exposed street to defensive wall
          world.material[idx] = CellMaterial.WALL;
          const wallHp = Math.min(255, Math.round(150 * hpBoost));
          world.hp[idx] = wallHp;
          world.maxHp[idx] = wallHp;
          world.grid.markIndexDirty(idx);
        }
      }
    }
    return { displacedVoidCells, restoredCells };
  }
}
