/** Seeded procedural metropolitan city generator for Void Defense.
 * Generates a year-3000 New York-style dense urban grid:
 * - Hierarchical street network: 3-cell arterial avenues, 2-cell cross streets,
 *   1-cell service alleys, transit corridors, and green/concrete plazas.
 * - Hundreds of distinct small and medium structures: stepped skyscrapers with
 *   stylized height (1 to 28 stories), mid-rise commercial blocks, industrial
 *   sectors, and rooftop infrastructure.
 * - Crisis-start breach zones around initial Void portals: pre-damaged building
 *   edges, salvage debris, and the baseline scorable city value present when
 *   the Resistance arrives on scene. */

import { dist } from "../exact.ts";
import { TICK_HZ } from "./config.ts";
import { hash, hash01, VoidGrid } from "./grid.ts";
import {
  CellMaterial,
  type DistrictKind,
  type MetroBuilding,
  type ScenarioConfig,
  type VoidPortal,
} from "./model.ts";

export class VoidWorld {
  readonly grid: VoidGrid;
  readonly seed: number;
  /** Current material per cell (`CellMaterialId`). */
  readonly material: Uint8Array;
  /** Current structural HP per cell (0..255). */
  readonly hp: Uint8Array;
  /** Maximum structural HP per cell (0..255). */
  readonly maxHp: Uint8Array;
  /** Building ID occupying each cell (`-1` if street/park/void/unclaimed). */
  readonly buildingAt: Int16Array;
  /** Original building ID at start of run (`-1` if not originally a building). */
  readonly originalBuildingAt: Int16Array;
  /** Original material at start of run (used to restore baseline city cells). */
  readonly originalMaterial: Uint8Array;
  /** `1` if this cell was part of the scorable city/land when the Resistance arrived.
   * Extra player-created land outside this mask can divert Void work but cannot
   * inflate the survival percentage above 100%. */
  readonly isBaselineCell: Uint8Array;
  /** Scorable value of each baseline cell (buildings worth more than streets/parks). */
  readonly baselineCellValue: Uint8Array;
  /** Whether a placed Resistance tower currently occupies this cell (`uid`, or `-1`). */
  readonly towerAt: Int16Array;

  readonly buildings: MetroBuilding[] = [];
  readonly portals: VoidPortal[] = [];
  /** Total baseline scorable value when gameplay control begins. */
  readonly totalBaselineValue: number;

  constructor(scenario: ScenarioConfig) {
    this.grid = new VoidGrid(scenario.worldW, scenario.worldH);
    this.seed = scenario.seed;
    const n = this.grid.count;
    this.material = new Uint8Array(n);
    this.hp = new Uint8Array(n);
    this.maxHp = new Uint8Array(n);
    this.buildingAt = new Int16Array(n).fill(-1);
    this.originalBuildingAt = new Int16Array(n).fill(-1);
    this.originalMaterial = new Uint8Array(n);
    this.isBaselineCell = new Uint8Array(n);
    this.baselineCellValue = new Uint8Array(n);
    this.towerAt = new Int16Array(n).fill(-1);

    this.generateMetropolis(scenario);
    this.applyInitialBreaches(scenario);
    const totalValue = this.snapshotBaseline();
    let totalHp = 0;
    for (let i = 0; i < n; i++) {
      if (this.isBaselineCell[i]) totalHp += this.hp[i] * this.baselineCellValue[i];
    }
    this.totalBaselineValue = totalValue;
    this.totalBaselineWeightedHp = Math.max(1, totalHp);
  }
  readonly totalBaselineWeightedHp: number;

