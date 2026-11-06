/**
 * Reads a GitHub user's contribution calendar.
 *
 * GitHub itself serves the calendar only as a 220 KB HTML page, more than the
 * app's whole heap. The open-source github-contributions-api
 * (https://github.com/grubersjoe/github-contributions-api) scrapes that page and
 * answers with compact JSON, no token needed:
 *
 *   {"total":{"lastYear":100},"contributions":[{"date":"2025-11-02","count":0,"level":0},...]}
 *
 * `?y=last` covers the last year up to today; `?y=2025` a calendar year. The
 * response is scanned as text for the three fields the app needs, so the
 * hundreds of day objects are never built.
 */

import { DAYS_PER_WEEK, WEEKS } from "./layout.ts";

export const API_BASE = "https://github-contributions-api.jogruber.de/v4/";

/** Days since 1970-01-01, the unit all date maths here works in. */
export type DayNumber = number;

const MS_PER_DAY = 86400000;

/** "2025-11-02" -> day number, or NaN for anything else. */
export function dayNumber(date: string): DayNumber {
  if (date.length !== 10 || date[4] !== "-" || date[7] !== "-") return NaN;
  const y = parseInt(date.substring(0, 4), 10);
  const m = parseInt(date.substring(5, 7), 10);
  const d = parseInt(date.substring(8, 10), 10);
  if (!(y > 1970 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return NaN;
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/** 0 = Sunday .. 6 = Saturday. 1970-01-01 was a Thursday. */
export function weekday(day: DayNumber): number {
  return (((day + 4) % 7) + 7) % 7;
}

export function yearOf(day: DayNumber): number {
  return new Date(day * MS_PER_DAY).getUTCFullYear();
}

/** One day of the calendar. */
export interface Day {
  readonly day: DayNumber;
  readonly count: number;
  /** 0..4, GitHub's own quartiles for this user. */
  readonly level: number;
}

/** What one response holds, in date order. */
export interface Calendar {
  /** `total.lastYear` for `?y=last`; -1 when the response has none. */
  readonly lastYear: number;
  readonly days: Day[];
}

/** The value after `"name":` inside `chunk`: a number, or the text of a string. */
function field(chunk: string, name: string): string | null {
  const key = `"${name}":`;
  const at = chunk.indexOf(key);
  if (at < 0) return null;
  let i = at + key.length;
  while (chunk[i] === " ") i += 1;
  if (chunk[i] === '"') {
    const end = chunk.indexOf('"', i + 1);
    return end < 0 ? null : chunk.substring(i + 1, end);
  }
  let end = i;
  while (end < chunk.length && "-0123456789.".indexOf(chunk[end]) >= 0) end += 1;
  return end > i ? chunk.substring(i, end) : null;
}

/**
 * Scans a response. Days outside `from`..`to` (inclusive, when given) are
 * skipped, so a calendar year read for a few weeks keeps only those weeks.
 */
export function parseCalendar(text: string, from = -Infinity, to = Infinity): Calendar {
  const list = text.indexOf('"contributions"');
  if (list < 0) throw new Error("unexpected response");

  const head = text.substring(0, list);
  const totalAt = head.indexOf('"lastYear":');
  const lastYear = totalAt < 0 ? -1 : parseInt(field(head.substring(totalAt), "lastYear") ?? "", 10);

  const days: Day[] = [];
  let pos = list;
  for (;;) {
    const open = text.indexOf("{", pos);
    if (open < 0) break;
    const close = text.indexOf("}", open);
    if (close < 0) break;
    const chunk = text.substring(open, close);
    pos = close + 1;

    const day = dayNumber(field(chunk, "date") ?? "");
    const count = parseInt(field(chunk, "count") ?? "", 10);
    const level = parseInt(field(chunk, "level") ?? "", 10);
    if (isNaN(day) || isNaN(count) || day < from || day > to) continue;
    days.push({ day, count: Math.max(0, count), level: isNaN(level) ? 0 : Math.max(0, Math.min(4, level)) });
  }
  if (days.length === 0 && from === -Infinity) throw new Error("no days in response");
  return { lastYear: isNaN(lastYear) ? -1 : lastYear, days };
}

/** Everything the screen shows. */
export interface Activity {
  /** Contributions in the last year, as GitHub's profile page counts them. */
  readonly total: number;
  readonly today: number;
  /** The first day of the graph: the Sunday that starts its leftmost column. */
  readonly start: DayNumber;
  /** The last day of the calendar: today, by GitHub's clock. */
  readonly end: DayNumber;
  /** One level per day from `start` to `end`, oldest first; -1 where it is not known yet. */
  readonly levels: number[];
  /** Every day of the graph is known: nothing older needs to be read. */
  readonly complete: boolean;
}

/** Level of `day` in `activity`, or -1 when it does not hold that day. */
function levelIn(activity: Activity, day: DayNumber): number {
  const i = day - activity.start;
  return i >= 0 && i < activity.levels.length ? activity.levels[i] : -1;
}

/** First day of the graph: the Sunday that starts the leftmost column. */
export function graphStart(end: DayNumber): DayNumber {
  return end - weekday(end) - (WEEKS - 1) * DAYS_PER_WEEK;
}

/**
 * The calendar years to read for the graph's days older than `recent` covers:
 * `?y=last` reaches back about 53 weeks, the graph 72.
 */
export function olderYears(recent: Calendar): number[] {
  const start = graphStart(recent.days[recent.days.length - 1].day);
  const firstKnown = recent.days[0].day;
  const years: number[] = [];
  for (let y = yearOf(start); start < firstKnown && y <= yearOf(firstKnown - 1); y += 1) years.push(y);
  return years;
}

/**
 * Merges what is known into what the screen shows: the last year from `recent`,
 * older weeks from `older` or, when those were read on an earlier refresh, from
 * `previous`. Older weeks never change, so they are read once per profile.
 */
export function buildActivity(
  recent: Calendar,
  older: Calendar | null,
  previous: Activity | null,
): Activity {
  const last = recent.days[recent.days.length - 1];
  const start = graphStart(last.day);
  const levels: number[] = [];
  for (let d = start; d <= last.day; d += 1) levels.push(previous ? levelIn(previous, d) : -1);

  const place = (days: readonly Day[]) => {
    for (const entry of days) {
      const i = entry.day - start;
      if (i >= 0 && i < levels.length) levels[i] = entry.level;
    }
  };
  if (older) place(older.days);
  place(recent.days);

  // A day the service skipped inside a range it did answer is a day without contributions.
  const firstKnown = recent.days[0].day;
  const olderKnown = older !== null || (previous !== null && previous.complete && previous.start <= start);
  for (let i = 0; i < levels.length; i += 1) {
    if (levels[i] < 0 && (start + i >= firstKnown || olderKnown)) levels[i] = 0;
  }

  let total = recent.lastYear;
  if (total < 0) {
    total = 0;
    for (const entry of recent.days) total += entry.count;
  }
  return { total, today: last.count, start, end: last.day, levels, complete: olderKnown || start >= firstKnown };
}

/** The user does not exist: worth a different message than a network error. */
export class NotFoundError extends Error {}

/** Rejects a request that never answers, so a stalled refresh cannot block the next one. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("timeout"));
    }, ms);

    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

async function readCalendar(
  user: string,
  years: string,
  timeoutMs: number,
  from?: DayNumber,
  to?: DayNumber,
): Promise<Calendar> {
  const response = await withTimeout(fetch(`${API_BASE}${user}?${years}`), timeoutMs);
  if (response.status === 404) throw new NotFoundError(user);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseCalendar(await withTimeout(response.text(), timeoutMs), from, to);
}

/** The last year, up to today. */
export function readRecent(user: string, timeoutMs: number): Promise<Calendar> {
  return readCalendar(user, "y=last", timeoutMs);
}

/** The graph's weeks before the last year, kept to just those days. */
export function readOlder(user: string, recent: Calendar, timeoutMs: number): Promise<Calendar> {
  const query = olderYears(recent).map((y) => `y=${y}`).join("&");
  const end = recent.days[recent.days.length - 1].day;
  return readCalendar(user, query, timeoutMs, graphStart(end), recent.days[0].day - 1);
}
