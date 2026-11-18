import assert from "node:assert/strict";
import { test } from "node:test";

import { heatmapXpm, litXpm } from "../src/heatmap.ts";
import { periodLine } from "../src/screen.ts";

const byId = (elements: ReturnType<typeof periodLine>, id: string) =>
  elements.find((e) => e.id === id) as { text?: string; color?: string; x: number; width?: number };

test("the period line: label from x 11, the count in green at the right edge, both with shadows", () => {
  const line = periodLine("Last week", 1333);
  assert.equal(byId(line, "label").text, "Last week");
  assert.equal(byId(line, "label").x, 11);
  assert.equal(byId(line, "label_shadow").text, "Last week");
  assert.equal(byId(line, "label_shadow").color, "#262C36FF");
  assert.equal(byId(line, "count_shadow").color, "#122318FF");
  assert.equal(byId(line, "count").text, "1333");
  assert.equal(byId(line, "count").color, "#3FC069FF");
  assert.equal(byId(line, "label").width, undefined);
});

test("a count still being read shows dots", () => {
  assert.equal(byId(periodLine("2019", -1), "count").text, "...");
});

test("a user name too long for the room scrolls inside it", () => {
  const label = byId(periodLine("a-very-long-github-user", 909), "label");
  assert.ok(label.width !== undefined && label.width > 0 && 11 + label.width < 72);
});

test("the dimmed graph and the layer that lights the period", () => {
  const dim = heatmapXpm([4, 4, 4], Infinity, -1).split("\n").slice(-7);
  assert.equal(dim[0][0], "9");
  // Days 8..9 sit in column 1, rows 1..2: a one-column layer from column 1.
  const levels = new Array(14).fill(2);
  const layer = litXpm(levels, 8, 9);
  assert.equal(layer.column, 1);
  const rows = layer.data.split("\n").slice(-7);
  assert.deepEqual(rows.map((r) => r), [" ", "2", "2", " ", " ", " ", " "]);
});
