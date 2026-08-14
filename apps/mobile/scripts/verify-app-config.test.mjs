import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const require = createRequire(import.meta.url);

const appJson = JSON.parse(
  await readFile(new URL("../app.json", import.meta.url), "utf8"),
).expo;
const easJson = JSON.parse(
  await readFile(new URL("../eas.json", import.meta.url), "utf8"),
);

const pngMetadata = async (relativePath) => {
  const bytes = await readFile(new URL(`../${relativePath}`, import.meta.url));
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
  };
};

test("uses stable production identities without development network exceptions", () => {
  assert.equal(appJson.ios.bundleIdentifier, "org.openmatch.app");
  assert.equal(appJson.android.package, "org.openmatch.app");
  assert.equal(appJson.android.versionCode, 12);
  assert.equal(appJson.scheme, "openmatch");
  assert.equal(appJson.userInterfaceStyle, "light");
  assert.match(appJson.description, /nonprofit, open-source/);
  assert.equal(
    "NSLocalNetworkUsageDescription" in appJson.ios.infoPlist,
    false,
  );
  assert.deepEqual(appJson.ios.infoPlist.NSAppTransportSecurity, {
    NSAllowsArbitraryLoads: false,
    NSAllowsLocalNetworking: false,
    NSExceptionDomains: {},
  });
  assert.deepEqual(appJson.android.permissions, []);
  assert.equal(appJson.android.allowBackup, false);
  const secureStorePlugin = appJson.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-secure-store",
  );
  assert.deepEqual(secureStorePlugin?.[1], {
    configureAndroidBackup: false,
    faceIDPermission: false,
  });
  const imagePickerPlugin = appJson.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-image-picker",
  );
  assert.deepEqual(imagePickerPlugin?.[1], {
    photosPermission:
      "OpenMatch accesses only the photo you choose for your dating profile.",
    cameraPermission: false,
    microphonePermission: false,
  });
  assert.deepEqual(appJson.android.blockedPermissions.sort(), [
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.VIBRATE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
  ]);
});

test("makes release artifact formats and clean-source provenance explicit", () => {
  assert.equal(easJson.cli.requireCommit, true);
  assert.equal(easJson.cli.appVersionSource, "remote");
  assert.equal(easJson.build.preview.distribution, "internal");
  assert.equal(easJson.build.preview.android.buildType, "apk");
  assert.equal(easJson.build.production.android.buildType, "app-bundle");
  assert.equal(easJson.submit.production.ios.ascAppId, "6801267398");
});

test("ships a full store icon and a transparent adaptive foreground", async () => {
  const storeIcon = await pngMetadata(appJson.icon);
  assert.deepEqual(storeIcon, { width: 1024, height: 1024, colorType: 2 });

  const adaptiveIcon = await pngMetadata(
    appJson.android.adaptiveIcon.foregroundImage,
  );
  assert.deepEqual(adaptiveIcon, {
    width: 1024,
    height: 1024,
    colorType: 6,
  });
  assert.equal(appJson.android.adaptiveIcon.backgroundColor, "#FAFAF7");
});

test("resolves to strict iOS transport and internet-only Android access", async () => {
  const expoCli = require.resolve("expo/bin/cli");
  const { stdout } = await run(
    process.execPath,
    [expoCli, "config", "--type", "introspect", "--json"],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        EAS_BUILD_GIT_COMMIT_HASH: "a".repeat(40),
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const config = JSON.parse(stdout);
  assert.equal(config.extra.sourceRevision, "a".repeat(40));
  const resolved = config._internal.modResults;
  assert.equal("NSFaceIDUsageDescription" in resolved.ios.infoPlist, false);
  assert.deepEqual(resolved.ios.infoPlist.NSAppTransportSecurity, {
    NSAllowsArbitraryLoads: false,
    NSAllowsLocalNetworking: false,
    NSExceptionDomains: {},
  });

  const manifest = resolved.android.manifest.manifest;
  const retainedPermissions = manifest["uses-permission"]
    .filter((entry) => entry.$["tools:node"] !== "remove")
    .map((entry) => entry.$["android:name"]);
  assert.deepEqual(retainedPermissions, ["android.permission.INTERNET"]);
  const application = manifest.application[0].$;
  assert.equal(application["android:allowBackup"], "false");
  assert.equal(application["android:fullBackupContent"], undefined);
  assert.equal(application["android:dataExtractionRules"], undefined);
});
