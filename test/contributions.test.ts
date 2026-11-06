import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildActivity,
  dayNumber,
  graphStart,
  olderYears,
  parseCalendar,
  weekday,
} from "../src/contributions.ts";
import { heatmapXpm } from "../src/heatmap.ts";
import { DAYS_PER_WEEK, WEEKS } from "../src/layout.ts";

/** A response shaped like the service's, for `days` days ending on `end`. */
function response(end: string, days: number, total: number | null, count: (i: number) => number): string {
  const last = dayNumber(end);
  const items: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date((last - days + 1 + i) * 86400000).toISOString().substring(0, 10);
    const c = count(i);
    items.push(`{"date":"${d}","count":${c},"level":${Math.min(4, c)}}`);
  }
  const head = total === null ? `{"total":{"2025":0}` : `{"total":{"lastYear":${total}}`;
  return `${head},"contributions":[${items.join(",")}]}`;
}

test("day numbers and weekdays", () => {
  assert.equal(dayNumber("1970-01-02"), NaN);
  assert.equal(weekday(dayNumber("2026-11-06")), 5);
  assert.equal(weekday(dayNumber("2025-11-02")), 0);
  assert.ok(isNaN(dayNumber("2026-13-01")));
  assert.ok(isNaN(dayNumber("nope")));
});

test("parses the three fields and nothing else", () => {
  const cal = parseCalendar(response("2026-11-06", 3, 42, (i) => i * 2));
  assert.equal(cal.lastYear, 42);
  assert.deepEqual(cal.days.map((d) => d.count), [0, 2, 4]);
  assert.deepEqual(cal.days.map((d) => d.level), [0, 2, 4]);
  assert.equal(cal.days[2].day, dayNumber("2026-11-06"));
});

test("tolerates reordered keys and spaces", () => {
  const cal = parseCalendar('{"contributions": [{"level": 3, "count": 7, "date": "2026-01-05"}], "total": {"lastYear": 7}}');
  assert.deepEqual(cal.days, [{ day: dayNumber("2026-01-05"), count: 7, level: 3 }]);
  assert.equal(cal.lastYear, -1);
});

test("rejects an error body", () => {
  assert.throws(() => parseCalendar('{"error":"GitHub user \\"x\\" not found."}'));
});

test("keeps only the days in range", () => {
  const text = response("2025-12-31", 365, null, () => 1);
  const cal = parseCalendar(text, dayNumber("2025-12-01"), dayNumber("2025-12-10"));
  assert.equal(cal.days.length, 10);
});

test("the graph starts on a Sunday, 72 weeks back", () => {
  const end = dayNumber("2026-11-06");
  const start = graphStart(end);
  assert.equal(weekday(start), 0);
  assert.equal(end - start, (WEEKS - 1) * DAYS_PER_WEEK + weekday(end));
});

test("asks for the calendar years the last year does not cover", () => {
  const recent = parseCalendar(response("2026-11-06", 370, 100, () => 0));
  assert.deepEqual(olderYears(recent), [2025]);
  const early = parseCalendar(response("2026-02-10", 370, 100, () => 0));
  assert.deepEqual(olderYears(early), [2024, 2025]);
});

test("merges both calendars into one level per day", () => {
  const recent = parseCalendar(response("2026-11-06", 370, 100, (i) => (i === 369 ? 5 : 1)));
  const start = graphStart(recent.days[recent.days.length - 1].day);
  const older = parseCalendar(response("2025-12-31", 365, null, () => 2), start, recent.days[0].day - 1);
  const first = buildActivity(recent, null, null);
  assert.ok(!first.complete);
  assert.equal(first.levels[0], -1);
  assert.equal(first.levels[first.levels.length - 1], 4);
  const activity = buildActivity(recent, older, first);
  assert.ok(activity.complete);

  assert.equal(activity.total, 100);
  assert.equal(activity.today, 5);
  assert.equal(activity.levels.length, (WEEKS - 1) * DAYS_PER_WEEK + weekday(activity.end) + 1);
  assert.equal(activity.levels[0], 2);
  assert.equal(activity.levels[activity.levels.length - 1], 4);
  assert.ok(!activity.levels.includes(0));
});

test("sums the counts when the total is missing", () => {
  const recent = parseCalendar(response("2026-11-06", 10, null, () => 3));
  assert.equal(buildActivity(recent, null, null).total, 30);
});

test("the bitmap is 72x7 with future days transparent", () => {
  const recent = parseCalendar(response("2026-11-06", 370, 1, () => 1));
  const xpm = heatmapXpm(buildActivity(recent, null, null).levels).split("\n");
  assert.equal(xpm[1], "72 7 6 1");
  const rows = xpm.slice(8);
  assert.equal(rows.length, 7);
  for (const row of rows) assert.equal(row.length, 72);
  // 2026-11-06 is a Friday: Saturday, the last row of the last column, has not happened yet.
  assert.equal(rows[5][71], "1");
  assert.equal(rows[6][71], " ");
  // Older than the last year and not read yet: blank until it arrives.
  assert.equal(rows[0][0], " ");
  assert.equal(rows[0][71], "1");
});

test("a refresh a week later keeps the older weeks without reading them", () => {
  const older = (cal: ReturnType<typeof parseCalendar>) =>
    parseCalendar(response("2025-12-31", 600, null, () => 3), graphStart(cal.days[cal.days.length - 1].day), cal.days[0].day - 1);
  const week1 = parseCalendar(response("2026-11-06", 370, 10, () => 1));
  const full = buildActivity(week1, older(week1), null);
  const week2 = parseCalendar(response("2026-11-13", 370, 10, () => 1));
  const next = buildActivity(week2, null, full);
  assert.ok(next.complete);
  assert.equal(next.levels[0], 3);
  assert.ok(!next.levels.includes(-1));
});

test("the year boundary early in the year needs two older years", () => {
  const recent = parseCalendar(response("2026-02-10", 370, 0, () => 0));
  assert.deepEqual(olderYears(recent), [2024, 2025]);
});
