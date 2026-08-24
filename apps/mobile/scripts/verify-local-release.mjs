import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  validateReleaseApiUrl,
  validateReleaseOrigin,
  validateSourceRevision,
} from "./verify-eas-environment.mjs";

const execute = (command, args = []) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    detail: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
};

const requiredCommand = (run, command, args, message) =>
  run(command, args).ok ? null : message;

export function assessLocalRelease(platform, options = {}) {
  const env = options.env ?? process.env;
  const run = options.run ?? execute;
  const pathExists = options.pathExists ?? existsSync;
  const errors = [
    validateReleaseApiUrl(env.EXPO_PUBLIC_OPENMATCH_API_URL),
    validateReleaseOrigin(
      env.EXPO_PUBLIC_OPENMATCH_WEB_URL,
      "EXPO_PUBLIC_OPENMATCH_WEB_URL",
    ),
    validateSourceRevision(env.EAS_BUILD_GIT_COMMIT_HASH),
  ].filter(Boolean);

  if (platform === "ios") {
    errors.push(
      requiredCommand(
        run,
        "xcodebuild",
        ["-version"],
        "Full Xcode is required and must be selected with xcode-select.",
      ),
      requiredCommand(
        run,
        "xcodebuild",
        ["-license", "check"],
        "The account owner must review and accept Apple's Xcode license.",
      ),
      requiredCommand(
        run,
        "xcodebuild",
        ["-checkFirstLaunchStatus"],
        "Xcode first-launch components are incomplete; the account owner must run sudo xcodebuild -runFirstLaunch.",
      ),
      requiredCommand(
        run,
        "pod",
        ["--version"],
        "CocoaPods is required for a local iOS EAS build.",
      ),
      requiredCommand(
        run,
        "fastlane",
        ["--version"],
        "Fastlane is required for a local iOS EAS build.",
      ),
    );
  } else if (platform === "android") {
    const sdkRoot = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
    errors.push(
      requiredCommand(
        run,
        "java",
        ["-version"],
        "A compatible Java runtime is required for a local Android build.",
      ),
      requiredCommand(
        run,
        "sdkmanager",
        ["--version"],
        "Android SDK command-line tools are required and must be on PATH.",
      ),
      !sdkRoot || !pathExists(sdkRoot)
        ? "ANDROID_HOME or ANDROID_SDK_ROOT must identify an installed Android SDK."
        : null,
    );
  } else {
    errors.push('Platform must be exactly "ios" or "android".');
  }

  return errors.filter(Boolean);
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  const platform = process.argv[2];
  const errors = assessLocalRelease(platform);
  if (errors.length) {
    console.error(`WhyMatch ${platform ?? "local"} release preflight failed:`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`WhyMatch ${platform} local release prerequisites are ready.`);
}
