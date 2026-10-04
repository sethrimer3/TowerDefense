import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
/** Frozen pre-fix renderers for a reproducible A/B, without touching the checkout. */
export function makeReference(ref = process.env.PERF_REF || '3b9f8a9', variant = '') {
  const files = ['render.ts', 'battle-art.ts', 'mage-art.ts', 'ground-relief.ts', 'pixel-fx.ts', 'wizard-art.ts', 'blast-art.ts', 'dark-art.ts'];
  const sources = new Map();
  for (const file of files) {
    const current = variant && (file === 'ground-relief.ts' || (variant === 'scorch' && file === 'mage-art.ts') || (variant === 'combat' && file !== 'pixel-fx.ts'));
    let source = current ? readFileSync(`src/defend/${file}`, 'utf8') : execFileSync('git', ['show', `${ref}:src/defend/${file}`], { encoding: 'utf8' });
    source = source.replace(/from "\.\.\/(.*?)"/g, 'from "../../src/$1"');
    source = source.replace(/from "\.\/(.*?)"/g, (_, path) => `from "${files.includes(path) ? './' : '../../src/defend/'}${path}"`);
    sources.set(file, source);
  }
  // Vite ignores test-results for watching. Content-address the directory so
  // its module cache cannot silently substitute an earlier A/B variant.
  const digest = createHash('sha256').update([...sources.values()].join('\n')).digest('hex').slice(0,16);
  const directory = `test-results/reference-${digest}`;
  mkdirSync(directory, { recursive: true });
  for (const [file,source] of sources) writeFileSync(`${directory}/${file}`,source);
  return `/${directory}`;
}
