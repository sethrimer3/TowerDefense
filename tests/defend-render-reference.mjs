import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
/** Frozen pre-fix renderers for a reproducible A/B, without touching the checkout. */
export function makeReference(ref = process.env.PERF_REF || '3b9f8a9') {
  const files = ['render.ts', 'battle-art.ts', 'mage-art.ts', 'ground-relief.ts'];
  mkdirSync('test-results/reference', { recursive: true });
  for (const file of files) {
    let source = execFileSync('git', ['show', `${ref}:src/defend/${file}`], { encoding: 'utf8' });
    source = source.replace(/from "\.\/(.*?)"/g, (_, path) => `from "${files.includes(path) ? './' : '../../src/defend/'}${path}"`);
    source = source.replace(/from "\.\.\/(.*?)"/g, 'from "../../src/$1"');
    writeFileSync(`test-results/reference/${file}`, source);
  }
}
