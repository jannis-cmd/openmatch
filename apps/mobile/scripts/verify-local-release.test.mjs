import assert from "node:assert/strict";
import test from "node:test";

import { assessLocalRelease } from "./verify-local-release.mjs";

const releaseEnv = {
  EXPO_PUBLIC_OPENMATCH_API_URL: "https://api.openmatch.example",
  EXPO_PUBLIC_OPENMATCH_WEB_URL: "https://openmatch.example",
  EAS_BUILD_GIT_COMMIT_HASH: "a".repeat(40),
};

test("accepts a complete iOS local release toolchain", () => {
  const calls = [];
  const errors = assessLocalRelease("ios", {
    env: releaseEnv,
    run: (command, args) => {
      calls.push([command, ...args]);
      return { ok: true, detail: "ready" };
    },
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(calls, [
    ["xcodebuild", "-version"],
    ["xcodebuild", "-license", "check"],
    ["xcodebuild", "-checkFirstLaunchStatus"],
    ["pod", "--version"],
    ["fastlane", "--version"],
  ]);
});

test("reports every iOS prerequisite without leaking command output", () => {
  const errors = assessLocalRelease("ios", {
    env: releaseEnv,
    run: () => ({ ok: false, detail: "private machine detail" }),
  });
  assert.equal(errors.length, 5);
  assert.equal(errors.join(" ").includes("private machine detail"), false);
  assert.match(errors.join(" "), /Xcode license/);
  assert.match(errors.join(" "), /first-launch/);
  assert.match(errors.join(" "), /CocoaPods/);
  assert.match(errors.join(" "), /Fastlane/);
});

test("accepts a complete Android local release toolchain", () => {
  const errors = assessLocalRelease("android", {
    env: { ...releaseEnv, ANDROID_HOME: "/sdk" },
    run: () => ({ ok: true, detail: "ready" }),
    pathExists: (path) => path === "/sdk",
  });
  assert.deepEqual(errors, []);
});

test("reports configuration and Android toolchain failures together", () => {
  const errors = assessLocalRelease("android", {
    env: {
      EXPO_PUBLIC_OPENMATCH_API_URL: "http://unsafe.example",
      EXPO_PUBLIC_OPENMATCH_WEB_URL: "https://example.org/path",
      EAS_BUILD_GIT_COMMIT_HASH: "short",
    },
    run: () => ({ ok: false, detail: "secret output" }),
    pathExists: () => false,
  });
  assert.equal(errors.length, 6);
  assert.match(errors.join(" "), /must use HTTPS/);
  assert.match(errors.join(" "), /plain origin/);
  assert.match(errors.join(" "), /full lowercase Git commit hash/);
  assert.match(errors.join(" "), /Java/);
  assert.match(errors.join(" "), /Android SDK command-line tools/);
  assert.equal(errors.join(" ").includes("secret output"), false);
});

test("rejects an unknown platform", () => {
  const errors = assessLocalRelease("windows", {
    env: releaseEnv,
    run: () => ({ ok: true, detail: "" }),
  });
  assert.deepEqual(errors, ['Platform must be exactly "ios" or "android".']);
});
