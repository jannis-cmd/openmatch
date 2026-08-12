import assert from "node:assert/strict";
import test from "node:test";

import { resolveWebApiConfiguration } from "./api-configuration.mjs";

test("local development defaults to the local API", () => {
  assert.deepEqual(resolveWebApiConfiguration(undefined, true), {
    url: "http://127.0.0.1:4000",
    error: null,
  });
});

test("an unconfigured hosted site keeps the demo unavailable", () => {
  assert.equal(resolveWebApiConfiguration(undefined, false).url, null);
});

test("a hosted demo requires a plain HTTPS origin", () => {
  assert.match(
    resolveWebApiConfiguration("http://localhost:4000", false).error,
    /HTTPS/,
  );
  assert.match(
    resolveWebApiConfiguration("https://user:secret@example.org/v1", false)
      .error,
    /plain origin/,
  );
  assert.deepEqual(
    resolveWebApiConfiguration(" https://api.example.org/ ", false),
    { url: "https://api.example.org", error: null },
  );
});
