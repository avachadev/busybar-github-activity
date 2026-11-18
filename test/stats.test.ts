import assert from "node:assert/strict";
import { test } from "node:test";

import { type Activity, dayNumber, graphStart, parseCalendar } from "../src/contributions.ts";
import { addYear, countAt, emptyHistory, levelAt, missingYear, sumBetween } from "../src/history.ts";
import { computeStats, dayLabel, monthLabel } from "../src/stats.ts";

/** A complete graph ending on `end`, with the given counts for its last days (oldest first). */
function activity(end: string, tail: number[]): Activity {
  const last = dayNumber(end);
  const start = graphStart(last);
  const counts: number[] = [];
  for (let d = start; d <= last; d += 1) counts.push(0);
  tail.forEach((c, i) => (counts[counts.length - tail.length + i] = c));
  const levels = counts.map((c) => (c === 0 ? 0 : Math.min(4, 1 + Math.floor(c / 5))));
  return { total: 0, today: counts[counts.length - 1], start, end: last, levels, counts, complete: true };
}

// 2026-11-18 is a Wednesday.
const WED = "2026-11-18";

test("active days count the days with contributions in the last year", () => {
  assert.equal(computeStats(activity(WED, [0, 3, 1, 2, 0])).activeDays, 3);
  assert.equal(computeStats(activity(WED, [])).activeDays, 0);
});

test("this month runs from the 1st to today", () => {
  // 2026-11-18: the 18 days of November hold 5 + 2; October's last day does not count.
  const tail = new Array(19).fill(0);
  tail[0] = 100;
  tail[1] = 5;
  tail[18] = 2;
  assert.equal(computeStats(activity(WED, tail)).monthTotal, 7);
});

test("the busiest day, the later one on a tie", () => {
  const s = computeStats(activity(WED, [9, 0, 9, 1]));
  assert.equal(s.best?.count, 9);
  assert.equal(dayLabel(s.best?.day ?? 0), "NOV 17");
});

test("this week from Sunday, days to come left out, against last week", () => {
  // Last Sunday 2026-11-08 .. this Wednesday 2026-11-18: 11 days.
  const s = computeStats(activity(WED, [1, 2, 3, 4, 5, 6, 7, 10, 20, 30, 40]));
  assert.deepEqual(s.lastWeek, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(s.week, [10, 20, 30, 40, -1, -1, -1]);
  assert.equal(s.lastWeekTotal, 28);
  assert.equal(s.weekTotal, 100);
  assert.ok(s.countsKnown);
});

test("weeks without counts are marked unknown", () => {
  const a = activity(WED, [1, 2, 3]);
  const counts = a.counts.slice();
  counts[counts.length - 2] = -1;
  assert.equal(computeStats({ ...a, counts }).countsKnown, false);
});

test("month labels", () => {
  assert.equal(monthLabel(dayNumber("2024-03-09")), "MAR 2024");
});

/** A year's response with one contribution on `day`, or none. */
function year(y: number, day: string | null): string {
  const items: string[] = [];
  for (let d = dayNumber(`${y}-01-01`); d <= dayNumber(`${y}-12-31`); d += 1) {
    const date = new Date(d * 86400000).toISOString().substring(0, 10);
    const c = date === day ? 3 : 0;
    items.push(`{"date":"${date}","count":${c},"level":${c > 0 ? 2 : 0}}`);
  }
  return `{"total":{"${y}":0},"contributions":[${items.join(",")}]}`;
}

test("earlier years are read newest first, only where the live graph has no days", () => {
  const a = activity(WED, [1]);
  const h = emptyHistory();
  assert.equal(missingYear(a, h, a.start, a.end), null);
  assert.equal(missingYear(a, h, dayNumber("2024-03-01"), a.end), 2025);
  addYear(h, a, 2025, parseCalendar(year(2025, "2025-02-03")));
  assert.equal(missingYear(a, h, dayNumber("2024-03-01"), a.end), 2024);
});

test("a read year answers levels, counts and sums; days not read are unknown", () => {
  const a = activity(WED, [1]);
  const h = emptyHistory();
  addYear(h, a, 2025, parseCalendar(year(2025, "2025-02-03")));
  assert.equal(levelAt(a, h, dayNumber("2025-02-03")), 2);
  assert.equal(countAt(a, h, dayNumber("2025-02-03")), 3);
  assert.equal(sumBetween(a, h, dayNumber("2025-02-01"), dayNumber("2025-02-28")), 3);
  assert.equal(sumBetween(a, h, dayNumber("2024-12-30"), dayNumber("2025-01-02")), -1);
});

test("an empty year below the graph is the floor; days before it are empty", () => {
  const a = activity(WED, [1]);
  const h = emptyHistory();
  addYear(h, a, 2024, parseCalendar(year(2024, null)));
  assert.equal(h.floor, dayNumber("2025-01-01"));
  assert.equal(countAt(a, h, dayNumber("2024-06-01")), 0);
  assert.equal(levelAt(a, h, dayNumber("2024-06-01")), 0);
});
