/**
 * GitHub Activity — a GitHub user's contribution graph on the BUSY Bar.
 *
 * The profile comes from the app's settings in the bar's web interface. The bar
 * reads the contribution calendar over its own internet connection, so no
 * computer is involved, and redraws whenever the data or the profile changes.
 *
 * The front screen opens on the profile: the user name and the year's
 * contributions. Start or OK then switch to a day, a week, a month and a year,
 * and the wheel steps back through earlier periods of that kind, the graph under
 * the number lighting the period it counts. The back screen shows the year in
 * grey and four numbers.
 */

import { device } from "@shared/device";

import manifest from "./appmeta/manifest.json";
import { loadActivity, saveActivity } from "./cache.ts";
import { readProfile } from "./config.ts";
import {
  type Activity,
  NotFoundError,
  buildActivity,
  dayNumber,
  readOlder,
  readRecent,
  readYear,
  weekday,
  yearOf,
} from "./contributions.ts";
import { BACK_WEEKS, heatmapXpm, litXpm } from "./heatmap.ts";
import { type History, addYear, emptyHistory, levelsBetween, missingYear, sumBetween } from "./history.ts";
import { DAYS_PER_WEEK } from "./layout.ts";
import { type Profile, sameProfile } from "./profile.ts";
import { type Unit, UNITS, graphWindow, maxOffset, period } from "./period.ts";
import {
  backFrame,
  backMessage,
  graphElement,
  iconElement,
  litElement,
  messageFrame,
  periodLine,
} from "./screen.ts";
import { computeStats } from "./stats.ts";

/** The name the app draws under; the device clears elements by this id. */
const APP = manifest.id;

/**
 * Settings saved while the app runs do not restart it, so they are read again
 * this often: a pasted profile shows up within seconds. The read is local and cheap.
 */
const TICK_MS = 3000;

/** The calendar service caches for about an hour; reading it more often only repeats data. */
const REFRESH_MS = 15 * 60 * 1000;

/** First retry after a failed read, doubled on each further failure up to REFRESH_MS. */
const RETRY_MS = 30 * 1000;

/** TLS on the bar is slow; a read that takes longer than this has stalled. */
const REQUEST_TIMEOUT_MS = 20000;

type Element = ReturnType<typeof messageFrame>[number];

/** The profile screen, then the four kinds of period, in the order Start and OK go through them. */
type Screen = "profile" | Unit;
const SCREENS: readonly Screen[] = ["profile", ...UNITS];

/**
 * A year is read only once the wheel has rested this long, not at every step on
 * the way. Reading one blocks the screen for seconds: the firmware serves the
 * app's own draws only after its TLS request to the data service is done.
 */
const SETTLE_MS = 2000;

/** The bar reads up to this many years before the graph by itself, while nobody touches it. */
const PREFETCH_YEARS = 6;
/**
 * Any request to the data service freezes the app until it is answered: the
 * firmware handles no input and no draw while its TLS request runs, about four
 * seconds. So with a graph on screen the bar goes to the network, to refresh or to
 * read earlier years, only after this long without a press.
 */
const IDLE_MS = 10000;

/** The last `weeks` weeks of the graph, from a Sunday; -1 before the graph starts. */
function lastWeeks(activity: Activity, weeks: number): number[] {
  const from = activity.levels.length - 1 - weekday(activity.end) - (weeks - 1) * DAYS_PER_WEEK;
  const out: number[] = [];
  for (let i = from; i < activity.levels.length; i += 1) out.push(i < 0 ? -1 : activity.levels[i]);
  return out;
}

