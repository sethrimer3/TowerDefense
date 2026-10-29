/** The artist's sprites saved under `art/sprites/` (see `art-overrides.ts`),
 * found by Vite when it builds: path from `art/sprites/` to URL. Browser
 * only; Node never imports this. */
const found = (import.meta as ImportMeta & { glob(pattern: string, options: object): Record<string, string> }).glob("/art/sprites/**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

export const artFiles = (): Record<string, string> =>
  Object.fromEntries(Object.entries(found).map(([path, url]) => [path.replace(/^\/art\/sprites\//, ""), url]));
