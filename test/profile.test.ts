import assert from "node:assert/strict";
import { test } from "node:test";

import { parseProfile, sameProfile } from "../src/profile.ts";

test("accepts what people paste", () => {
  for (const raw of [
    "octocat",
    " @octocat ",
    "github.com/octocat",
    "https://github.com/octocat",
    "https://www.github.com/octocat/",
    "https://github.com/octocat?tab=repositories",
    "https://github.com/octocat/hello-world",
    "GitHub.com/octocat#top",
  ]) {
    assert.deepEqual(parseProfile(raw), { kind: "user", user: "octocat" }, raw);
  }
  assert.deepEqual(parseProfile("a-b-c"), { kind: "user", user: "a-b-c" });
});

test("empty and invalid", () => {
  assert.deepEqual(parseProfile("   "), { kind: "empty" });
  for (const raw of ["-octocat", "octo--cat", "octo cat", "https://gitlab.com/octocat", "a".repeat(40)]) {
    assert.equal(parseProfile(raw).kind, "invalid", raw);
  }
});

test("user names compare case-insensitively", () => {
  assert.ok(sameProfile(parseProfile("Octocat"), parseProfile("github.com/octocat")));
  assert.ok(!sameProfile(parseProfile("octocat"), parseProfile("torvalds")));
});

test("text widths follow the measured glyphs", async () => {
  const { textWidth } = await import("../src/layout.ts");
  // Measured on the device: "100" spans x 1..10, "+0" x 64..70.
  assert.equal(textWidth("100"), 10);
  assert.equal(textWidth("+0"), 7);
  assert.equal(textWidth(""), 0);
});
