/**
 * GitHub Activity — a GitHub user's contribution graph on the front screen.
 *
 * The profile comes from the app's settings in the bar's web interface. The bar
 * reads the contribution calendar over its own internet connection, so no
 * computer is involved, and redraws whenever the data or the profile changes.
 */

import { device } from "@shared/device";

import manifest from "./appmeta/manifest.json";
import { loadActivity, saveActivity } from "./cache.ts";
import { readProfile } from "./config.ts";
import { type Activity, NotFoundError, buildActivity, readOlder, readRecent } from "./contributions.ts";
import { type Profile, sameProfile } from "./profile.ts";
import { activityFrame, messageFrame } from "./screen.ts";

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

function main(): void {
  let profile: Profile = { kind: "empty" };
  let activity: Activity | null = null;
  let notFound = false;
  let failures = 0;
  let nextReadAt = 0;
  /** What is on screen now, by element id, as last sent. */
  let onScreen: Record<string, string> = {};
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
    const changed = [];
    for (const element of elements) {
      const sent = JSON.stringify(element);
      next[element.id] = sent;
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
      notFound = false;
      if (!activity.complete) {
        await show(activityFrame(activity));
        activity = buildActivity(recent, await readOlder(user, recent, REQUEST_TIMEOUT_MS), activity);
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

    if (profile.kind === "empty") {
      await show(messageFrame("SET PROFILE", "IN SETTINGS"));
      return;
    }
    if (profile.kind === "invalid") {
      await show(messageFrame("BAD PROFILE", profile.text));
      return;
    }

    const user = profile.user;
    if (Date.now() >= nextReadAt) {
      // A cached graph goes up at once; the read then only updates it.
      if (activity !== null) await show(activityFrame(activity));
      else if (!notFound && failures === 0) await show(messageFrame("LOADING", user));
      await read(user);
    }

    if (activity !== null) await show(activityFrame(activity));
    else if (notFound) await show(messageFrame("NOT FOUND", user));
    else await show(messageFrame("NO DATA", user));
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
    // Not from inside the handler's own callback: with nothing else left, the
    // unbind would stop the app while this callback is still running.
    setTimeout(unbind, 0);
  }

  const unbind = listen("input", (event) => {
    if (event.key === "back" && event.action === "short") quit();
  });

  void tick()
    .catch((err: unknown) => report("tick", err))
    .then(schedule);
}

main();
