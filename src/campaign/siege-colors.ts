/** Original native unit ids, never proxy/building ids. Presentation only. */
export const ENEMY_INK = '#b3202a';
export const FRIEND_INK = '#1d3f7a';
export function siegeSides(friends: readonly { id: number }[], enemies: readonly { id: number }[]) {
  const friend = new Set(friends.map(u => u.id)), enemy = new Set(enemies.map(u => u.id));
  return { ink: (id: number) => enemy.has(id) ? ENEMY_INK : friend.has(id) ? FRIEND_INK : undefined };
}
