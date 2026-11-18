/**
 * Screen geometry and palette.
 *
 * The front display is 72x16. The top rows carry one line of text: the year's
 * total on the left and today's count on the right. Under it sits the
 * contribution graph, the way GitHub draws it: one column per week, one row per
 * weekday, Sunday on top, the current week on the right edge.
 */

export const SCREEN_W = 72;
export const SCREEN_H = 16;

/** One column per week, so the graph spans the whole width: 72 weeks, about 16 months. */
export const WEEKS = SCREEN_W;
export const DAYS_PER_WEEK = 7;

/** The graph takes the bottom seven rows, 9..15. */
export const GRAPH_TOP = SCREEN_H - DAYS_PER_WEEK;

/**
 * The device font is 5 px tall but carries 2 px of bearing above the glyphs, so
 * text anchored at y = -1 puts its ink on rows 1..5.
 */
export const TEXT_Y = -1;

/** Text anchored with `top_right` ends 2 px left of x, so add it back. */
export const RIGHT_ANCHOR_BIAS = 2;

/** The text keeps 1 px from the left and right edges. */
export const INSET = 1;

/**
 * The `small` font is proportional. Most glyphs are 3 px wide plus 1 px of
 * spacing; the ones measured narrower on the device are listed here.
 */
const SMALL_CHAR_W = 4;
const NARROW_CHARS: Record<string, number> = { "1": 3, i: 2, t: 3, r: 3 };

/** Space between the total and its label, and the least room left before today's count. */
export const WORD_GAP = 4;

/**
 * GitHub's five levels, 0 (no contributions) to 4 (the busiest days). The
 * greens are a little brighter than GitHub's own dark theme: on LEDs the darkest
 * of those barely light up. Level 0 is a dim blue-grey so that empty days still
 * read as part of the grid.
 */
export const LEVEL_COLORS: readonly string[] = [
  "#262C36",
  "#0E5C2E",
  "#108F3E",
  "#2BC653",
  "#56F08A",
];

/**
 * The back screen is 160x80 in sixteen greys; its right 12 px belong to the
 * firmware's status bar, so the app draws in the left 148.
 */
export const BACK_W = 148;
export const BACK_H = 80;

/** The five levels in grey for the back screen; level 0 still shows the grid. */
export const BACK_LEVEL_COLORS: readonly string[] = ["#2A2A2A", "#5A5A5A", "#8A8A8A", "#C0C0C0", "#FFFFFF"];

/**
 * Days outside the chosen period are drawn at this share of their brightness.
 * On LEDs 70 % hardly differs from full, so the rest of the graph drops to a shade.
 */
export const DIM = 0.3;

/**
 * The chosen period's empty days, a little lighter than level 0 elsewhere: a
 * week without contributions still shows where it is against the dimmed rest.
 */
export const LIT_EMPTY_COLOR = "#343C4A";

/** The front screen's line, after the Figma mockup: the 9x9 icon, a white label from x 12, the count on the right in green. */
export const PERIOD_LABEL_X = 12;
export const PERIOD_TEXT_Y = 0;
export const COUNT_COLOR = "#35A85B";

export const TOTAL_COLOR = "#FFFFFF";
export const LABEL_COLOR = "#8B8B8B";
export const TODAY_COLOR = LEVEL_COLORS[4];
/** A quiet day: "+0" stays on screen, but dimmed. */
export const TODAY_ZERO_COLOR = "#5A5A5A";
export const MESSAGE_COLOR = "#FFFFFF";
export const MESSAGE_DIM_COLOR = "#FFFFFF";

/** Adds the opaque alpha byte the draw API expects on every colour. */
export function opaque(rgb: string): string {
  return `${rgb}FF`;
}

/** Adds an explicit alpha byte, 0..255. */
export function alpha(rgb: string, a: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(a)));
  return `${rgb}${clamped.toString(16).toUpperCase().padStart(2, "0")}`;
}

/** Width of `text`'s ink in the `small` font. */
export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += NARROW_CHARS[ch] ?? SMALL_CHAR_W;
  return w > 0 ? w - 1 : 0;
}
