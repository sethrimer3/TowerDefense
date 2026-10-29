/** Original native unit ids, never proxy/building ids. Presentation only. */
export { DARK_UNIT_INK as ENEMY_INK, PLAYER_UNIT_INK as FRIEND_INK } from "../defend/art-scale.ts";
import { DARK_UNIT_INK as ENEMY_INK, PLAYER_UNIT_INK as FRIEND_INK } from "../defend/art-scale.ts";
export function siegeSides(friends: readonly { id: number }[], enemies: readonly { id: number }[]) {
  const friend = new Set(friends.map(u => u.id)), enemy = new Set(enemies.map(u => u.id));
  return { ink: (id: number) => enemy.has(id) ? ENEMY_INK : friend.has(id) ? FRIEND_INK : undefined };
}
