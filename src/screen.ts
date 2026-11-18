/**
 * Builds the frames the app sends to the displays.
 *
 * Elements are built by hand rather than through the layout helpers: every
 * position here is a fixed pixel on a 72x16 front screen or a 148x80 back one,
 * so there is nothing for a layout pass to decide.
 *
 * The front screen keeps the same four element ids for every period, so turning
 * the wheel updates them in place. The back screen's ids start with `b_`.
 */

import type { DisplayDrawParams } from "@busy-app/busy-lib";

import type { Activity } from "./contributions.ts";
import { backGraphXpm } from "./heatmap.ts";
import {
  BACK_W,
  COUNT_COLOR,
  GRAPH_TOP,
  PERIOD_LABEL_X,
  PERIOD_TEXT_Y,
  INSET,
  LABEL_COLOR,
  MESSAGE_COLOR,
  MESSAGE_DIM_COLOR,
  RIGHT_ANCHOR_BIAS,
  SCREEN_W,
  TEXT_Y,
  TOTAL_COLOR,
  WORD_GAP,
  alpha,
  opaque,
  textWidth,
} from "./layout.ts";
import { type Stats, YEAR_DAYS, dayLabel } from "./stats.ts";

type Element = DisplayDrawParams["elements"][number];

const FONT = "small";

function text(
  id: string,
  x: number,
  value: string,
  color: string,
  align: "top_left" | "top_right" = "top_left",
  y = TEXT_Y,
  display: "front" | "back" = "front",
  font: "small" | "bold" = FONT,
): Element {
  return {
    id,
    type: "text",
    display,
    align,
    x: align === "top_right" ? x + RIGHT_ANCHOR_BIAS : x,
    y,
    text: value,
    font,
    color: opaque(color),
    z_index: 2,
  };
}

function picture(id: string, data: string, x: number, y: number, display: "front" | "back" = "front"): Element {
  return { id, type: "xpmbitmap", display, align: "top_left", x, y, data, z_index: 1 };
}

/**
 * The front screen, after the Figma mockup, as parts the app puts together and
 * keeps: the icon on the left, a white label from x 12, a green count at the
 * right edge, the 72-week graph under them, and over the graph a small layer
 * that lights the chosen period. The icon and the graph are built once and
 * reused, so a step of the wheel sends only the line and the layer.
 */
/** The icon is a 9x9 PNG with transparency, packaged in images/. */
const ICON: Element = { id: "icon", type: "image", display: "front", align: "top_left", x: 0, y: 0, path: "images/icon.png", z_index: 1 };

export function iconElement(): Element {
  return ICON;
}

export function graphElement(data: string): Element {
  return picture("graph", data, 0, GRAPH_TOP);
}

/** The period's own days over the dimmed graph, from graph column `column`. */
export function litElement(data: string, column: number): Element {
  return { id: "lit", type: "xpmbitmap", display: "front", align: "top_left", x: column, y: GRAPH_TOP, data, z_index: 2 };
}

/**
 * The label and the count. `count` is -1 while it is being read. A label too
 * long for the room left of the count, a long user name, scrolls in that room.
 */
export function periodLine(label: string, count: number): Element[] {
  // One dark column after the count, so it does not run into the screen's edge.
  const edge = SCREEN_W - 2;
  const value = count < 0 ? "..." : String(count);
  const room = edge - textWidth(value) + 1 - WORD_GAP - PERIOD_LABEL_X;
  const labelElement = text("label", PERIOD_LABEL_X, label, TOTAL_COLOR, "top_left", PERIOD_TEXT_Y);
  const scroll = { width: room, scroll_rate: 1200, scroll_start_delay: 1000, scroll_repeat_delay: 1500 };
  return [
    textWidth(label) > room ? ({ ...labelElement, ...scroll } as Element) : labelElement,
    text("count", edge, value, count < 0 ? LABEL_COLOR : COUNT_COLOR, "top_right", PERIOD_TEXT_Y),
  ];
}

