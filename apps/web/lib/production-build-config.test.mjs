import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyInteractiveProductionBuild } from "./production-build-config.mjs";

test("accepts only a client bundle containing the exact expected HTTPS origin", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openmatch-web-build-"));
  try {
    await mkdir(join(directory, "nested"));
    await writeFile(
      join(directory, "nested", "page.js"),
      'const api="https://api.example.org";',
    );
    assert.equal(
      await verifyInteractiveProductionBuild(
        directory,
        "https://api.example.org",
      ),
      "https://api.example.org",
    );
    await assert.rejects(
      verifyInteractiveProductionBuild(directory, "https://other.example.org"),
      /expected_api_origin_missing_from_client_bundle/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects unsafe or path-bearing expected origins", async () => {
  for (const value of [
    "http://api.example.org",
    "https://api.example.org/private",
    "https://user:secret@example.org",
  ]) {
    await assert.rejects(
      verifyInteractiveProductionBuild("unused", value),
      /expected_api_origin_must_be_plain_https/,
    );
  }
});
