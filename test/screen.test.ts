import assert from "node:assert/strict";
import { test } from "node:test";

import type { Activity } from "../src/contributions.ts";
import { activityFrame } from "../src/screen.ts";

function activity(total: number, today: number): Activity {
  return { total, today, start: 0, end: 0, levels: [0], complete: true };
}

const label = (a: Activity) => activityFrame(a).find((e) => e.id === "label");

test("the label sits after the total", () => {
  const el = label(activity(100, 0)) as { x: number; text: string };
  assert.equal(el.text, "contribs");
  // "100" ends at x 10; columns 11..14 stay dark.
  assert.equal(el.x, 15);
});

test("a long total next to a busy day drops the label", () => {
  assert.ok(label(activity(9999, 99)));
  assert.equal(label(activity(123456, 123)), undefined);
});

test("a quiet day is dimmed", () => {
  const today = activityFrame(activity(5, 0)).find((e) => e.id === "today") as { color: string; text: string };
  assert.equal(today.text, "+0");
  assert.equal(today.color, "#5A5A5AFF");
});
