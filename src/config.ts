/** The app's one setting, as edited in the bar's web interface: whose activity to show. */

import { device } from "@shared/device";
import { loadValues } from "@shared/settings";

import { type Profile, parseProfile } from "./profile.ts";

/**
 * Stored settings. The runtime's `Settings` global comes first; where it is
 * missing, the documented `GET /api/apps/settings` endpoint answers instead.
 */
async function readValues(appId: string): Promise<Record<string, unknown>> {
  const local = await loadValues();
  if (local) return local;
  const doc = await device.AppsSettingsGet({ app_id: appId });
  return doc.values;
}

export async function readProfile(appId: string): Promise<Profile> {
  const values = await readValues(appId);
  return parseProfile(typeof values.profile === "string" ? values.profile : "");
}
