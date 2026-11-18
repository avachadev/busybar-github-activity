/**
 * Keeps the last complete graph in `localStorage`, so the app opens on it at
 * once instead of after two slow reads, and needs only the last year to refresh.
 *
 * Every `setItem` rewrites the app's store to flash, so the graph is saved only
 * when it changed: a few times a day at most.
 */

import type { Activity } from "./contributions.ts";

const KEY = "activity";

interface Stored {
  readonly user: string;
  readonly total: number;
  readonly today: number;
  readonly start: number;
  readonly end: number;
  /** One digit per day, 0..4. */
  readonly levels: string;
  /** Contributions per day, comma-separated, empty where not known. Absent in caches from 1.0. */
  readonly counts?: string;
}

function storage(): Storage | undefined {
  return (globalThis as { localStorage?: Storage }).localStorage;
}

export function loadActivity(user: string): Activity | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (s.user.toLowerCase() !== user.toLowerCase() || s.levels.length !== s.end - s.start + 1) return null;
    const levels: number[] = [];
    for (const ch of s.levels) levels.push(Math.max(0, Math.min(4, parseInt(ch, 10) || 0)));
    const counts: number[] = [];
    const stored = s.counts ? s.counts.split(",") : [];
    for (let i = 0; i < levels.length; i += 1) {
      const n = i < stored.length && stored[i] !== "" ? parseInt(stored[i], 10) : NaN;
      counts.push(isNaN(n) ? (levels[i] === 0 ? 0 : -1) : Math.max(0, n));
    }
    return { total: s.total, today: s.today, start: s.start, end: s.end, levels, counts, complete: true };
  } catch {
    return null;
  }
}

/** Saves a complete graph when it differs from the stored one. */
export function saveActivity(user: string, activity: Activity): void {
  if (!activity.complete) return;
  const stored: Stored = {
    user,
    total: activity.total,
    today: activity.today,
    start: activity.start,
    end: activity.end,
    levels: activity.levels.join(""),
    counts: activity.counts.map((c) => (c < 0 ? "" : String(c))).join(","),
  };
  try {
    const raw = JSON.stringify(stored);
    const store = storage();
    if (store && store.getItem(KEY) !== raw) store.setItem(KEY, raw);
  } catch {
    // A full or missing store only costs the instant start.
  }
}
