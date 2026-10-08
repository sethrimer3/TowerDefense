import { ENEMIES, type EnemyKind } from "./catalog.ts";
import type { AreaId } from "./areas.ts";

const ships = Object.values(ENEMIES).filter(e => e.boat).map(e => e.kind);
const walkers = Object.values(ENEMIES).filter(e => e.fortress).map(e => e.kind);
const shields: EnemyKind[] = ["shieldLesser", "shieldBearer", "shieldGreater", "aegis"];
/** Offspring remain attached to their parent; affordability still chooses tiers. */
export const AREA_ENEMIES: Record<AreaId, readonly EnemyKind[]> = {
  moss: ["roach", "orc", "ogre", "warlord", "bannerCaptain", "mother", "bat", "fortressHut", "fortressOutpost", "briarling", "mossBoar", "rootTreant"],
  desert: ["snake", "siegeBeetle", "burrowingMole", "orc", "ogre", "warlord", "bannerCaptain", "ballista", "trebuchet", "duneScorpion", "sunScarab", "sandVulture"],
  ember: ["dragon", "bombOrc", "bombBird", "ashPhoenix", "rollingCannon", "fireworkLauncher", "bombard", "rocketBattery", "orc", "bannerCaptain", "fortressTower", "fortressKeep"],
  drowned: [...ships, "leechSwarm", "snake", "necromancer", "brineCrab", "lanternJelly", "coralGuardian"],
  fungal: ["poisonLesser", "poisonBearer", "poisonGreater", "poisonSovereign", "mother", "roach", "leechSwarm", "burrowingMole", "bat", "sporeling", "fungalBrute", "sporeMoth"],
  frozen: ["iceGolem", "iceCube", ...ships, ...shields, "mirrorKnight", "ogre", "bat", "fortressTower", "fortressKeep"],
  crystal: [...shields, "mirrorKnight", "blinkImp", "siegeBeetle", "burrowingMole", "bat", "shardling", "crystalSentinel", "prismRay"],
  obsidian: [...walkers, "darkKnight", "necromancer", "bat", "leechSwarm", "trebuchet"],
  astral: ["voidSparrow", "blinkImp", "mirrorKnight", ...shields, "fortressGreater", "fortressSovereign", "boatGreater", "boatSovereign", "starWisp", "cometHound", "astralWarden"],
  nadir: Object.values(ENEMIES).filter(e => !e.hatched).map(e => e.kind),
};