function main(): void {
  let profile: Profile = { kind: "empty" };
  let activity: Activity | null = null;
  let notFound = false;
  let reading = false;
  let failures = 0;
  let nextReadAt = 0;
  let screen: Screen = "profile";
  /** Periods back from the current one; 0 is today, this week, this month, the last year. */
  let offset = 0;
  /** Counted from the launch too, so a quick first press does not land on a prefetch already under way. */
  let lastInputAt = Date.now();
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  /** Goes up whenever the days change: a new read, a year added, another profile. */
  let version = 0;
  /**
   * The graph for one window, built once: the levels, and the graph lit and dimmed.
   * A step of the wheel inside the window reuses it and only moves the period layer.
   */
  let graph: { key: string; levels: number[]; lit: Element | null; dim: Element | null } | null = null;
  /** Sums already counted for this version of the days, by period. */
  let sums: { version: number; byPeriod: Record<string, number> } = { version: -1, byPeriod: {} };
  let history: History = emptyHistory();
  /** What is on screen now, by element id, as last sent; and the element objects they came from. */
  let onScreen: Record<string, string> = {};
  let onScreenFrom: Record<string, Element> = {};
  /**
   * The back screen and the numbers change only with the data, not with a key
   * press: they are built once per graph and reused, so a press redraws the front alone.
   */
  let built: { activity: Activity; user: string; stats: ReturnType<typeof computeStats>; back: Element[] } | null = null;
  let drawing = false;
  let drawAgain = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const report = (where: string, err: unknown) =>
    console.error(`${APP}: ${where}: ${err instanceof Error ? err.message : String(err)}`);

  /**
   * Sends only the elements that differ from what is on screen, and clears the
   * ids that went away. Clearing goes first, so a message never lingers over the graph.
   */
  async function show(elements: Element[]): Promise<void> {
    const next: Record<string, string> = {};
    const nextFrom: Record<string, Element> = {};
    const changed = [];
    for (const element of elements) {
      // The same object as last time needs no new JSON to compare.
      const sent = onScreenFrom[element.id] === element ? onScreen[element.id] : JSON.stringify(element);
      next[element.id] = sent;
      nextFrom[element.id] = element;
      if (onScreen[element.id] !== sent) changed.push(element);
    }
    const gone = Object.keys(onScreen).filter((id) => !(id in next));

    if (gone.length > 0) {
      await device.DisplayClear({ application_name: APP, element_ids: gone });
    }
    if (changed.length > 0) {
      await device.DisplayDraw({ application_name: APP, priority: 50, elements: changed });
    }
    onScreen = next;
    onScreenFrom = nextFrom;
  }

  /** Both screens for the current state. */
  function frames(): Element[] {
    if (profile.kind === "empty") {
      return [
        ...messageFrame("SET PROFILE", "IN SETTINGS"),
        ...backMessage([
          "GITHUB ACTIVITY",
          "Open the bar's web page,",
          "Apps, GitHub Activity, and",
          "paste your GitHub profile",
          "link or user name.",
        ]),
      ];
    }
    if (profile.kind === "invalid") {
      return [
        ...messageFrame("BAD PROFILE", profile.text),
        ...backMessage(["NOT A GITHUB PROFILE", profile.text, "Paste a link such as", "github.com/octocat"]),
      ];
    }
    const user = profile.user;
    if (activity === null) {
      if (notFound) {
        return [
          ...messageFrame("NOT FOUND", user),
          ...backMessage(["NO SUCH GITHUB USER", user, "Check the spelling in", "the app's settings."]),
        ];
      }
      if (reading || failures === 0) {
        return [...messageFrame("LOADING", user), ...backMessage(["LOADING", user])];
      }
      return [
        ...messageFrame("NO DATA", user),
        ...backMessage(["NO DATA", user, "No internet, or the data", "service is down. Retrying."]),
      ];
    }

    if (built === null || built.activity !== activity || built.user !== user) {
      const numbers = computeStats(activity);
      built = { activity, user, stats: numbers, back: backFrame(user, activity, numbers, lastWeeks(activity, BACK_WEEKS)) };
    }
    const { back } = built;
    const today = activity.end;
    if (screen === "profile") {
      const g = graphFor(activity, graphWindow(period("year", 0, today), today));
      return [iconElement(), ...periodLine(user, activity.total), litGraph(g), ...back];
    }
    const p = period(screen, offset, today);
    const w = graphWindow(p, today);
    const g = graphFor(activity, w);
    const line = periodLine(p.label, sumOf(activity, p.start, p.end));
    // Today lights the whole graph; any other period lights itself over the dimmed rest.
    if (screen === "day" && offset === 0) return [iconElement(), ...line, litGraph(g), ...back];
    const layer = litXpm(g.levels, p.start - w.start, p.end - w.start);
    return [iconElement(), ...line, dimGraph(g), litElement(layer.data, layer.column), ...back];
  }

  /** The graph for a window, from the cache while the window and the days stay the same. */
  function graphFor(a: Activity, w: { start: number; end: number }) {
    const key = `${w.start}:${w.end}:${version}`;
    if (graph === null || graph.key !== key) {
      graph = { key, levels: levelsBetween(a, history, w.start, w.end), lit: null, dim: null };
    }
    return graph;
  }

  /** The two pictures of a graph, each built the first time it is shown: most windows need only one. */
  function litGraph(g: NonNullable<typeof graph>): Element {
    if (g.lit === null) g.lit = graphElement(heatmapXpm(g.levels));
    return g.lit;
  }

  function dimGraph(g: NonNullable<typeof graph>): Element {
    if (g.dim === null) g.dim = graphElement(heatmapXpm(g.levels, Infinity, -1));
    return g.dim;
  }

  /** A period's contributions, counted once per version of the days; -1 while some are not read. */
  function sumOf(a: Activity, start: number, end: number): number {
    if (sums.version !== version) sums = { version, byPeriod: {} };
    const key = `${start}:${end}`;
    if (!(key in sums.byPeriod)) {
      const sum = sumBetween(a, history, start, end);
      if (sum < 0) return sum;
      sums.byPeriod[key] = sum;
    }
    return sums.byPeriod[key];
  }

  /** Redraws now, or once the drawing in flight is done: one display request at a time. */
  function render(): void {
    if (stopped) return;
    if (drawing) {
      drawAgain = true;
      return;
    }
    drawing = true;
    show(frames())
      .catch((err: unknown) => report("draw", err))
      .then(() => {
        drawing = false;
        if (drawAgain) {
          drawAgain = false;
          render();
        }
      });
  }

  /** Reads the next earlier year the chosen period or its graph needs, one at a time. */
  function ensureHistory(): void {
    if (stopped || profile.kind !== "user" || activity === null || history.loading !== null) return;
    if (screen === "profile") return;
    const today = activity.end;
    const p = period(screen, offset, today);
    const w = graphWindow(p, today);
    const year = missingYear(activity, history, Math.min(p.start, w.start), w.end);
    if (year !== null && year !== history.failed) loadYear(year);
  }

  /** Reads ensureHistory's year once the wheel has rested, not at every step on the way to it. */
  function settleThenLoad(): void {
    if (settleTimer !== undefined) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = undefined;
      ensureHistory();
    }, SETTLE_MS);
  }

  /** While nobody touches the bar, reads the years just before the graph so stepping back finds them ready. */
  function prefetch(): void {
    if (profile.kind !== "user" || activity === null || !activity.complete || history.loading !== null) return;
    if (Date.now() - lastInputAt < IDLE_MS || settleTimer !== undefined) return;
    const from = dayNumber(`${yearOf(activity.start) - PREFETCH_YEARS + 1}-01-01`);
    const year = missingYear(activity, history, from, activity.start - 1);
    if (year !== null && year !== history.failed) loadYear(year);
  }

  function loadYear(year: number): void {
    if (profile.kind !== "user" || history.loading !== null) return;
    const h = history;
    const user = profile.user;
    h.loading = year;
    readYear(user, year, REQUEST_TIMEOUT_MS)
      .then(
        (calendar) => {
          if (h === history && activity !== null) {
            addYear(h, activity, year, calendar);
            version += 1;
          }
        },
        (err: unknown) => {
          report("history", err);
          h.failed = year;
        },
      )
      .then(() => {
        h.loading = null;
        if (h !== history || activity === null) return;
        if (screen !== "profile") offset = Math.min(offset, maxOffset(screen, activity.end, h.floor));
        ensureHistory();
        render();
      });
  }

  /** A new profile starts from scratch and is read at once. */
  async function refreshProfile(): Promise<void> {
    try {
      const next = await readProfile(APP);
      if (sameProfile(next, profile)) return;
      profile = next;
      activity = next.kind === "user" ? loadActivity(next.user) : null;
      notFound = false;
      failures = 0;
      nextReadAt = 0;
      offset = 0;
      history = emptyHistory();
      version += 1;
    } catch (err) {
      report("settings", err);
    }
  }

  /**
   * Reads the calendar. The last year is drawn as soon as it arrives; the older
   * weeks follow on the first read of a profile and come from memory after that.
   * A missing user is final until the profile changes; anything else is retried.
   */
  async function read(user: string): Promise<void> {
    try {
      const recent = await readRecent(user, REQUEST_TIMEOUT_MS);
      activity = buildActivity(recent, null, activity);
      version += 1;
      notFound = false;
      if (!activity.complete) {
        render();
        activity = buildActivity(recent, await readOlder(user, recent, REQUEST_TIMEOUT_MS), activity);
        version += 1;
      }
      // Only a whole read ends the backoff: a last year that loads while the
      // older weeks keep failing must not retry at full rate forever.
      failures = 0;
      nextReadAt = Date.now() + REFRESH_MS;
      saveActivity(user, activity);
    } catch (err) {
      if (err instanceof NotFoundError) {
        activity = null;
        notFound = true;
        nextReadAt = Date.now() + REFRESH_MS;
        return;
      }
      if (failures === 0) report("calendar", err);
      failures += 1;
      // The last good graph stays on screen while the retries back off.
      nextReadAt = Date.now() + Math.min(RETRY_MS * Math.pow(2, failures - 1), REFRESH_MS);
    }
  }

  async function tick(): Promise<void> {
    await refreshProfile();

    // Without a graph there is nothing to press yet, so the first read starts at once.
    const idle = Date.now() - lastInputAt >= IDLE_MS && settleTimer === undefined;
    if (profile.kind === "user" && Date.now() >= nextReadAt && (activity === null || idle)) {
      reading = true;
      // A cached graph goes up at once; the read then only updates it.
      render();
      await read(profile.user);
      reading = false;
    }
    prefetch();
    render();
  }

  /**
   * Self-rescheduling timeout rather than an interval: a slow read then delays
   * the next tick instead of stacking up behind it.
   */
  function schedule(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      void tick()
        .catch((err: unknown) => report("tick", err))
        .then(schedule);
    }, TICK_MS);
  }

  function quit(): void {
    if (stopped) return;
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    if (settleTimer !== undefined) clearTimeout(settleTimer);
    // Not from inside the handler's own callback: with nothing else left, the
    // unbind would stop the app while this callback is still running.
    setTimeout(unbind, 0);
  }

  const unbind = listen("input", (event) => {
    lastInputAt = Date.now();
    if (event.key === "encoder") {
      // The profile screen is one fixed picture: the wheel does nothing there.
      if (activity === null || screen === "profile") return;
      history.failed = null;
      // Counterclockwise goes back in time; the period stays where it is left.
      offset = Math.max(0, Math.min(maxOffset(screen, activity.end, history.floor), offset - event.delta));
      render();
      settleThenLoad();
      return;
    }
    if (event.action !== "short") return;
    if (event.key === "ok" || event.key === "start") {
      // The next screen, a kind of period starting from its current one.
      screen = SCREENS[(SCREENS.indexOf(screen) + 1) % SCREENS.length];
      offset = 0;
      render();
      settleThenLoad();
    } else if (event.key === "back") {
      // Back from an earlier period returns to the current one; from there it quits.
      if (offset > 0) {
        offset = 0;
        render();
      } else {
        quit();
      }
    }
  });

  void tick()
    .catch((err: unknown) => report("tick", err))
    .then(schedule);
}

main();
