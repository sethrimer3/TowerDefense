/** High-performance metropolitan renderer for Void Defense.
 *
 * Key architecture:
 * - Dirty-chunk offscreen canvas caching (`CHUNK_SIZE = 16` cells, rendered at
 *   `ART = 4` art pixels per cell) so static streets, skyscraper rooftops,
 *   directional shadows, and window glints are only repainted in chunks touched
 *   by Void erosion, debris, or construction.
 * - Multi-scale LOD:
 *   - Overview zoom shows skyscraper silhouettes, directional shadows, amber
 *     window rows, starry cosmic Void nebula, and active frontier glow.
 *   - Close zoom reveals 1-art-pixel riflemen, 1x2 exosuit engineers, carried
 *     matter bricks, turret barrels, and individual crumbling pixels.
 * - Reuses camera math from `src/defend/render.ts` and `Loupe` from `src/defend/loupe.ts`. */

import { Loupe } from "../defend/loupe.ts";
import { CHUNK_SIZE } from "./config.ts";
import { hash01 } from "./grid.ts";
import {
  CellMaterial,
  type PlacedTower,
  type StrikeId,
  type TowerTypeId,
} from "./model.ts";
import type { VoidSim } from "./sim.ts";
import { STRIKE_SPECS, TOWER_SPECS } from "./towers.ts";
import type { VoidWorld } from "./world.ts";

const ART = 4; // 4x4 art pixels per logical simulation cell

export type DragPreview =
  | { kind: "tower"; type: TowerTypeId; x: number; y: number; valid: boolean }
  | { kind: "strike"; strike: StrikeId; x: number; y: number; valid: boolean }
  | { kind: "reticle"; towerUid: number; x: number; y: number }
  | { kind: "blueprint"; points: { x: number; y: number }[] };

