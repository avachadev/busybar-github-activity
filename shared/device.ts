/**
 * The three requests the app makes to the BUSY Bar it runs on, over plain `fetch`.
 *
 * Not `BusyBar` from @busy-app/busy-lib: that client puts a 3 s timeout on every
 * request through `AbortController`, which is a stub in the firmware. When the
 * bar is busy for longer (reading an earlier year over TLS, say), the timeout's
 * `abort()` throws an uncaught `TypeError: Expected a function` on the device and
 * the draw is lost. The firmware cannot cancel a request anyway; it fails one by
 * itself when no data comes for too long. The client is also 28 KB of script the
 * app's heap has to hold. busy-lib's own advice for apps on the device is a client
 * this thin.
 */

import type { DisplayDrawParams } from "@busy-app/busy-lib";

type Element = DisplayDrawParams["elements"][number];

const BASE = `${__BUSY_ADDR__.indexOf("://") >= 0 ? __BUSY_ADDR__ : `http://${__BUSY_ADDR__}`}/api/`;

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  // The firmware's fetch rejects `headers: undefined`, so the keys are only set when there is a body.
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(BASE + path, init);
  if (!response.ok) {
    // Read the body so the firmware can free the connection, then report the status.
    const text = await response.text().catch(() => "");
    throw new Error(`${method} ${path}: HTTP ${response.status} ${text.slice(0, 80)}`);
  }
  return response;
}

export const device = {
  async DisplayDraw(params: { application_name: string; priority?: number; elements: Element[] }): Promise<void> {
    await (await call("POST", "display/draw", params)).text();
  },

  async DisplayClear(params: { application_name: string; element_ids: string[] }): Promise<void> {
    // application_name goes in the body only: the firmware refuses it in both places.
    await (await call("DELETE", "display/draw", params)).text();
  },

  async AppsSettingsGet(params: { app_id: string }): Promise<{ values: Record<string, unknown> }> {
    const response = await call("GET", `apps/settings?app_id=${params.app_id}`);
    return (await response.json()) as { values: Record<string, unknown> };
  },
};
