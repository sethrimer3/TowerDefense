/** Catalog extensions for native world art. Kept out of the renderer's
 * import path: producing the artist gallery never affects game startup. */
import { basicUnitPieces } from "./basic-unit-art.ts";
import { unitBodyPieces } from "./unit-body-art.ts";
import { magePieces } from "./mage-art.ts";
import { wizardPieces } from "./dark-art.ts";
import { zoneEnemyPieces } from "./zone-enemy-art.ts";
import { iceEnemyPieces } from "./ice-enemy-art.ts";
import { boatPieces } from "./boat-art.ts";
import { siegePieces } from "./siege-art.ts";
import { fortressPieces } from "./fortress-art.ts";
import { forestPieces } from "./forest-art.ts";
import { parkTreePieces } from "./park-art.ts";
import { projectilePieces } from "./projectile-art.ts";
import { smallPieces } from "./small-art.ts";
import { puffPieces } from "./puff-art.ts";
import { explosionPieces } from "./blast-art.ts";
import { wispCorePieces } from "./wisp-core-art.ts";
import { meteorPieces, impactChipPieces } from "./meteor-art.ts";
import { iceClusterPieces } from "./wizard-art.ts";
import { frostDiamondPieces } from "./frost-art.ts";
import { shadePieces } from "./shade-art.ts";
import { meleeCapePieces } from "./melee-cape.ts";
import { heroCapePieces } from "./hero-art.ts";
import { wallPieces } from "./area-wall-art.ts";
import { chronoPieces } from "./chrono-art.ts";
import { ghostPieces } from "./ghosts.ts";
import { weaponPieces } from "./weapon-art.ts";
import { skyPalacePieces } from "./sky-palace-art.ts";
export const extraArtPieces = () => [
  ...chronoPieces(),
  ...ghostPieces(),
  ...skyPalacePieces(),
  ...wallPieces(),
  ...weaponPieces(),
  ...basicUnitPieces(), // Catalog-driven: all three worm sizes and Darkling squares and the three flying Blight silhouettes.
  ...shadePieces(),
  ...meleeCapePieces(),
  ...heroCapePieces(),
  ...unitBodyPieces(),
  ...magePieces(),
  ...wizardPieces(),
  ...zoneEnemyPieces(),
  ...iceEnemyPieces(),
  ...boatPieces(),
  ...siegePieces(),
  ...fortressPieces(),
  ...forestPieces(),
  ...parkTreePieces(),
  ...projectilePieces(),
  ...smallPieces(),
  ...puffPieces(),
  ...explosionPieces(),
  ...wispCorePieces(),
  ...meteorPieces(),
  ...impactChipPieces(),
  ...iceClusterPieces(),
  ...frostDiamondPieces(),
];
