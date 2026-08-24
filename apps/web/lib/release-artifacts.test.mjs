import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const workingGit = async () => {
  const candidates = (process.env.PATH ?? "")
    .split(":")
    .filter(Boolean)
    .map((directory) => `${directory}/git`);
  for (const candidate of [...new Set(candidates)]) {
    try {
      await run(candidate, ["--version"]);
      return candidate;
    } catch {
      // A developer-tool shim may exist but be unusable until host setup is complete.
    }
  }
  throw new Error(
    "No functioning Git executable is available for provenance checks",
  );
};
const release = JSON.parse(
  await readFile(
    new URL("../../../docs/RELEASE_ARTIFACTS.json", import.meta.url),
    "utf8",
  ),
);

test("publishes complete immutable provenance for every mobile artifact", async () => {
  const git = await workingGit();
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
    if (artifact.id === "android-apk-build-12") {
      assert.equal(artifact.status, "current-owner-testing-baseline");
      assert.match(
        artifact.url,
        /^https:\/\/github\.com\/jannis-cmd\/openmatch\/releases\/download\//,
      );
      assert.match(artifact.releaseUrl, /^https:\/\/github\.com\//);
      assert.match(artifact.workflowRunUrl, /^https:\/\/github\.com\//);
      assert.match(artifact.signingCertificateSha256, /^[0-9a-f]{64}$/);
    } else if (artifact.id === "android-apk-build-11") {
      assert.equal(artifact.status, "archived-source-snapshot");
      assert.match(
        artifact.url,
        /^https:\/\/github\.com\/jannis-cmd\/openmatch\/releases\/download\//,
      );
    } else {
      assert.equal(artifact.status, "archived-source-snapshot");
      assert.match(artifact.url, /^https:\/\/expo\.dev\/artifacts\/eas\//);
    }
    assert.equal(
      artifact.directlyInstallable,
      artifact.platform === "android" && artifact.kind === "apk",
    );
    await run(
      git,
      ["merge-base", "--is-ancestor", artifact.sourceCommit, "HEAD"],
      {
        cwd: new URL("../../..", import.meta.url),
      },
    );
  }
});

test("records the current signed iOS artifact without implying public availability", async () => {
  const git = await workingGit();
  assert.equal(release.verifiedLocalArtifacts.length, 1);
  const ios = release.verifiedLocalArtifacts[0];
  assert.equal(ios.id, "ios-ipa-build-12");
  assert.equal(ios.status, "available-in-internal-testflight");
  assert.equal(ios.publiclyDownloadable, false);
  assert.equal(ios.ascAppId, "6801267398");
  assert.match(ios.sourceCommit, /^[0-9a-f]{40}$/);
  assert.match(ios.sha256, /^[0-9a-f]{64}$/);
  await run(git, ["merge-base", "--is-ancestor", ios.sourceCommit, "HEAD"], {
    cwd: new URL("../../..", import.meta.url),
  });
  assert.equal(ios.expoSdkVersion, "57.0.0");
  assert.match(release.buildAvailability.android, /Android APK build 12/i);
  assert.match(release.buildAvailability.android, /not a Google Play release/i);
  assert.match(release.buildAvailability.ios, /Signed iOS IPA build 12/i);
  assert.match(release.buildAvailability.ios, /App Store Connect/i);
  assert.match(
    release.buildAvailability.ios,
    /not a public App Store release/i,
  );
});