export class VoidRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly terrainLayer: HTMLCanvasElement;
  private readonly tctx: CanvasRenderingContext2D;
  private renderedWorld: VoidWorld | null = null;
  readonly loupe = new Loupe();

  /** Camera state: `s` = zoom multiplier (1 = fit board), `x, y` = canvas pixel pan. */
  readonly cam = { s: 1, x: 0, y: 0 };
  px = 4; // device pixels per cell at zoom 1
  static readonly MAX_ZOOM = 7;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.terrainLayer = document.createElement("canvas");
    this.tctx = this.terrainLayer.getContext("2d", { alpha: false })!;
  }

  resize(worldW: number, worldH: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round((this.canvas.clientWidth || 800) * dpr));
    const ch = Math.max(1, Math.round((this.canvas.clientHeight || 600) * dpr));
    const fit = Math.max(1.5, Math.min(cw / worldW, ch / worldH));
    if (this.canvas.width !== cw || this.canvas.height !== ch || Math.abs(this.px - fit) > 0.01) {
      this.canvas.width = cw;
      this.canvas.height = ch;
      this.px = fit;
      this.clampCam(worldW, worldH);
    }
  }

  toCell(clientX: number, clientY: number): { fx: number; fy: number; cx: number; cy: number } {
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / Math.max(1, r.width)) * this.canvas.width;
    const y = ((clientY - r.top) / Math.max(1, r.height)) * this.canvas.height;
    const fx = (x - this.cam.x) / (this.cam.s * this.px);
    const fy = (y - this.cam.y) / (this.cam.s * this.px);
    return { fx, fy, cx: Math.floor(fx), cy: Math.floor(fy) };
  }

  toClient(fx: number, fy: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const x = fx * this.px * this.cam.s + this.cam.x;
    const y = fy * this.px * this.cam.s + this.cam.y;
    return {
      x: r.left + (x / Math.max(1, this.canvas.width)) * r.width,
      y: r.top + (y / Math.max(1, this.canvas.height)) * r.height,
    };
  }

  panBy(dxClient: number, dyClient: number, worldW: number, worldH: number): void {
    const r = this.canvas.getBoundingClientRect();
    this.cam.x += (dxClient / Math.max(1, r.width)) * this.canvas.width;
    this.cam.y += (dyClient / Math.max(1, r.height)) * this.canvas.height;
    this.clampCam(worldW, worldH);
  }

  zoomAt(clientX: number, clientY: number, factor: number, worldW: number, worldH: number): void {
    const r = this.canvas.getBoundingClientRect();
    const px = ((clientX - r.left) / Math.max(1, r.width)) * this.canvas.width;
    const py = ((clientY - r.top) / Math.max(1, r.height)) * this.canvas.height;
    const nextS = Math.max(0.85, Math.min(VoidRenderer.MAX_ZOOM, this.cam.s * factor));
    const k = nextS / this.cam.s;
    this.cam.x = px - (px - this.cam.x) * k;
    this.cam.y = py - (py - this.cam.y) * k;
    this.cam.s = nextS;
    this.clampCam(worldW, worldH);
  }

  resetCam(worldW: number, worldH: number): void {
    this.cam.s = 1;
    this.cam.x = 0;
    this.cam.y = 0;
    this.clampCam(worldW, worldH);
  }

  private clampCam(worldW: number, worldH: number): void {
    const bw = worldW * this.px * this.cam.s;
    const bh = worldH * this.px * this.cam.s;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    this.cam.x = bw <= cw ? (cw - bw) * 0.5 : Math.min(60, Math.max(cw - bw - 60, this.cam.x));
    this.cam.y = bh <= ch ? (ch - bh) * 0.5 : Math.min(60, Math.max(ch - bh - 60, this.cam.y));
  }

  /** Repaints only dirtied 16x16 cell chunks into `this.terrainLayer`. */
  private syncDirtyChunks(world: VoidWorld): void {
    const { w, h, chunksW, chunksH, dirtyChunks } = world.grid;
    const targetW = w * ART;
    const targetH = h * ART;

    if (this.renderedWorld !== world || this.terrainLayer.width !== targetW || this.terrainLayer.height !== targetH) {
      this.renderedWorld = world;
      this.terrainLayer.width = targetW;
      this.terrainLayer.height = targetH;
      world.grid.markAllDirty();
    }

    if (!world.grid.hasDirtyChunks()) return;

    const c = this.tctx;
    c.imageSmoothingEnabled = false;

    for (let cy = 0; cy < chunksH; cy++) {
      for (let cx = 0; cx < chunksW; cx++) {
        const chunkIdx = cy * chunksW + cx;
        if (!dirtyChunks[chunkIdx]) continue;
        this.paintChunk(c, world, cx * CHUNK_SIZE, cy * CHUNK_SIZE);
      }
    }

    world.grid.clearDirtyFlags();
  }

  private paintChunk(c: CanvasRenderingContext2D, world: VoidWorld, x0: number, y0: number): void {
    const { w, h } = world.grid;
    const x1 = Math.min(w, x0 + CHUNK_SIZE);
    const y1 = Math.min(h, y0 + CHUNK_SIZE);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = y * w + x;
        const mat = world.material[idx];
        const ax = x * ART;
        const ay = y * ART;

        if (mat === CellMaterial.VOID) {
          // Deep cosmic midnight indigo/violet with deterministic star glints
          c.fillStyle = (x + y) % 2 === 0 ? "#090614" : "#0d091d";
          c.fillRect(ax, ay, ART, ART);
          const starRoll = hash01(world.seed, 991, x, y);
          if (starRoll < 0.14) {
            c.fillStyle = starRoll < 0.04 ? "#6ef3ff" : starRoll < 0.09 ? "#c88aff" : "#5a429c";
            const sx = (hash01(world.seed, 992, x, y) * (ART - 1)) | 0;
            const sy = (hash01(world.seed, 993, x, y) * (ART - 1)) | 0;
            c.fillRect(ax + sx, ay + sy, 1, 1);
          }
          continue;
        }

        if (mat === CellMaterial.UNCLAIMED) {
          c.fillStyle = "#111824";
          c.fillRect(ax, ay, ART, ART);
          continue;
        }

        if (mat === CellMaterial.STREET) {
          // Charcoal asphalt with warm avenue lane markings
          c.fillStyle = "#1c2026";
          c.fillRect(ax, ay, ART, ART);
          if (x % 12 === 0 && y % 2 === 0) {
            c.fillStyle = "#4d3c26";
            c.fillRect(ax + 1, ay + 1, 1, 2);
          } else if (y % 12 === 0 && x % 2 === 0) {
            c.fillStyle = "#3a404a";
            c.fillRect(ax + 1, ay + 1, 2, 1);
          }
          // Cast directional skyscraper shadow from north/west high-rises
          if (
            (x > 0 && world.material[idx - 1] === CellMaterial.SKYSCRAPER) ||
            (y > 0 && world.material[idx - w] === CellMaterial.SKYSCRAPER)
          ) {
            c.fillStyle = "rgba(6, 8, 12, 0.55)";
            c.fillRect(ax, ay, ART, ART);
          }
          continue;
        }

        if (mat === CellMaterial.PARK) {
          c.fillStyle = "#1e2e26";
          c.fillRect(ax, ay, ART, ART);
          if (hash01(world.seed, 994, x, y) < 0.35) {
            c.fillStyle = "#2b4236";
            c.fillRect(ax + 1, ay + 1, 2, 2);
          }
          continue;
        }

        if (mat === CellMaterial.RECLAIMED) {
          // Synthetic Resistance matter: warm amber-steel substrate
          c.fillStyle = world.isBaselineCell[idx] ? "#333942" : "#4a3828";
          c.fillRect(ax, ay, ART, ART);
          c.fillStyle = "#a86b32";
          c.fillRect(ax + 1, ay + 1, 1, 1);
          continue;
        }

        if (mat === CellMaterial.SALVAGE) {
          c.fillStyle = "#252830";
          c.fillRect(ax, ay, ART, ART);
          c.fillStyle = "#b87333";
          c.fillRect(ax + 1, ay + 1, 2, 1);
          continue;
        }

        if (mat === CellMaterial.WALL || mat === CellMaterial.BARRIER) {
          c.fillStyle = "#525c69";
          c.fillRect(ax, ay, ART, ART);
          c.fillStyle = "#f28d35";
          c.fillRect(ax + 1, ay + 1, 2, 2);
          continue;
        }

        // Building or Skyscraper cell
        const bId = world.buildingAt[idx];
        const b = bId >= 0 ? world.buildings[bId] : undefined;
        const hpRatio = world.maxHp[idx] > 0 ? world.hp[idx] / world.maxHp[idx] : 1;
        const isSky = mat === CellMaterial.SKYSCRAPER;

        // Base steel/graphite rooftop tone
        c.fillStyle = isSky ? "#2f3744" : "#262c36";
        c.fillRect(ax, ay, ART, ART);

        if (b) {
          const onNorthOrWestEdge = x === b.x || y === b.y;
          const onSouthOrEastEdge = x === b.x + b.w - 1 || y === b.y + b.h - 1;
          if (onNorthOrWestEdge) {
            c.fillStyle = isSky ? "#495669" : "#3a4250";
            c.fillRect(ax, ay, ART, 1);
            c.fillRect(ax, ay, 1, ART);
          } else if (onSouthOrEastEdge) {
            c.fillStyle = "#161a22";
            c.fillRect(ax, ay + ART - 1, ART, 1);
            c.fillRect(ax + ART - 1, ay, 1, ART);
          } else if (isSky) {
            // Stepped inner penthouse / HVAC / helipad detail
            c.fillStyle = "#394454";
            c.fillRect(ax + 1, ay + 1, ART - 2, ART - 2);
          }

          // Warm amber/orange window glints & over-100% development beacon
          const winRoll = hash01(world.seed, 995, x, y);
          if (winRoll < (isSky ? 0.62 : 0.42) && hpRatio > 0.35) {
            c.fillStyle = b.development > 1.05 ? "#ffaa33" : winRoll < 0.2 ? "#ff7722" : "#e6a145";
            c.fillRect(ax + 1, ay + 1, 1, 1);
            if (isSky && winRoll < 0.3) {
              c.fillRect(ax + 2, ay + 2, 1, 1);
            }
          }
        }

        // Visual damage cracks if eroded
        if (hpRatio < 0.65) {
          c.fillStyle = "#120e1c";
          c.fillRect(ax + 1, ay + 2, 2, 1);
        }
      }
    }
  }

  /** Renders the complete metropolitan board, active Void frontier, towers,
   * 1-pixel soldiers, 1x2 engineers, projectiles, and interactive drag overlays. */
  draw(
    sim: VoidSim,
    nowMs: number,
    selectedTowerUid: number | null,
    preview: DragPreview | null,
    pointerForLoupe: { clientX: number; clientY: number; cellX: number; cellY: number } | null,
    showMagnifier: boolean,
  ): void {
    const { world, voidField, combat, physics } = sim;
    this.resize(world.grid.w, world.grid.h);
    this.syncDirtyChunks(world);

    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#07080d";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply camera transform into logical cell coordinates (`1 unit = 1 cell`)
    const scale = this.cam.s * this.px;
    c.setTransform(scale, 0, 0, scale, this.cam.x, this.cam.y);
    c.imageSmoothingEnabled = false;

    // 1. Draw cached metropolitan terrain layer
    c.drawImage(this.terrainLayer, 0, 0, world.grid.w, world.grid.h);

    // 2. Draw active Void frontier shimmer & portal cores
    const pulse = 0.55 + 0.35 * Math.sin(nowMs * 0.006);
    c.fillStyle = `rgba(172, 92, 255, ${0.42 * pulse})`;
    for (let i = 0; i < voidField.frontierCells.length; i++) {
      const cIdx = voidField.frontierCells[i];
      const fx = world.grid.xOf(cIdx);
      const fy = world.grid.yOf(cIdx);
      c.fillRect(fx, fy, 1, 1);
    }

    for (const p of world.portals) {
      if (p.active) {
        c.strokeStyle = "#b967ff";
        c.lineWidth = 0.6;
        c.beginPath();
        c.arc(p.x, p.y, 2.8 + 0.6 * pulse, 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = "#6ef3ff";
        c.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6);
      } else {
        // Telegraphed warning ring for delayed secondary portal
        c.strokeStyle = `rgba(255, 110, 50, ${0.4 + 0.4 * pulse})`;
        c.lineWidth = 0.4;
        c.setLineDash([1.5, 1.5]);
        c.beginPath();
        c.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
      }
    }

    // 3. Draw crystalline Void Nodes (Phase 6+ infantry targets)
    for (const node of voidField.nodes) {
      c.fillStyle = "#d46bff";
      c.fillRect(node.x - 0.9, node.y - 0.9, 1.8, 1.8);
      c.fillStyle = "#7afcff";
      c.fillRect(node.x - 0.4, node.y - 0.4, 0.8, 0.8);
    }

    // 4. Draw user-drawn wall blueprints
    for (const bp of combat.blueprints) {
      c.fillStyle = "rgba(242, 157, 56, 0.38)";
      for (const cIdx of bp.cells) {
        if (world.material[cIdx] !== CellMaterial.WALL) {
          c.fillRect(world.grid.xOf(cIdx), world.grid.yOf(cIdx), 1, 1);
        }
      }
    }

    // 5. Draw Shield Projector arcs & Gravity Anchor fields
    for (const t of combat.towers) {
      const cx = t.x + t.w * 0.5;
      const cy = t.y + t.h * 0.5;
      if (t.type === "shieldProjector") {
        const pool = combat.shieldPools.get(t.uid) ?? 0;
        if (pool > 5) {
          const r = TOWER_SPECS.shieldProjector.range + sim.tech.shieldExtraRadius;
          c.strokeStyle = `rgba(69, 209, 230, ${Math.min(0.65, pool / 180)})`;
          c.lineWidth = 0.45;
          c.beginPath();
          c.arc(cx, cy, r, 0, Math.PI * 2);
          c.stroke();
        }
      } else if (t.type === "gravityAnchor") {
        c.strokeStyle = "rgba(109, 136, 255, 0.28)";
        c.lineWidth = 0.35;
        c.beginPath();
        c.arc(cx, cy, TOWER_SPECS.gravityAnchor.range, 0, Math.PI * 2);
        c.stroke();
      }
    }

    // 6. Draw placed Resistance towers
    for (const t of combat.towers) {
      const spec = TOWER_SPECS[t.type];
      c.fillStyle = "#181c24";
      c.fillRect(t.x, t.y, t.w, t.h);
      c.fillStyle = spec.color;
      c.fillRect(t.x + 0.35, t.y + 0.35, t.w - 0.7, t.h - 0.7);
      c.fillStyle = "#fff1d0";
      c.fillRect(t.x + t.w * 0.5 - 0.4, t.y + t.h * 0.5 - 0.4, 0.8, 0.8);

      if (t.uid === selectedTowerUid) {
        c.strokeStyle = "#ffaa33";
        c.lineWidth = 0.35;
        c.strokeRect(t.x - 0.3, t.y - 0.3, t.w + 0.6, t.h + 0.6);
        // Range circle
        c.strokeStyle = "rgba(255, 170, 51, 0.35)";
        c.beginPath();
        c.arc(t.x + t.w * 0.5, t.y + t.h * 0.5, spec.range, 0, Math.PI * 2);
        c.stroke();
      }

      if (t.focus) {
        c.strokeStyle = "rgba(255, 140, 40, 0.55)";
        c.lineWidth = 0.25;
        c.beginPath();
        c.moveTo(t.x + t.w * 0.5, t.y + t.h * 0.5);
        c.lineTo(t.focus.x, t.focus.y);
        c.stroke();
        c.strokeRect(t.focus.x - 1, t.focus.y - 1, 2, 2);
      }
    }

    // 7. Draw autonomous agents: 1x1 riflemen, 1x2 engineers, 2x2 heavy mechs, wall serpents
    for (const a of combat.agents) {
      if (a.kind === "rifleman") {
        // 1-pixel warm-orange soldier
        c.fillStyle = "#ff7b29";
        c.fillRect(a.x - 0.4, a.y - 0.4, 0.85, 0.85);
      } else if (a.kind === "engineer") {
        // 1x2 amber engineer + carried matter brick
        c.fillStyle = "#f2c94c";
        c.fillRect(a.x - 0.4, a.y - 0.75, 0.8, 1.5);
        if (a.carryingMatter > 0) {
          c.fillStyle = "#6ef3ff";
          c.fillRect(a.x - 0.25, a.y - 1.1, 0.5, 0.4);
        }
      } else if (a.kind === "heavyMech") {
        // 2x2 armored exomech
        c.fillStyle = "#ffa630";
        c.fillRect(a.x - 1.0, a.y - 1.0, 2.0, 2.0);
        c.fillStyle = "#222834";
        c.fillRect(a.x - 0.5, a.y - 0.5, 1.0, 1.0);
      } else if (a.kind === "wallSerpent") {
        c.fillStyle = "#7ad7f0";
        c.fillRect(a.x - 0.9, a.y - 0.9, 1.8, 1.8);
      }
    }

    // 8. Draw cosmic Void organisms
    for (const o of combat.organisms) {
      if (o.trail) {
        c.fillStyle = "rgba(185, 103, 255, 0.5)";
        for (const pt of o.trail) {
          c.fillRect(pt.x - 0.6, pt.y - 0.6, 1.2, 1.2);
        }
      }
      if (o.kind === "voidBee") {
        c.fillStyle = "#6ef3ff";
        c.fillRect(o.x - 0.35, o.y - 0.35, 0.7, 0.7);
      } else if (o.kind === "constellationSpider") {
        c.strokeStyle = "#8ce7ff";
        c.lineWidth = 0.25;
        for (let leg = 0; leg < 6; leg++) {
          const ang = (leg * Math.PI) / 3 + nowMs * 0.008;
          c.beginPath();
          c.moveTo(o.x, o.y);
          c.lineTo(o.x + Math.cos(ang) * 2.2, o.y + Math.sin(ang) * 2.2);
          c.stroke();
        }
        c.fillStyle = "#e08aff";
        c.fillRect(o.x - 0.7, o.y - 0.7, 1.4, 1.4);
      } else if (o.kind === "honeycombCrystal") {
        c.fillStyle = "#f2c94c";
        c.fillRect(o.x - 1.1, o.y - 1.1, 2.2, 2.2);
        c.fillStyle = "#b85cff";
        c.fillRect(o.x - 0.5, o.y - 0.5, 1.0, 1.0);
      } else if (o.kind === "nexusCrystal") {
        c.strokeStyle = "#6ef3ff";
        c.lineWidth = 0.35;
        c.strokeRect(o.x - 1.4, o.y - 1.4, 2.8, 2.8);
        c.fillStyle = "#ff66e8";
        c.fillRect(o.x - 0.7, o.y - 0.7, 1.4, 1.4);
      } else {
        c.fillStyle = o.kind === "nebulaQueen" ? "#ff66e8" : "#b85cff";
        c.fillRect(o.x - 1.2, o.y - 1.2, 2.4, 2.4);
      }
    }

    // 9. Draw matter pellets, thermal laser beams, and drifting debris fragments
    for (const p of combat.pellets) {
      const px = p.x + (p.tx - p.x) * p.progress;
      const py = p.y + (p.ty - p.y) * p.progress - Math.sin(p.progress * Math.PI) * 3.5;
      c.fillStyle = p.wallPayload ? "#7ad7f0" : "#ffaa33";
      c.fillRect(px - 0.55, py - 0.55, 1.1, 1.1);
    }

    for (const l of combat.lasers) {
      c.strokeStyle = l.color;
      c.lineWidth = 0.28;
      c.beginPath();
      c.moveTo(l.x0, l.y0);
      c.lineTo(l.x1, l.y1);
      c.stroke();
    }

    for (const d of physics.debris) {
      c.fillStyle = "#9ea7b0";
      c.fillRect(d.x - 0.35, d.y - 0.35, 0.7, 0.7);
    }

    // 10. Draw active drag / strike / blueprint preview
    if (preview) {
      if (preview.kind === "tower") {
        const spec = TOWER_SPECS[preview.type];
        c.fillStyle = preview.valid ? "rgba(242, 157, 56, 0.45)" : "rgba(255, 65, 65, 0.45)";
        c.fillRect(preview.x, preview.y, spec.w, spec.h);
        c.strokeStyle = preview.valid ? "#ffaa33" : "#ff4444";
        c.lineWidth = 0.3;
        c.beginPath();
        c.arc(preview.x + spec.w * 0.5, preview.y + spec.h * 0.5, spec.range, 0, Math.PI * 2);
        c.stroke();
      } else if (preview.kind === "strike") {
        const spec = STRIKE_SPECS[preview.strike];
        const r =
          preview.strike === "landfall"
            ? spec.radius * sim.tech.landfallRadiusMultiplier
            : spec.radius;
        c.fillStyle = preview.valid ? "rgba(110, 243, 255, 0.22)" : "rgba(255, 65, 65, 0.25)";
        c.strokeStyle = preview.valid ? spec.color : "#ff4444";
        c.lineWidth = 0.4;
        c.beginPath();
        c.arc(preview.x, preview.y, r, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      } else if (preview.kind === "reticle") {
        c.strokeStyle = "#ffaa33";
        c.lineWidth = 0.35;
        c.strokeRect(preview.x - 1.5, preview.y - 1.5, 3, 3);
      } else if (preview.kind === "blueprint" && preview.points.length > 0) {
        c.strokeStyle = "#ffaa33";
        c.lineWidth = 0.5;
        c.beginPath();
        c.moveTo(preview.points[0].x, preview.points[0].y);
        for (let i = 1; i < preview.points.length; i++) {
          c.lineTo(preview.points[i].x, preview.points[i].y);
        }
        c.stroke();
      }
    }

    c.setTransform(1, 0, 0, 1, 0, 0);

    // 11. Draw touch/drag Loupe magnifier if active
    if (showMagnifier && pointerForLoupe) {
      const focusClient = this.toClient(pointerForLoupe.cellX, pointerForLoupe.cellY);
      this.loupe.show({ x: pointerForLoupe.clientX, y: pointerForLoupe.clientY }, focusClient);
      this.loupe.draw(this.canvas);
    } else {
      this.loupe.hide();
    }
  }
}
