import assert from "node:assert/strict";
import test from "node:test";

import { validateReleaseApiUrl } from "./verify-eas-environment.mjs";

test("requires a service URL", () => {
  assert.match(validateReleaseApiUrl(undefined), /required/);
});

test("rejects an HTTP service URL", () => {
  assert.match(validateReleaseApiUrl("http://192.168.1.134:4000"), /HTTPS/);
});

test("rejects URL components beyond the origin", () => {
  assert.match(validateReleaseApiUrl("https://api.example.com/v1"), /origin/);
  assert.match(validateReleaseApiUrl("https://a:b@api.example.com"), /origin/);
  assert.match(validateReleaseApiUrl("https://api.example.com?q=1"), /origin/);
});

test("accepts a plain HTTPS origin", () => {
  assert.equal(validateReleaseApiUrl(" https://api.example.com/ "), null);
});
