import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { bout, heroHpDuring, predict } from "../src/combat.ts";
import { BoardPopups, lunges } from "../src/board-popups.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";

const hero = (over: Partial<Player> = {}): Player =>
  ({ x: 0, y: 0, hp: 100, maxHp: 100, attack: 10, defense: 2, keys: { yellow: 0, blue: 0, red: 0 }, ...over });
const foe = (over: Partial<Enemy> = {}): Enemy => ({ name: "Slime", hp: 30, attack: 7, defense: 4, tier: 0, ...over });

/** A Tower floor of open tiles, the hero at (0, 0), `east` beside it, the
 * stairs in the far corner and an enemy that keeps the floor from clearing. */
function arena(east: Tile, animate = true) {
  const g = new Game(defaults());
  g.playsFights = true;
  g.save.settings.fightAnimation = animate;
  // The deadlock search reads the floor regenerated from the seed, not this one.
  g.checkDeadlock = () => {};
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("1,0", east);
  w.cells.set("2,2", { kind: "stairs" });
  w.cells.set("0,2", { kind: "enemy", enemy: foe() });
  g.run.player.x = 0;
  g.run.player.y = 0;
  return g;
}

test("a bout plays the prediction's rounds out: the hero strikes first, each round quicker", () => {
  const p = hero(), e = foe({ hp: 36 }); // 6 hits of 6; the enemy strikes 5 times for 5.
  const fight = bout(p, e), odds = predict(p, e);
  assert.deepEqual(fight.strikes.map((s) => s.by), ["hero", "enemy", "hero", "enemy", "hero", "enemy", "hero", "enemy", "hero", "enemy", "hero"]);
  assert.deepEqual(fight.strikes.map((s) => s.damage), [6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6]);
  const ms = fight.strikes.map((s) => s.end - s.start);
  assert.deepEqual(ms.slice(0, 4).map((d) => Math.round(d * 10) / 10), [250, 250, 225, 225]);
  assert.equal(fight.strikes.at(-1)!.hp, 0, "the enemy falls");
  assert.equal(heroHpDuring(fight, p.hp, fight.duration), p.hp - odds.damage);
  assert.equal(heroHpDuring(fight, p.hp, fight.strikes[1].at - 1), p.hp, "HP drops only as a strike lands");
  assert.equal(heroHpDuring(fight, p.hp, fight.strikes[1].at), p.hp - 5);
});

test("strikes speed up by a tenth a round down to 50 ms, then hold", () => {
  const fight = bout(hero({ attack: 5, hp: 10_000 }), foe({ hp: 40, defense: 4, attack: 3 }));
  const rounds = fight.strikes.filter((s) => s.by === "hero").map((s) => s.end - s.start);
  assert.equal(rounds.length, 40);
  for (let r = 1; r < rounds.length; r++) assert.ok(Math.abs(rounds[r] - Math.max(50, rounds[r - 1] * 0.9)) < 1e-9);
  assert.equal(rounds.at(-1), 50);
});

test("a lost bout ends on the strike that fells the hero", () => {
  const fight = bout(hero({ hp: 12 }), foe({ hp: 60 }));
  const last = fight.strikes.at(-1)!;
  assert.equal(last.by, "enemy");
  assert.equal(last.hp, 0);
  assert.equal(fight.strikes.filter((s) => s.by === "enemy").length, 3);
});

test("a fight played out waits beside the enemy, then counts exactly like one settled at once", () => {
  const enemy: Tile = { kind: "enemy", enemy: foe() };
  const played = arena(structuredClone(enemy)), instant = arena(structuredClone(enemy), false);
  played.run.seed = instant.run.seed;
  const hp = played.run.player.hp;
  assert.ok(played.move(1, 0));
  assert.ok(played.encounter, "the fight is playing out");
  assert.deepEqual([played.run.player.x, played.run.player.hp], [0, hp], "nothing counts yet");
  assert.equal(played.world.tile(1, 0).kind, "enemy");
  assert.ok(!played.stepManually(0, 1) && !played.move(0, 1), "steps wait for the fight");
  played.walkTo(2, 2);
  assert.equal(played.route.length, 0);
  assert.ok(played.shownHp(played.encounter.start + played.encounter.bout.duration) < hp);

  assert.ok(played.finishEncounter());
  assert.ok(instant.move(1, 0));
  assert.equal(played.encounter, null);
  assert.deepEqual(played.run, instant.run);
  assert.equal(played.message, instant.message);
  assert.deepEqual([played.run.player.x, played.world.tile(1, 0).kind], [1, "floor"]);
});

