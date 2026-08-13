import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const lock = readFileSync(
  new URL("../pnpm-lock.yaml", import.meta.url),
  "utf8",
);

test("pins patched transitive versions for actionable production advisories", () => {
  assert.deepEqual(manifest.pnpm?.overrides, {
    postcss: "8.5.26",
    sharp: "0.35.3",
    "uuid@<11.1.1": "11.1.1",
  });
  for (const snapshot of [
    "  postcss@8.5.26:",
    "  sharp@0.35.3:",
    "  uuid@11.1.1:",
  ])
    assert.match(lock, new RegExp(`^${snapshot}$`, "m"));
  assert.doesNotMatch(lock, /^  sharp@0\.(?:3[0-4]|[0-2]\d)\./m);
  assert.doesNotMatch(lock, /^  postcss@8\.5\.(?:[0-9]|1[0-9]|2[0-2]):/m);
  assert.doesNotMatch(lock, /^  uuid@(?:[0-9]|10)\./m);
});
