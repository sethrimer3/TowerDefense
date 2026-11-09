/** Core domain types for Void Defense: world terrain, metropolitan buildings,
 * Void field state, towers, autonomous agents, strikes, and run results. */

import type { Flag } from "../profile/model.ts";

export type PlayStyleMode = "underSiege" | "buildAndWatch";

export type VoidProfile = {
  name: string;
  flag: Flag;
  mode: PlayStyleMode;
};

/** Cell-level terrain ownership and physical state. */
export const CellMaterial = {
  VOID: 0,
  UNCLAIMED: 1,
  STREET: 2,
  PARK: 3,
  RECLAIMED: 4,
  SALVAGE: 5,
  BUILDING: 6,
  SKYSCRAPER: 7,
  WALL: 8,
  BARRIER: 9,
} as const;

export type CellMaterialId = (typeof CellMaterial)[keyof typeof CellMaterial];

export type DistrictKind = "downtown" | "midtown" | "industrial" | "residential" | "plaza" | "breach";

export type MetroBuilding = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  district: DistrictKind;
  isSkyscraper: boolean;
  /** Stylized height in stories (1 to 28) for top-down shadow length & rooftop detail. */
  height: number;
  /** Cells originally belonging to this building footprint. */
  cells: number[];
  /** Baseline scorable value when the player arrives on scene. */
  baselineValue: number;
  /** Base Supplies generated per income cycle at 100% integrity. */
  baseIncome: number;
  /** Current development multiplier (1.0 = original intact, up to 2.0 when upgraded by masons). */
  development: number;
  /** Palette variant seed. */
  variant: number;
};

export type VoidPortal = {
  id: number;
  x: number;
  y: number;
  radius: number;
  /** Tick at which this portal activates (0 = active at start; >0 = delayed collapse). */
  activateAtTick: number;
  active: boolean;
};

/** Crystalline Void Node / Tendril Spire that coalesces near the frontier,
 * accelerating local erosion until destroyed by infantry or towers. */
export type VoidNode = {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
};

/** Late-game / escalating cosmic organisms. */
export type OrganismKind = "nebulaWorm" | "constellationSpider" | "voidBloom" | "nebulaQueen" | "voidBee" | "honeycombCrystal" | "nexusCrystal";

export type VoidOrganism = {
  id: number;
  kind: OrganismKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  targetX: number;
  targetY: number;
  cooldown: number;
  parentId?: number;
  trail?: { x: number; y: number }[];
};

/** Drifting detached building fragment pulled toward the Void. */
export type DebrisFragment = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  life: number;
  maxLife: number;
};

export type TowerTypeId =
  | "matterCannon"
  | "repairDepot"
  | "infantryBarracks"
  | "constructorHub"
  | "shieldProjector"
  | "wallSerpent"
  | "gravityAnchor"
  | "rocketTeam"
  | "heavyMechBay";

export type PlacedTower = {
  uid: number;
  type: TowerTypeId;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  paid: number;
  placedAtTick: number;
  cooldown: number;
  /** Optional world-space focus/rally reticle set by the player. */
  focus?: { x: number; y: number };
};

export type WallBlueprint = {
  id: number;
  points: { x: number; y: number }[];
  loop: boolean;
  cells: number[];
};

export type AgentKind = "engineer" | "rifleman" | "rocketeer" | "heavyMech" | "wallSerpent";

export type Agent = {
  id: number;
  kind: AgentKind;
  homeUid: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  carryingMatter: number;
  state: "idle" | "seekSalvage" | "haulToBuild" | "repair" | "patrol" | "attack" | "retreat";
  targetCell: number;
  targetNodeId: number;
  cooldown: number;
};

export type MatterPellet = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  progress: number;
  duration: number;
  radius: number;
  wallPayload: boolean;
  /** Whether this pellet restores/creates non-baseline land or hardened wall. */
  strength: number;
};

export type LaserBeam = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  ttl: number;
  color: string;
};

export type StrikeId = "landfall" | "genesis" | "orbitalReinforcement" | "containmentPulse" | "seismicFrame";

export type ScenarioId =
  | "tutorialBreach"
  | "edgeAdvance"
  | "centralRupture"
  | "twinBreaches"
  | "delayedCollapse"
  | "archipelagoCity"
  | "organismEscalation"
  | "endless";

export type ScenarioConfig = {
  id: ScenarioId;
  name: string;
  subtitle: string;
  seed: number;
  worldW: number;
  worldH: number;
  initialVoidEnergy: number; // Infinity for endless
  baseGrowthRate: number;
  rampPerMinute: number;
  startingSuppliesSiege: number;
  startingSuppliesWatch: number;
  portals: { xFrac: number; yFrac: number; radius: number; activateAtSeconds: number }[];
  endless?: boolean;
};

export type ZeroContactReason =
  | "active"
  | "cityConsumedDefeat"
  | "reservoirDepletedVictory"
  | "voidEradicatedVictory"
  | "awaitingDelayedPortal"
  | "isolatedPocketContainment";

export type RunOutcome = {
  scenarioId: ScenarioId;
  mode: PlayStyleMode;
  status: "won" | "lost";
  reason: ZeroContactReason;
  elapsedSeconds: number;
  preservedRatio: number;
  preservedPercent: number;
  sparksTier: 0 | 1 | 2 | 3;
  sparksAwarded: number;
  voidEssenceAwarded: number;
  workResisted: number;
  participated: boolean;
};
