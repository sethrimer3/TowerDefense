import { test } from "node:test";
import assert from "node:assert/strict";
import { within, mayAutoReload, RETRY_GAP_MS } from "../src/ui/boot-guard.ts";

test("within passes on a value that arrives in time", async () => {
  assert.equal(await within(Promise.resolve(7), 1000, 0), 7);
});

test("within gives the fallback when a promise never settles", async () => {
  assert.equal(await within(new Promise<number>(() => {}), 5, -1), -1);
});

test("within still rejects a real failure", async () => {
  await assert.rejects(within(Promise.reject(new Error("boom")), 1000, 0), /boom/);
});

test("mayAutoReload reloads once per gap, then leaves it to the button", () => {
  const map = new Map<string, string>();
  const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
  assert.equal(mayAutoReload(storage, 1_000_000), true);
  assert.equal(mayAutoReload(storage, 1_000_000 + 1000), false);
  assert.equal(mayAutoReload(storage, 1_000_000 + RETRY_GAP_MS + 1), true);
  assert.equal(mayAutoReload(null, 0), false);
  assert.equal(mayAutoReload({ getItem: () => { throw new Error("blocked"); }, setItem: () => {} }, 0), false);
});
