/**
 * Renders the contribution graph as an XPM2 bitmap: WEEKS columns by seven rows,
 * one pixel per day, so the whole graph is a single `xpmbitmap` element.
 *
 * Days after today, at the bottom of the current week's column, are left
 * transparent, as GitHub leaves them out; so are days not read yet, which fill
 * in from the left a few seconds after the last year is drawn.
 */

import { DAYS_PER_WEEK, LEVEL_COLORS, WEEKS } from "./layout.ts";

/** One character per level; a space is transparent. */
const LEVEL_CHARS = "01234";

/** `levels` starts on a Sunday, oldest first, as `Activity.levels` does. */
export function heatmapXpm(levels: readonly number[]): string {
  const rows: string[] = [];
  for (let r = 0; r < DAYS_PER_WEEK; r += 1) {
    let line = "";
    for (let c = 0; c < WEEKS; c += 1) {
      const i = c * DAYS_PER_WEEK + r;
      line += i < levels.length && levels[i] >= 0 ? LEVEL_CHARS[Math.min(4, levels[i])] : " ";
    }
    rows.push(line);
  }

  const palette = ["  c none"];
  for (let i = 0; i < LEVEL_COLORS.length; i += 1) {
    palette.push(`${LEVEL_CHARS[i]} c ${LEVEL_COLORS[i]}`);
  }
  const header = `${WEEKS} ${DAYS_PER_WEEK} ${palette.length} 1`;
  return ["! XPM2", header, ...palette, ...rows].join("\n");
}
