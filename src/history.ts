/**
 * Earlier years, for periods older than the live graph.
 *
 * The live graph covers 72 weeks. Older years are read one calendar year per
 * request, only when a chosen period or the graph under it reaches them, and
 * kept for as long as the app runs: one digit of level and one count per day.
 */

import { type Activity, type Calendar, type DayNumber, dayNumber, yearOf } from "./contributions.ts";

/** No GitHub contribution is older than GitHub. */
const FIRST_DAY = dayNumber("2008-01-01");

interface Year {
  readonly first: DayNumber;
  /** One digit 0..4 per day of the year. */
  readonly levels: string;
  readonly counts: number[];
}

export interface History {
  readonly years: Record<number, Year>;
  /** The same years in a list, for walking them without `for...in`, which costs a key list per call on the bar. */
  readonly list: Year[];
  /** The year being read, if any: one request at a time. */
  loading: number | null;
  /** A year read failed; it is tried again on the next scroll. */
  failed: number | null;
  /** Nothing before this day: the newest year found empty below the live graph ends here. */
  floor: DayNumber;
}

export function emptyHistory(): History {
  return { years: {}, list: [], loading: null, failed: null, floor: FIRST_DAY };
}

/** Keeps a year that was read. A year without any contribution sets the floor. */
export function addYear(history: History, activity: Activity, year: number, calendar: Calendar): void {
  const first = dayNumber(`${year}-01-01`);
  const last = dayNumber(`${year}-12-31`);
  let levels = "";
  const counts: number[] = [];
  let any = false;
  let k = 0;
  for (let d = first; d <= last; d += 1) {
    while (k < calendar.day.length && calendar.day[k] < d) k += 1;
    const found = k < calendar.day.length && calendar.day[k] === d;
    const level = found ? calendar.level[k] : 0;
    if (level > 0) any = true;
    levels += String(level);
    counts.push(found ? calendar.count[k] : 0);
  }
  const entry = { first, levels, counts };
  history.years[year] = entry;
  history.list.push(entry);
  // Years are read newest first, so an empty one below the graph means the account is younger.
  if (!any && first < activity.start && last + 1 > history.floor) history.floor = last + 1;
}

/**
 * The read year that holds `day`. Found by comparing day numbers rather than
 * building a Date per day: on the bar a Date costs far more than a few
 * comparisons, and the graph asks for hundreds of days per frame.
 */
function yearHolding(history: History, day: DayNumber): Year | null {
  for (let k = 0; k < history.list.length; k += 1) {
    const year = history.list[k];
    const i = day - year.first;
    if (i >= 0 && i < year.counts.length) return year;
  }
  return null;
}

/**
 * Walks `start`..`end` day by day, handing each day's level and count (-1 when
 * not known) to `visit`. The year is looked up once per stretch of days, not
 * per day: a graph is 504 days and a year 365.
 */
function walk(
  activity: Activity,
  history: History,
  start: DayNumber,
  end: DayNumber,
  visit: (level: number, count: number) => void,
): void {
  let year: Year | null = null;
  let yearEnd = -Infinity;
  for (let d = start; d <= end; d += 1) {
    if (d < history.floor) {
      visit(-1, 0);
      continue;
    }
    const i = d - activity.start;
    if (i >= 0 && d <= activity.end && activity.levels[i] >= 0) {
      visit(activity.levels[i], activity.counts[i]);
      continue;
    }
    if (d > yearEnd) {
      year = yearHolding(history, d);
      yearEnd = year ? year.first + year.counts.length - 1 : d;
    }
    if (year === null) visit(-1, -1);
    else visit(year.levels.charCodeAt(d - year.first) - 48, year.counts[d - year.first]);
  }
}

/** Level of `day`, from the live graph or a year read; -1 when not known. */
export function levelAt(activity: Activity, history: History, day: DayNumber): number {
  if (day < history.floor) return -1;
  if (day >= activity.start && day <= activity.end) {
    const level = activity.levels[day - activity.start];
    if (level >= 0) return level;
  }
  const year = yearHolding(history, day);
  return year ? year.levels.charCodeAt(day - year.first) - 48 : -1;
}

/** Count of `day`, the same way; -1 when not known. Days before the floor count as none. */
export function countAt(activity: Activity, history: History, day: DayNumber): number {
  if (day < history.floor) return 0;
  if (day >= activity.start && day <= activity.end) {
    const count = activity.counts[day - activity.start];
    if (count >= 0) return count;
  }
  const year = yearHolding(history, day);
  return year ? year.counts[day - year.first] : -1;
}

/** Contributions from `start` to `end`, or -1 while some of those days are not read yet. */
export function sumBetween(activity: Activity, history: History, start: DayNumber, end: DayNumber): number {
  let sum = 0;
  let known = true;
  walk(activity, history, start, end, (_level, count) => {
    if (count < 0) known = false;
    else sum += count;
  });
  return known ? sum : -1;
}

/** Levels from `start` to `end`, oldest first; -1 where not known. */
export function levelsBetween(activity: Activity, history: History, start: DayNumber, end: DayNumber): number[] {
  const out: number[] = [];
  walk(activity, history, start, end, (level) => out.push(level));
  return out;
}

/** The newest year between `start` and `end` that is neither in the live graph nor read yet. */
export function missingYear(activity: Activity, history: History, start: DayNumber, end: DayNumber): number | null {
  for (let y = yearOf(end); y >= yearOf(Math.max(start, history.floor)); y -= 1) {
    if (history.years[y]) continue;
    const first = Math.max(dayNumber(`${y}-01-01`), start);
    // Days the live graph already holds need no read.
    if (first >= activity.start) continue;
    return y;
  }
  return null;
}