/** Where the back screen's parts sit. */
const BACK_GRAPH_TOP = 9;
const STAT_ROWS = [32, 56];
const STAT_COLS = [0, 76];
const STAT_VALUE_DY = 7;
/** Room between the left column's notes and the right column. */
const STAT_GAP = 6;

/**
 * The back screen: who, the year's total, the last 49 weeks in grey, and four
 * numbers from the graph: days with contributions in the last year, this
 * month, the busiest day and this week against the last.
 */
export function backFrame(user: string, activity: Activity, stats: Stats, levels: readonly number[]): Element[] {
  // One dark column before the firmware's status bar.
  const edge = BACK_W - 2;
  const labelLeft = edge - textWidth("contribs") + 1;
  const elements: Element[] = [
    text("b_user", 0, user, TOTAL_COLOR, "top_left", TEXT_Y, "back"),
    text("b_label", edge, "contribs", LABEL_COLOR, "top_right", TEXT_Y, "back"),
    text("b_total", labelLeft - WORD_GAP, String(activity.total), TOTAL_COLOR, "top_right", TEXT_Y, "back"),
    picture("b_graph", backGraphXpm(levels), 0, BACK_GRAPH_TOP, "back"),
  ];

  // A label on the left, an optional note on the right of the same line, the value under them in bold.
  const cells: [string, string, string][] = [
    ["ACTIVE DAYS", `OF ${YEAR_DAYS}`, String(stats.activeDays)],
    ["THIS MONTH", "", String(stats.monthTotal)],
    ["BEST DAY", stats.best ? dayLabel(stats.best.day) : "", stats.best ? String(stats.best.count) : "-"],
    ["THIS WEEK", stats.countsKnown ? `LAST ${stats.lastWeekTotal}` : "", String(stats.weekTotal)],
  ];
  cells.forEach(([label, note, value], i) => {
    const x = STAT_COLS[i % 2];
    const right = i % 2 === 0 ? STAT_COLS[1] - 1 - STAT_GAP : edge;
    const y = STAT_ROWS[Math.floor(i / 2)];
    elements.push(text(`b_l${i}`, x, label, LABEL_COLOR, "top_left", y, "back"));
    // A note that would run into the label is left out rather than squeezed.
    if (note !== "" && x + textWidth(label) + WORD_GAP <= right - textWidth(note) + 1) {
      elements.push(text(`b_n${i}`, right, note, LABEL_COLOR, "top_right", y, "back"));
    }
    elements.push(text(`b_v${i}`, x, value, TOTAL_COLOR, "top_left", y + STAT_VALUE_DY, "back", "bold"));
  });
  return elements;
}

/** The back screen while there is no graph: a title and a few lines of help. */
export function backMessage(lines: readonly string[]): Element[] {
  return lines.map((line, i) =>
    text(`b_m${i}`, 0, line, i === 0 ? TOTAL_COLOR : LABEL_COLOR, "top_left", TEXT_Y + i * 10, "back"),
  );
}

/**
 * Shown while there is nothing to draw: no profile set, the user not found, or
 * no answer yet. Two short centred lines, because 72x16 fits little else.
 */
export function messageFrame(top: string, bottom: string): Element[] {
  const middle = SCREEN_W / 2;
  // The font's 2 px top bearing: these anchors put the ink on rows 2..6 and 9..13.
  return [
    {
      id: "m_top",
      type: "text",
      display: "front",
      align: "top_mid",
      x: middle,
      y: 0,
      text: top,
      font: FONT,
      color: opaque(MESSAGE_COLOR),
      z_index: 2,
    },
    {
      id: "m_bottom",
      type: "text",
      display: "front",
      align: "top_mid",
      x: middle,
      y: 7,
      text: bottom,
      font: FONT,
      color: alpha(MESSAGE_DIM_COLOR, 0x99),
      z_index: 2,
      // A long user name would run off both edges, so it scrolls inside the screen instead.
      ...(textWidth(bottom) > SCREEN_W - 2 * INSET
        ? {
            width: SCREEN_W - 2 * INSET,
            scroll_rate: 1200,
            scroll_start_delay: 1000,
            scroll_repeat_delay: 1500,
          }
        : {}),
    },
  ];
}
