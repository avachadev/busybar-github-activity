/**
 * The periods the front screen shows: a day, a week, a month or a year, and how
 * far back. Offset 0 is the current one; each wheel click goes one further back.
 *
 *   day    Today, Yesterday, Nov 15, ...
 *   week   This week (Sunday to today), Last week, Nov 2-8, ...
 *   month  This mnth, Last mnth, Sep 2026, ...
 *   year   Last year (the last 365 days; GitHub's profile starts a few days earlier,
 *          on the Sunday of the week a year ago), 2026, 2025, ...
 */

import { type DayNumber, dayNumber, graphStart, weekday, yearOf } from "./contributions.ts";
import { DAYS_PER_WEEK, WEEKS } from "./layout.ts";

export type Unit = "day" | "week" | "month" | "year";
export const UNITS: readonly Unit[] = ["day", "week", "month", "year"];

export interface Period {
  readonly start: DayNumber;
  /** The last day, never after today. */
  readonly end: DayNumber;
  readonly label: string;
}

const MS = 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function date(day: DayNumber): Date {
  return new Date(day * MS);
}

function monthDay(day: DayNumber): string {
  const d = date(day);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function firstOfMonth(year: number, month: number): DayNumber {
  return Math.round(Date.UTC(year, month, 1) / MS);
}

/** The period `offset` steps back from the one that holds `today`. */
export function period(unit: Unit, offset: number, today: DayNumber): Period {
  if (unit === "day") {
    const day = today - offset;
    return { start: day, end: day, label: offset === 0 ? "Today" : offset === 1 ? "Yesterday" : monthDay(day) };
  }
  if (unit === "week") {
    const start = today - weekday(today) - offset * DAYS_PER_WEEK;
    const end = Math.min(today, start + DAYS_PER_WEEK - 1);
    let label = offset === 0 ? "This week" : offset === 1 ? "Last week" : "";
    if (label === "") {
      const a = date(start);
      const b = date(start + DAYS_PER_WEEK - 1);
      label = a.getUTCMonth() === b.getUTCMonth()
        ? `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()}-${b.getUTCDate()}`
        : `${monthDay(start)}-${b.getUTCDate()}`;
    }
    return { start, end, label };
  }
  if (unit === "month") {
    const t = date(today);
    const index = t.getUTCFullYear() * 12 + t.getUTCMonth() - offset;
    const y = Math.floor(index / 12);
    const m = index % 12;
    const start = firstOfMonth(y, m);
    const end = Math.min(today, firstOfMonth(m === 11 ? y + 1 : y, (m + 1) % 12) - 1);
    const label = offset === 0 ? "This mnth" : offset === 1 ? "Last mnth" : `${MONTHS[m]} ${y}`;
    return { start, end, label };
  }
  if (offset === 0) return { start: today - 364, end: today, label: "Last year" };
  const y = yearOf(today) - (offset - 1);
  return { start: dayNumber(`${y}-01-01`), end: Math.min(today, dayNumber(`${y}-12-31`)), label: String(y) };
}

/** How many steps back the unit can go before its period starts before `floor`. */
export function maxOffset(unit: Unit, today: DayNumber, floor: DayNumber): number {
  let lo = 0;
  let hi = unit === "day" ? 7000 : unit === "week" ? 1000 : unit === "month" ? 240 : 20;
  // The newest offset whose period still ends on or after the floor.
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (period(unit, mid, today).end >= floor) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The graph's 72 weeks under a period: the live ones while the period is among
 * them, otherwise the 72 weeks that end with the period's week.
 */
export function graphWindow(p: Period, today: DayNumber): { start: DayNumber; end: DayNumber } {
  const live = graphStart(today);
  if (p.start >= live) return { start: live, end: today };
  const saturday = p.end - weekday(p.end) + DAYS_PER_WEEK - 1;
  return { start: saturday - WEEKS * DAYS_PER_WEEK + 1, end: Math.min(today, saturday) };
}
