import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ciOnly } from './test-size.ts';

// Its own file, so it runs alongside the rest of the Delve tests; its margins
// are thin, so it keeps its full sample and runs only in CI.
test('Automove intelligence tiers are measurably better on identical labyrinths', ciOnly, async () => {
  const { simulate, AI_LEVELS } = await import('../tools/delve-ai-sim.ts');
  // Six labyrinths, since one unlucky layout can outweigh a smaller sample.
  const sum = (level: keyof typeof AI_LEVELS, f: (r: ReturnType<typeof simulate>) => number) => [0, 1, 2, 3, 4, 5].reduce((s, i) => s + f(simulate(2000 + i, AI_LEVELS[level], { steps: 700 })), 0);
  // Naive Automove walks into more intentionally poor pockets than an AI
  // that can price fights and keys, and reaches less depth for its steps.
  assert.ok(sum('naive', r => r.pockets.poor) > sum('judgment', r => r.pockets.poor));
  assert.ok(sum('full', r => r.depth) > sum('naive', r => r.depth));
});
