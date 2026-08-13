import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const release = JSON.parse(
  await readFile(
    new URL("../../../docs/RELEASE_ARTIFACTS.json", import.meta.url),
    "utf8",
  ),
);

test("publishes complete immutable provenance for every mobile artifact", async () => {
  assert.equal(release.schemaVersion, "1.0.0");
  assert.match(release.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(release.artifacts.length >= 3);
  assert.equal(
    new Set(release.artifacts.map(({ id }) => id)).size,
    release.artifacts.length,
  );
  for (const artifact of release.artifacts) {
    assert.match(artifact.sourceCommit, /^[0-9a-f]{40}$/);
    assert.match(artifact.sha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isSafeInteger(artifact.sizeBytes));
    assert.ok(artifact.sizeBytes > 0);
    assert.equal(artifact.status, "archived-source-snapshot");
    assert.match(artifact.url, /^https:\/\/expo\.dev\/artifacts\/eas\//);
    assert.equal(
      artifact.directlyInstallable,
      artifact.platform === "android" && artifact.kind === "apk",
    );
    await run(
      "git",
      ["merge-base", "--is-ancestor", artifact.sourceCommit, "HEAD"],
      {
        cwd: new URL("../../..", import.meta.url),
      },
    );
  }
});

test("states both current native build blockers without implying store availability", () => {
  assert.match(release.buildAvailability.android, /quota.*September 1, 2026/i);
  assert.match(release.buildAvailability.ios, /membership.*active/i);
  assert.match(release.buildAvailability.ios, /EAS build capacity|full Xcode/i);
});
