/**
 * Numbers the week view and the back screen show, worked out from the graph's
 * days. Nothing here reads the network.
 *
 * Only what the contribution graph itself shows, counted: no streaks. GitHub
 * dropped its streak counters in 2016, and without them on the profile the word
 * means nothing to most people.
 */

import { type Activity, type DayNumber, weekday } from "./contributions.ts";
import { DAYS_PER_WEEK } from "./layout.ts";

export interface Stats {
  /** Days with at least one contribution among the last YEAR_DAYS. */
  readonly activeDays: number;
  /** The busiest day of the last year, or null before any counts are known. */
  readonly best: { readonly day: DayNumber; readonly count: number } | null;
  /** Contributions this calendar month, up to today. */
  readonly monthTotal: number;
  /** Contributions per day of this week, Sunday first; -1 for the days still to come. */
  readonly week: readonly number[];
  /** The same for last week, every day known. */
  readonly lastWeek: readonly number[];
  readonly weekTotal: number;
  readonly lastWeekTotal: number;
  /** The counts of both weeks and this month are known: before the first read, only levels come from the cache. */
  readonly countsKnown: boolean;
}

/** Today and the 364 days before it. */
export const YEAR_DAYS = 365;

export function computeStats(activity: Activity): Stats {
  const { levels, counts } = activity;
  const last = levels.length - 1;
  let countsKnown = true;

  let activeDays = 0;
  let best: Stats["best"] = null;
  for (let d = Math.max(0, last - YEAR_DAYS + 1); d <= last; d += 1) {
    if (levels[d] > 0) activeDays += 1;
    const c = counts[d];
    // The later of two equal days wins: it is the one people remember.
    if (c > 0 && (best === null || c >= best.count)) best = { day: activity.start + d, count: c };
  }

  const firstOfMonth = last - (new Date(activity.end * 86400000).getUTCDate() - 1);
  let monthTotal = 0;
  for (let d = Math.max(0, firstOfMonth); d <= last; d += 1) {
    if (counts[d] < 0) countsKnown = false;
    monthTotal += Math.max(0, counts[d]);
  }

  const sunday = last - weekday(activity.end);
  const week: number[] = [];
  const lastWeek: number[] = [];
  if (sunday - DAYS_PER_WEEK < 0) countsKnown = false;
  let weekTotal = 0;
  let lastWeekTotal = 0;
  for (let k = 0; k < DAYS_PER_WEEK; k += 1) {
    const now = sunday + k <= last ? counts[sunday + k] : -1;
    const before = sunday - DAYS_PER_WEEK + k >= 0 ? counts[sunday - DAYS_PER_WEEK + k] : -1;
    if ((sunday + k <= last && now < 0) || before < 0) countsKnown = false;
    week.push(sunday + k <= last ? Math.max(0, now) : -1);
    lastWeek.push(Math.max(0, before));
    weekTotal += Math.max(0, now);
    lastWeekTotal += Math.max(0, before);
  }

  return { activeDays, best, monthTotal, week, lastWeek, weekTotal, lastWeekTotal, countsKnown };
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "MAR 12" */
export function dayLabel(day: DayNumber): string {
  const d = new Date(day * 86400000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "MAR 2024" */
export function monthLabel(day: DayNumber): string {
  const d = new Date(day * 86400000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "MAR" */
export function monthName(day: DayNumber): string {
  return MONTHS[new Date(day * 86400000).getUTCMonth()];
}
