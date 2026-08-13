import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appJson = JSON.parse(
  await readFile(new URL("../app.json", import.meta.url), "utf8"),
).expo;

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
  assert.deepEqual(appJson.android.blockedPermissions.sort(), [
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.VIBRATE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
  ]);
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
