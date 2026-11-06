/**
 * Turns whatever was pasted into the settings field into a GitHub user name.
 *
 * People paste `https://github.com/octocat`, `github.com/octocat?tab=repositories`,
 * `@octocat` or just `octocat`; all of them mean the same profile.
 */

/** GitHub's own rule: 1-39 letters, digits or single hyphens, not starting with one. */
const USER_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export type Profile =
  | { readonly kind: "empty" }
  | { readonly kind: "invalid"; readonly text: string }
  | { readonly kind: "user"; readonly user: string };

export function parseProfile(raw: string): Profile {
  let text = raw.trim();
  if (text === "") return { kind: "empty" };

  const scheme = text.indexOf("://");
  if (scheme >= 0) text = text.substring(scheme + 3);
  const lower = text.toLowerCase();
  if (lower.indexOf("www.") === 0) text = text.substring(4);
  if (text.toLowerCase().indexOf("github.com/") === 0) text = text.substring("github.com/".length);
  if (text[0] === "@") text = text.substring(1);
  for (const stop of ["/", "?", "#"]) {
    const at = text.indexOf(stop);
    if (at >= 0) text = text.substring(0, at);
  }

  return USER_NAME.test(text) ? { kind: "user", user: text } : { kind: "invalid", text: raw.trim() };
}

export function sameProfile(a: Profile, b: Profile): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "user" && b.kind === "user") return a.user.toLowerCase() === b.user.toLowerCase();
  if (a.kind === "invalid" && b.kind === "invalid") return a.text === b.text;
  return true;
}
