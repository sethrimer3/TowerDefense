import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
/** Frozen pre-fix renderers for a reproducible A/B, without touching the checkout. */
export function makeReference(ref = process.env.PERF_REF || '3b9f8a9', variant = '') {
  const files = ['render.ts', 'battle-art.ts', 'mage-art.ts', 'ground-relief.ts'];
  mkdirSync('test-results/reference', { recursive: true });
  for (const file of files) {
    const current = variant && (file === 'ground-relief.ts' || (variant === 'scorch' && file === 'mage-art.ts'));
    let source = current ? readFileSync(`src/defend/${file}`, 'utf8') : execFileSync('git', ['show', `${ref}:src/defend/${file}`], { encoding: 'utf8' });
    source = source.replace(/from "\.\.\/(.*?)"/g, 'from "../../src/$1"');
    source = source.replace(/from "\.\/(.*?)"/g, (_, path) => `from "${files.includes(path) ? './' : '../../src/defend/'}${path}"`);
    writeFileSync(`test-results/reference/${file}`, source);
  }
}
