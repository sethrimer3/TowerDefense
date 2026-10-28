/** Source manifest shared by the measurement tool and its stale-table test. */
import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { createHash } from "node:crypto";
const ROOT = resolve(import.meta.dirname, "..");
const ENTRIES = [
  "src/defend/sim.ts",
  "src/progression.ts",
  "src/specializations.ts",
  "src/campaign/castle-model.ts",
  "src/campaign/siege-dps-catalog.ts",
  "tools/siege-dps-bench.ts",
  "tools/measure-siege-dps.ts",
  "tools/siege-dps-inputs.ts",
];
const EXCLUDE = /^src\/(ui|i18n|profile|mine|library)\//;
export function siegeDpsInputs() {
  const seen = new Set<string>();
  function visit(file: string) {
    const name = relative(ROOT, file).replaceAll("\\", "/");
    if (seen.has(name) || EXCLUDE.test(name)) return;
    seen.add(name);
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      if (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every((e) => e.isTypeOnly))
        continue;
      const spec = statement.moduleSpecifier.text;
      if (spec.startsWith(".") && spec.endsWith(".ts")) visit(resolve(dirname(file), spec));
    }
  }
  ENTRIES.forEach((p) => visit(resolve(ROOT, p)));
  const files = [...seen].sort(),
    digest = createHash("sha256");
  for (const file of files)
    digest
      .update(file + "\0")
      .update(readFileSync(resolve(ROOT, file)))
      .update("\0");
  return { hash: digest.digest("hex"), files };
}
