import { test } from "node:test";
import assert from "node:assert/strict";
import { panelSide, PANEL_SIZE } from "../src/ui/building-panel.ts";

test("the building panel stands on the right unless it would cover the building there", () => {
  const w = PANEL_SIZE.desktop, width = 1000, m = PANEL_SIZE.margin;
  assert.equal(panelSide(100, 140, width, w), "right");
  assert.equal(panelSide(900, 940, width, w), "left");
  // Just clear of the right panel's edge stays right.
  assert.equal(panelSide(width - m - w - 40, width - m - w, width, w), "right");
  // Covered on both sides (a narrow board): it stays where it was.
  assert.equal(panelSide(150, 260, 400, 148, "left"), "left");
  assert.equal(panelSide(150, 260, 400, 148, "right"), "right");
  // Once on the left, it comes back right when the right is clear again.
  assert.equal(panelSide(100, 140, width, w, "left"), "right");
});
