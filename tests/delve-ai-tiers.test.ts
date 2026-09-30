import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ciOnly } from './test-size.ts';

// Its own file, so it runs alongside the rest of the Delve tests; its margins
// are thin, so it keeps its full sample and runs only in CI.
test('Automove intelligence tiers are measurably better on identical labyrinths', ciOnly, async () => {
  const { simulate, AI_LEVELS } = await import('../tools/delve-ai-sim.ts');
  // Eight labyrinths, since one unlucky layout can outweigh a smaller sample.
  const runs = (level: keyof typeof AI_LEVELS) => [0, 1, 2, 3, 4, 5, 6, 7].map(i => simulate(2000 + i, AI_LEVELS[level], { steps: 700, depthAt: 350 }));
  const sum = (rs: ReturnType<typeof runs>, f: (r: ReturnType<typeof simulate>) => number) => rs.reduce((s, r) => s + f(r), 0);
  const naive = runs('naive'), judgment = runs('judgment');
  // An AI that can price fights and keys reaches more depth for its steps
  // (compared halfway, before the first milestone gate's boss, which this
  // hero can't beat), loses less HP for each depth it gains, and finds more
  // of the pockets worth entering. With a guard in most corridors, both
  // enter too few intentionally poor pockets to compare.
  assert.ok(sum(judgment, r => r.depthAt) > sum(naive, r => r.depthAt));
  assert.ok(sum(judgment, r => r.hpLost) / sum(judgment, r => r.depth) < sum(naive, r => r.hpLost) / sum(naive, r => r.depth));
  assert.ok(sum(judgment, r => r.pockets.good) > sum(naive, r => r.pockets.good));
});
