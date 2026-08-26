import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const templateDirectory = new URL(
  "../infra/supabase/email-templates/",
  import.meta.url,
);

for (const name of ["confirmation", "recovery"]) {
  test(`${name} email is bilingual, actionable, and tracking-free`, async () => {
    const [body, subject] = await Promise.all([
      readFile(new URL(`${name}.html`, templateDirectory), "utf8"),
      readFile(new URL(`${name}-subject.txt`, templateDirectory), "utf8"),
    ]);

    assert.match(body, /lang="en"/);
    assert.match(body, /\{\{ \.ConfirmationURL \}\}/);
    assert.match(body, /WhyMatch/);
    assert.match(body, /E-Mail|Passwort/);
    assert.match(subject, /WhyMatch/);
    assert.match(subject, /Bestätige|Passwort/);
    assert.doesNotMatch(body, /<img\b/i);
    assert.doesNotMatch(body, /https?:\/\//i);
    assert.doesNotMatch(body, /tracking|analytics/i);
  });
}