test("undo during a fight takes the whole fight back", () => {
  const g = arena({ kind: "enemy", enemy: foe() }), hp = g.run.player.hp;
  g.move(1, 0);
  assert.ok(g.undo());
  assert.equal(g.encounter, null);
  assert.deepEqual([g.run.player.x, g.run.player.hp, g.run.kills], [0, hp, 0]);
});

test("a fight the hero loses ends the run only once it has played out", () => {
  const g = arena({ kind: "enemy", enemy: foe({ hp: 600, attack: 30 }) });
  assert.ok(g.move(1, 0, true));
  assert.equal(g.summary, null);
  g.finishEncounter();
  assert.ok(g.summary?.dead);
});

test("pickups and treasure queue their rewards to rise from their tiles", () => {
  const key = arena({ kind: "key", color: "blue" });
  key.move(1, 0);
  assert.deepEqual(key.gains, [{ x: 1, y: 0, text: "+1 blue key", art: { tile: { kind: "key", color: "blue" } } }]);
  assert.equal(key.message, "+1 blue key");
  assert.equal(key.effect.until, 0, "no text flashes over the board");

  const chest = arena({ kind: "treasure" });
  chest.move(1, 0);
  assert.match(chest.gains[0].text, /^\+\d+ Gold$/);
  assert.equal(chest.gains[0].art, null, "gold has no sprite: its text rises");
  for (const g of chest.gains.slice(1)) assert.ok(g.art && "material" in g.art);
  assert.ok(chest.gains.every((g) => g.x === 1 && g.y === 0));
});

test("the board shows rewards one after another and each strike's damage as it lands", () => {
  const popups = new BoardPopups(), gain = (text: string) => ({ x: 1, y: 0, text, art: null });
  const game = { run: { seed: 1 }, gains: [gain("+5 Gold"), gain("+1 Slime Gel")], encounter: null };
  popups.update(game, 1000);
  assert.deepEqual(game.gains, [], "the board takes the rewards");
  const shown = (popups as unknown as { rewards: { start: number }[] }).rewards.map((p) => p.start);
  assert.deepEqual(shown, [1000, 2000]);
  game.gains.push(gain("+3 Inspiration"));
  popups.update(game, 1500);
  assert.equal((popups as unknown as { rewards: { start: number }[] }).rewards.at(-1)!.start, 3000);
  popups.update(game, 4000);
  assert.ok(popups.idle);

  const fight = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, bout: bout(hero(), foe()), start: 5000, settle() {} };
  const damage = () => (popups as unknown as { damage: { x: number; text: string }[] }).damage.map((d) => `${d.x}:${d.text}`);
  popups.update({ ...game, encounter: fight }, 5000 + fight.bout.strikes[0].at);
  assert.deepEqual(damage(), ["1:6"], "the hero's strike rises off the enemy");
  popups.update({ ...game, encounter: fight }, 5000 + fight.bout.strikes[1].at);
  assert.deepEqual(damage(), ["1:6", "0:5"], "the enemy's rises off the hero");

  const mid = 5000 + fight.bout.strikes[0].at;
  assert.ok(lunges(fight, mid, false).hero.dx > 0.29, "the hero leans into its strike");
  assert.deepEqual(lunges(fight, mid, true).hero, { dx: 0, dy: 0 }, "not with motion reduced");
  assert.ok(lunges(fight, 5000 + fight.bout.strikes[1].at, false).enemy.dx < -0.29);
});
