/**
 * Builds the frames the app sends to the display.
 *
 * Elements are built by hand rather than through the layout helpers: every
 * position here is a fixed pixel on a 72x16 screen, so there is nothing for a
 * layout pass to decide.
 */

import type { DisplayDrawParams } from "@busy-app/busy-lib";

import type { Activity } from "./contributions.ts";
import { heatmapXpm } from "./heatmap.ts";
import {
  GRAPH_TOP,
  INSET,
  LABEL_COLOR,
  MESSAGE_COLOR,
  MESSAGE_DIM_COLOR,
  RIGHT_ANCHOR_BIAS,
  SCREEN_W,
  TEXT_Y,
  TODAY_COLOR,
  TODAY_ZERO_COLOR,
  TOTAL_COLOR,
  WORD_GAP,
  alpha,
  opaque,
  textWidth,
} from "./layout.ts";

type Element = DisplayDrawParams["elements"][number];

const FONT = "small";

/** The longest label that fits wins; a five-digit total next to a three-digit day drops it. */
const LABELS = ["contribs", ""];

function text(
  id: string,
  x: number,
  value: string,
  color: string,
  align: "top_left" | "top_right" = "top_left",
): Element {
  return {
    id,
    type: "text",
    display: "front",
    align,
    x: align === "top_right" ? x + RIGHT_ANCHOR_BIAS : x,
    y: TEXT_Y,
    text: value,
    font: FONT,
    color: opaque(color),
    z_index: 2,
  };
}

/** The live screen: total and label on the left, today on the right, the graph below. */
export function activityFrame(activity: Activity): Element[] {
  const total = String(activity.total);
  const today = `+${activity.today}`;
  const right = SCREEN_W - 1 - INSET;
  const todayLeft = right - textWidth(today) + 1;
  const labelX = INSET + textWidth(total) + WORD_GAP;

  const label = LABELS.find((l) => labelX + textWidth(l) + WORD_GAP <= todayLeft) ?? "";

  const elements: Element[] = [
    text("total", INSET, total, TOTAL_COLOR),
    text("today", right, today, activity.today > 0 ? TODAY_COLOR : TODAY_ZERO_COLOR, "top_right"),
    {
      id: "graph",
      type: "xpmbitmap",
      display: "front",
      align: "top_left",
      x: 0,
      y: GRAPH_TOP,
      data: heatmapXpm(activity.levels),
      z_index: 1,
    },
  ];
  if (label !== "") elements.push(text("label", labelX, label, LABEL_COLOR));
  return elements;
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