  private generateMetropolis(scenario: ScenarioConfig): void {
    const { w, h } = this.grid;
    const seed = this.seed;

    // 1. Lay down base urban pavement & archipelago water/void channels if applicable.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (scenario.id === "archipelagoCity") {
          // Two river channels with arterial bridges
          const river1 = Math.abs(y - Math.floor(h * 0.36) - Math.round(Math.sin(x * 0.08) * 3)) <= 3;
          const river2 = Math.abs(y - Math.floor(h * 0.68) - Math.round(Math.cos(x * 0.07) * 3)) <= 3;
          const bridgeX = Math.abs(x - Math.floor(w * 0.25)) <= 2 || Math.abs(x - Math.floor(w * 0.5)) <= 3 || Math.abs(x - Math.floor(w * 0.75)) <= 2;
          if ((river1 || river2) && !bridgeX) {
            this.material[idx] = CellMaterial.UNCLAIMED;
            this.hp[idx] = 20;
            this.maxHp[idx] = 20;
            continue;
          }
        }
        this.material[idx] = CellMaterial.STREET;
        this.hp[idx] = 45;
        this.maxHp[idx] = 45;
      }
    }

    // 2. Define hierarchical Manhattan avenues (vertical) and cross-streets (horizontal).
    // Avenues every ~22-26 cells (width 3); cross-streets every ~14-18 cells (width 2).
    const xBlocks: { x0: number; x1: number }[] = [];
    let cx = 4;
    let colIdx = 0;
    while (cx < w - 8) {
      const bw = 16 + (hash(seed, 101, colIdx) % 8); // 16..23 cells wide
      const x1 = Math.min(w - 4, cx + bw);
      if (x1 - cx >= 8) xBlocks.push({ x0: cx, x1 });
      const aveW = colIdx % 2 === 0 ? 3 : 2;
      cx = x1 + aveW;
      colIdx++;
    }

    const yBlocks: { y0: number; y1: number }[] = [];
    let cy = 4;
    let rowIdx = 0;
    while (cy < h - 8) {
      const bh = 11 + (hash(seed, 202, rowIdx) % 6); // 11..16 cells tall
      const y1 = Math.min(h - 4, cy + bh);
      if (y1 - cy >= 6) yBlocks.push({ y0: cy, y1 });
      const stW = rowIdx % 3 === 0 ? 3 : 2;
      cy = y1 + stW;
      rowIdx++;
    }

    // 3. Subdivide each city block into dense metropolitan parcels (skyscrapers, mid-rises, plazas, alleys).
    const centerX = w * 0.5;
    const centerY = h * 0.5;

    for (let by = 0; by < yBlocks.length; by++) {
      for (let bx = 0; bx < xBlocks.length; bx++) {
        const blkX0 = xBlocks[bx].x0;
        const blkX1 = xBlocks[bx].x1;
        const blkY0 = yBlocks[by].y0;
        const blkY1 = yBlocks[by].y1;
        const blkW = blkX1 - blkX0;
        const blkH = blkY1 - blkY0;

        const distFromCenter = dist((blkX0 + blkX1) * 0.5 - centerX, (blkY0 + blkY1) * 0.5 - centerY) / Math.max(w, h);
        const blkRoll = hash01(seed, 303, bx, by);

        let district: DistrictKind = "midtown";
        if (distFromCenter < 0.24) district = "downtown";
        else if (blkRoll < 0.1) district = "plaza";
        else if (distFromCenter > 0.38 && blkRoll < 0.45) district = "industrial";
        else if (blkRoll > 0.72) district = "residential";

        if (district === "plaza") {
          // Urban green park / civic plaza with walkways and a monument/pavilion
          for (let py = blkY0; py < blkY1; py++) {
            for (let px = blkX0; px < blkX1; px++) {
              const idx = py * w + px;
              if (this.material[idx] === CellMaterial.UNCLAIMED) continue;
              const border = px === blkX0 || px === blkX1 - 1 || py === blkY0 || py === blkY1 - 1;
              this.material[idx] = border ? CellMaterial.STREET : CellMaterial.PARK;
              this.hp[idx] = border ? 45 : 35;
              this.maxHp[idx] = this.hp[idx];
            }
          }
          // Add 1 small civic pavilion in the middle of the plaza if large enough
          if (blkW >= 10 && blkH >= 8) {
            this.addBuilding(
              blkX0 + Math.floor(blkW / 2) - 2,
              blkY0 + Math.floor(blkH / 2) - 2,
              4,
              4,
              "plaza",
              false,
              4,
              hash(seed, 399, bx, by),
            );
          }
          continue;
        }

        // Subdivide block with an internal 1-cell service alley (horizontal or vertical)
        // and pack 4 to 10 distinct small/medium buildings per block.
        const hasHAlley = blkH >= 11 && hash01(seed, 401, bx, by) < 0.75;
        const alleyY = hasHAlley ? blkY0 + Math.floor(blkH / 2) : -1;

        const rowSlices: { y0: number; y1: number }[] = hasHAlley
          ? [
              { y0: blkY0, y1: alleyY },
              { y0: alleyY + 1, y1: blkY1 },
            ]
          : [{ y0: blkY0, y1: blkY1 }];

        for (let sIdx = 0; sIdx < rowSlices.length; sIdx++) {
          const sy0 = rowSlices[sIdx].y0;
          const sy1 = rowSlices[sIdx].y1;
          const sh = sy1 - sy0;
          if (sh < 3) continue;

          let px = blkX0;
          let lotIdx = 0;
          while (px < blkX1 - 2) {
            const maxLotW = blkX1 - px;
            if (maxLotW < 3) break;
            const wantW =
              district === "downtown"
                ? 4 + (hash(seed, 501, bx, by, sIdx, lotIdx) % 5) // 4..8
                : district === "industrial"
                  ? 5 + (hash(seed, 502, bx, by, sIdx, lotIdx) % 6) // 5..10
                  : 3 + (hash(seed, 503, bx, by, sIdx, lotIdx) % 4); // 3..6
            const lw = Math.min(maxLotW, wantW);
            const lh = Math.min(sh, 3 + (hash(seed, 504, bx, by, sIdx, lotIdx) % Math.max(1, sh - 2)));
            const ly0 = sy0 + (sIdx === 0 ? 0 : sh - lh);

            const skyRoll = hash01(seed, 505, bx, by, sIdx, lotIdx);
            const isSkyscraper =
              (district === "downtown" && skyRoll < 0.72 && lw >= 4 && lh >= 4) ||
              (district === "midtown" && skyRoll < 0.38 && lw >= 4 && lh >= 4);

            const height = isSkyscraper
              ? 12 + (hash(seed, 506, bx, by, sIdx, lotIdx) % 17) // 12..28 stories
              : district === "midtown"
                ? 5 + (hash(seed, 507, bx, by, sIdx, lotIdx) % 7) // 5..11 stories
                : 2 + (hash(seed, 508, bx, by, sIdx, lotIdx) % 5); // 2..6 stories

            this.addBuilding(
              px,
              ly0,
              lw,
              lh,
              district,
              isSkyscraper,
              height,
              hash(seed, 509, bx, by, sIdx, lotIdx),
            );

            // Leave a 1-cell pedestrian passage between some buildings
            const gap = hash01(seed, 510, bx, by, sIdx, lotIdx) < 0.65 ? 1 : 0;
            px += lw + gap;
            lotIdx++;
          }
        }
      }
    }
  }

  private addBuilding(
    x: number,
    y: number,
    w: number,
    h: number,
    district: DistrictKind,
    isSkyscraper: boolean,
    height: number,
    variant: number,
  ): void {
    const cells: number[] = [];
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        if (!this.grid.inBounds(px, py)) continue;
        const idx = this.grid.index(px, py);
        if (this.material[idx] === CellMaterial.UNCLAIMED || this.buildingAt[idx] >= 0) continue;
        cells.push(idx);
      }
    }
    if (cells.length < 4) return;

    const id = this.buildings.length;
    const cellMat = isSkyscraper ? CellMaterial.SKYSCRAPER : CellMaterial.BUILDING;
    const cellHp = isSkyscraper ? Math.min(240, 110 + height * 4) : Math.min(160, 70 + height * 5);
    const perCellVal = isSkyscraper ? 5 : 3;

    for (const idx of cells) {
      this.material[idx] = cellMat;
      this.hp[idx] = cellHp;
      this.maxHp[idx] = cellHp;
      this.buildingAt[idx] = id;
    }

    const baselineValue = cells.length * perCellVal;
    const baseIncome = Math.max(1, Math.round((cells.length * (isSkyscraper ? 0.45 : 0.25)) + height * 0.15));

    this.buildings.push({
      id,
      x,
      y,
      w,
      h,
      district,
      isSkyscraper,
      height,
      cells,
      baselineValue,
      baseIncome,
      development: 1.0,
      variant,
    });
  }

  /** Carves the initial teleporter disaster craters & active Void breaches
   * so gameplay opens a few minutes after the catastrophe, with damaged
   * surrounding blocks and salvageable rubble. */
  private applyInitialBreaches(scenario: ScenarioConfig): void {
    const { w, h } = this.grid;
    scenario.portals.forEach((p, idx) => {
      const px = Math.max(6, Math.min(w - 7, Math.round(p.xFrac * w)));
      const py = Math.max(6, Math.min(h - 7, Math.round(p.yFrac * h)));
      const activateAtTick = Math.round(p.activateAtSeconds * TICK_HZ);
      const active = activateAtTick <= 0;

      this.portals.push({
        id: idx,
        x: px,
        y: py,
        radius: p.radius,
        activateAtTick,
        active,
      });

      if (!active) return;

      const outerR = p.radius + 5;
      for (let y = Math.max(0, py - outerR); y <= Math.min(h - 1, py + outerR); y++) {
        for (let x = Math.max(0, px - outerR); x <= Math.min(w - 1, px + outerR); x++) {
          const d = dist(x - px, y - py);
          const jitter = (hash01(this.seed, 888, idx, x, y) - 0.5) * 2.2;
          const cellIdx = y * w + x;
          if (d + jitter <= p.radius) {
            this.material[cellIdx] = CellMaterial.VOID;
            this.hp[cellIdx] = 0;
            this.buildingAt[cellIdx] = -1;
          } else if (d + jitter <= p.radius + 3.2) {
            // Shockwave-damaged perimeter: rubble/salvage or half-damaged building edge
            if (hash01(this.seed, 889, idx, x, y) < 0.45) {
              this.material[cellIdx] = CellMaterial.SALVAGE;
              this.hp[cellIdx] = 35;
              this.maxHp[cellIdx] = 45;
              this.buildingAt[cellIdx] = -1;
            } else {
              this.hp[cellIdx] = Math.max(10, Math.floor(this.hp[cellIdx] * 0.5));
            }
          }
        }
      }
    });

    // Prune any buildings that were completely obliterated by the initial portal blast
    // and update remaining buildings' cell lists to reflect arrival state.
    for (const b of this.buildings) {
      b.cells = b.cells.filter((c) => this.buildingAt[c] === b.id && this.material[c] !== CellMaterial.VOID);
      const perCellVal = b.isSkyscraper ? 5 : 3;
      b.baselineValue = b.cells.length * perCellVal;
    }
  }

  /** Records the exact scorable baseline present when player control begins. */
  private snapshotBaseline(): number {
    let total = 0;
    const n = this.grid.count;
    for (let i = 0; i < n; i++) {
      const mat = this.material[i];
      this.originalMaterial[i] = mat;
      this.originalBuildingAt[i] = this.buildingAt[i];
      if (mat === CellMaterial.VOID || mat === CellMaterial.UNCLAIMED) {
        this.isBaselineCell[i] = 0;
        this.baselineCellValue[i] = 0;
        continue;
      }
      this.isBaselineCell[i] = 1;
      const val =
        mat === CellMaterial.SKYSCRAPER
          ? 5
          : mat === CellMaterial.BUILDING
            ? 3
            : 1;
      this.baselineCellValue[i] = val;
      total += val;
    }
    return Math.max(1, total);
  }

  /** Calculates current preserved scorable baseline value (never exceeding `totalBaselineValue`).
   * Also tracks `preservedWeightedHp` so gradual frontier erosion is reflected immediately.
   * Extra player-created islands or over-100% building developments do not inflate this score. */
  computePreservedBaseline(): {
    preservedValue: number;
    preservedWeightedHp: number;
    preservedRatio: number;
    preservedPercent: number;
  } {
    let preserved = 0;
    let weightedHp = 0;
    const n = this.grid.count;
    for (let i = 0; i < n; i++) {
      if (!this.isBaselineCell[i]) continue;
      const mat = this.material[i];
      if (mat !== CellMaterial.VOID && mat !== CellMaterial.UNCLAIMED && this.hp[i] > 0) {
        const val = this.baselineCellValue[i];
        preserved += val;
        weightedHp += Math.min(this.hp[i], this.maxHp[i]) * val;
      }
    }
    const capped = Math.min(this.totalBaselineValue, preserved);
    const cappedHp = Math.min(this.totalBaselineWeightedHp, weightedHp);
    const ratio =
      capped === 0
        ? 0
        : Math.max(0, Math.min(1, (capped / this.totalBaselineValue) * 0.7 + (cappedHp / this.totalBaselineWeightedHp) * 0.3));
    return {
      preservedValue: capped,
      preservedWeightedHp: cappedHp,
      preservedRatio: ratio,
      preservedPercent: Math.round(ratio * 1000) / 10,
    };
  }
}
