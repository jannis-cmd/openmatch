import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const policy = JSON.parse(
  await readFile(path.join(repository, "docs/PRODUCT_BOUNDARIES.json"), "utf8"),
);

const applicationFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory()
          ? applicationFiles(target)
          : /\.(?:js|mjs|ts|tsx)$/.test(entry.name) &&
              !/\.test\.(?:js|mjs|ts|tsx)$/.test(entry.name)
            ? [target]
            : [];
      }),
    )
  ).flat();
};

test("publishes complete, uniquely named product boundaries", () => {
  assert.equal(policy.schemaVersion, "1.0.0");
  assert.match(policy.objective, /leave the app/);
  assert.equal(policy.capabilities.length, 10);
  assert.equal(
    new Set(policy.capabilities.map(({ id }) => id)).size,
    policy.capabilities.length,
  );
  for (const capability of policy.capabilities) {
    assert.ok(policy.states[capability.state], `${capability.id} has a state`);
    assert.ok(capability.userFacing.length > 30, `${capability.id} needs copy`);
    assert.ok(capability.reason.length > 30, `${capability.id} needs a reason`);
  }
});

test("keeps prohibited capabilities out of direct application dependencies", async () => {
  const manifests = await Promise.all(
    [
      "package.json",
      "apps/web/package.json",
      "apps/mobile/package.json",
      "packages/api-client/package.json",
      "packages/matching/package.json",
      "services/api/package.json",
    ].map(async (file) =>
      JSON.parse(await readFile(path.join(repository, file), "utf8")),
    ),
  );
  const dependencies = manifests.flatMap((manifest) =>
    Object.keys(manifest.dependencies ?? {}),
  );
  for (const fragment of policy.releaseEnforcement
    .forbiddenDirectDependencyFragments) {
    assert.equal(
      dependencies.some((dependency) =>
        dependency.toLowerCase().includes(fragment.toLowerCase()),
      ),
      false,
      `forbidden direct dependency fragment: ${fragment}`,
    );
  }
});

test("keeps prohibited browser and native APIs out of application source", async () => {
  const files = (
    await Promise.all(
      [
        "apps/web/app",
        "apps/web/lib",
        "apps/mobile/app",
        "apps/mobile/lib",
        "packages/api-client/src",
        "packages/matching/src",
        "services/api/src",
      ].map((directory) => applicationFiles(path.join(repository, directory))),
    )
  ).flat();
  const source = (
    await Promise.all(files.map((file) => readFile(file, "utf8")))
  ).join("\n");
  for (const fragment of policy.releaseEnforcement.forbiddenSourceFragments)
    assert.equal(
      source.includes(fragment),
      false,
      `forbidden application API fragment: ${fragment}`,
    );
});

test("does not ship a service worker that could persist private responses", async () => {
  for (const filename of ["sw.js", "service-worker.js"]) {
    await assert.rejects(
      access(path.join(repository, "apps/web/public", filename)),
    );
  }
});
