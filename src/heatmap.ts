/**
 * Renders the pictures as XPM2 bitmaps, each a single `xpmbitmap` element:
 *
 * - the contribution graph: WEEKS columns by seven rows, one pixel per day, the
 *   chosen period at full brightness and the other days dimmed (DIM);
 * - the back screen's year: two by two pixels per day with a gap between.
 *
 * Days after today, at the bottom of the current week's column, are left
 * transparent, as GitHub leaves them out; so are days not read yet, which fill
 * in when their year arrives.
 */

import { BACK_LEVEL_COLORS, DAYS_PER_WEEK, DIM, LEVEL_COLORS, LIT_EMPTY_COLOR, WEEKS } from "./layout.ts";

/** One character per colour; a space is transparent. Levels 0..4 bright, then 0..4 dimmed. */
const CHARS = "0123456789";

function xpm(width: number, height: number, rows: string[], colors: readonly string[]): string {
  const palette = ["  c none"];
  for (let i = 0; i < colors.length; i += 1) palette.push(`${CHARS[i]} c ${colors[i]}`);
  return ["! XPM2", `${width} ${height} ${palette.length} 1`, ...palette, ...rows].join("\n");
}

function levelChar(level: number | undefined, dim = false): string {
  if (level === undefined || level < 0) return " ";
  return CHARS[Math.min(4, level) + (dim ? 5 : 0)];
}

/** `#RRGGBB` at `factor` of its brightness. */
function scaled(color: string, factor: number): string {
  let out = "#";
  for (let i = 1; i < 7; i += 2) {
    const v = Math.round(parseInt(color.substring(i, i + 2), 16) * factor);
    out += (v < 16 ? "0" : "") + v.toString(16).toUpperCase();
  }
  return out;
}

const GRAPH_COLORS = [...LEVEL_COLORS, ...LEVEL_COLORS.map((c) => scaled(c, DIM))];

/** The period layer: the levels as they are, but empty days lighter, so the period's edges show. */
const LIT_COLORS = [LIT_EMPTY_COLOR, ...LEVEL_COLORS.slice(1)];

/**
 * `levels` starts on a Sunday, oldest first. Days from `brightFrom` to
 * `brightTo` (indexes into `levels`, inclusive) are at full brightness, the rest dimmed.
 */
export function heatmapXpm(levels: readonly number[], brightFrom = 0, brightTo = Infinity): string {
  const rows: string[] = [];
  for (let r = 0; r < DAYS_PER_WEEK; r += 1) {
    let line = "";
    for (let c = 0; c < WEEKS; c += 1) {
      const i = c * DAYS_PER_WEEK + r;
      line += levelChar(levels[i], i < brightFrom || i > brightTo);
    }
    rows.push(line);
  }
  return xpm(WEEKS, DAYS_PER_WEEK, rows, GRAPH_COLORS);
}

/**
 * The chosen period as a small picture to lay over a dimmed graph: only the
 * columns from the one holding `from` to the one holding `to`, its days at full
 * brightness and every other pixel transparent. A step of the wheel then sends
 * this layer alone, not the whole graph. Returns the picture and its first column.
 */
export function litXpm(levels: readonly number[], from: number, to: number): { data: string; column: number } {
  const first = Math.max(0, Math.floor(from / DAYS_PER_WEEK));
  const last = Math.min(WEEKS - 1, Math.floor(to / DAYS_PER_WEEK));
  const rows: string[] = [];
  for (let r = 0; r < DAYS_PER_WEEK; r += 1) {
    let line = "";
    for (let c = first; c <= last; c += 1) {
      const i = c * DAYS_PER_WEEK + r;
      line += i >= from && i <= to ? levelChar(levels[i]) : " ";
    }
    rows.push(line);
  }
  return { data: xpm(last - first + 1, DAYS_PER_WEEK, rows, LIT_COLORS), column: first };
}

/** Weeks the back screen's graph holds: 3 px per week fills its 148 px. */
export const BACK_WEEKS = 49;

/** `levels` starts on a Sunday; each day is a 2x2 square, 1 px apart. */
export function backGraphXpm(levels: readonly number[]): string {
  const width = BACK_WEEKS * 3 - 1;
  const height = DAYS_PER_WEEK * 3 - 1;
  const rows: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let line = "";
    for (let x = 0; x < width; x += 1) {
      line += x % 3 === 2 || y % 3 === 2 ? " " : levelChar(levels[Math.floor(x / 3) * DAYS_PER_WEEK + Math.floor(y / 3)]);
    }
    rows.push(line);
  }
  return xpm(width, height, rows, BACK_LEVEL_COLORS);
}
