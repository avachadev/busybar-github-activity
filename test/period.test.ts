import assert from "node:assert/strict";
import { test } from "node:test";

import { dayNumber, graphStart } from "../src/contributions.ts";
import { DAYS_PER_WEEK, WEEKS } from "../src/layout.ts";
import { graphWindow, maxOffset, period } from "../src/period.ts";

// Wednesday 18 November 2026.
const TODAY = dayNumber("2026-11-18");
const D = (s: string) => dayNumber(s);

test("days: today, yesterday, then dates", () => {
  assert.deepEqual(period("day", 0, TODAY), { start: TODAY, end: TODAY, label: "Today" });
  assert.equal(period("day", 1, TODAY).label, "Yesterday");
  assert.equal(period("day", 3, TODAY).label, "Nov 15");
});

test("weeks run Sunday to Saturday; this week stops at today", () => {
  assert.deepEqual(period("week", 0, TODAY), { start: D("2026-11-15"), end: TODAY, label: "This week" });
  assert.equal(period("week", 1, TODAY).label, "Last week");
  assert.deepEqual(period("week", 2, TODAY), { start: D("2026-11-01"), end: D("2026-11-07"), label: "Nov 1-7" });
  assert.equal(period("week", 3, TODAY).label, "Oct 25-31");
  assert.equal(period("week", 4, TODAY).label, "Oct 18-24");
  assert.equal(period("week", 7, TODAY).label, "Sep 27-3");
});

test("months: this, last, then month and year, across a year boundary", () => {
  assert.deepEqual(period("month", 0, TODAY), { start: D("2026-11-01"), end: TODAY, label: "This mnth" });
  assert.deepEqual(period("month", 1, TODAY), { start: D("2026-10-01"), end: D("2026-10-31"), label: "Last mnth" });
  assert.deepEqual(period("month", 11, TODAY), { start: D("2025-12-01"), end: D("2025-12-31"), label: "Dec 2025" });
});

test("years: the last 365 days first, then calendar years", () => {
  assert.deepEqual(period("year", 0, TODAY), { start: TODAY - 364, end: TODAY, label: "Last year" });
  assert.deepEqual(period("year", 1, TODAY), { start: D("2026-01-01"), end: TODAY, label: "2026" });
  assert.deepEqual(period("year", 2, TODAY), { start: D("2025-01-01"), end: D("2025-12-31"), label: "2025" });
});

test("the graph stays live while the period is in it, else ends with the period's week", () => {
  assert.deepEqual(graphWindow(period("year", 0, TODAY), TODAY), { start: graphStart(TODAY), end: TODAY });
  const w = graphWindow(period("year", 3, TODAY), TODAY);
  assert.equal(w.end, D("2025-01-04"));
  assert.equal(w.end - w.start + 1, WEEKS * DAYS_PER_WEEK);
});

test("the wheel stops at the floor", () => {
  const floor = D("2025-01-01");
  assert.equal(maxOffset("year", TODAY, floor), 2);
  assert.equal(period("month", maxOffset("month", TODAY, floor), TODAY).label, "Jan 2025");
});
