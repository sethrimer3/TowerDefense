import { isBlightFlier } from "./blight-fliers.ts";
import { blightFlierPixels } from "./blight-flier-shapes.ts";
/** Basic bodies, including flying Blight silhouettes, use replaceable sources.
 * Their equipment and status effects are independent layers. In particular
 * a Darkling's black body is material, not a baked rim. */
import { CIVILIAN, ENEMIES, type EnemyKind } from "./catalog.ts";
import { TROOPS } from "./unit-bodies.ts";
import { zoneEnemyRows } from "./zone-enemy-art.ts";
import { ART } from "./art-scale.ts";
import { ART_NAMES } from "./art-overrides.ts";
import { sourcePixels, type ArtPiece } from "./sprite-source.ts";
import { rgba, sprite } from "./damage-art.ts";
export const basicName = (kind: string, enemy = false) =>
  enemy ? ART_NAMES.enemy(kind, "body") : ART_NAMES.unit(`${kind}-body`);
function definition(kind: string, enemy: boolean) {
  return enemy ? ENEMIES[kind as EnemyKind] : kind === "civilian" ? CIVILIAN : TROOPS[kind as keyof typeof TROOPS];
}
export function basicUnitPixels(kind: string, enemy = false, flash = false) {
  const def = definition(kind, enemy),
    w = Math.max(1, Math.round(def.size * ART)),
    h = w;
  const data = sourcePixels(basicName(kind, enemy), w, h, () =>
    enemy && isBlightFlier(kind as EnemyKind) ? blightFlierPixels(kind as EnemyKind, w) : new Uint32Array(w * h).fill(rgba(parseInt(def.color.slice(1), 16))),
  );
  return { w, h, data: flash ? data.map((v) => (v ? rgba(0xffffff) : 0)) : data };
}
export function basicUnitSprite(kind: string, enemy = false, flash = false) {
  const w = Math.max(1, Math.round(definition(kind, enemy).size * ART));
  return sprite(`basic:${kind}:${enemy}:${flash}`, w, w, () => basicUnitPixels(kind, enemy, flash).data, false);
}
export function basicUnitPieces(): ArtPiece[] {
  return [
    [
      false,
      [
        "civilian",
        "sword",
        "archer",
        "brawler",
        "slinger",
        "sniper",
        "musketeer",
        "gunner",
        "machineGunner",
        "gatlingGunner",
        "railSniper",
        "rocketeer",
        "spearman",
        "hoplite",
        "javelineer",
        "lancer",
        "assassin",
      ],
    ],
    [
      true,
      Object.keys(ENEMIES).filter((k) => {
        const d = ENEMIES[k as EnemyKind];
        return (
          !zoneEnemyRows(k as EnemyKind) && (!d.fortress || d.blightFortress) && !d.boat && !d.siege && k !== "iceGolem" && k !== "iceCube"
        );
      }),
    ],
  ].flatMap(([foe, kinds]) =>
    (kinds as string[]).map((kind) => {
      const enemy = foe as boolean,
        p = basicUnitPixels(kind, enemy);
      return {
        name: basicName(kind, enemy),
        w: p.w,
        h: p.h,
        about: `${kind} body (equipment separate)`,
        pixels: () => basicUnitPixels(kind, enemy).data,
      };
    }),
  );
}
