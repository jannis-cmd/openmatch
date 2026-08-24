import { resolveWebConfiguration } from "../lib/web-configuration";

test("development uses the local public website", () => {
  expect(resolveWebConfiguration(undefined, true)).toEqual({
    url: "http://127.0.0.1:3000",
    error: null,
  });
});

test("distributed builds fail closed without a public HTTPS origin", () => {
  expect(resolveWebConfiguration(undefined, false)).toMatchObject({
    url: null,
  });
  expect(resolveWebConfiguration("http://openmatch.example", false)).toEqual({
    url: null,
    error:
      "Preview and production builds require an HTTPS WhyMatch public website URL.",
  });
});

test("accepts a plain HTTPS origin including a non-default port", () => {
  expect(
    resolveWebConfiguration("https://openmatch.example:8443/", false),
  ).toEqual({ url: "https://openmatch.example:8443", error: null });
  expect(
    resolveWebConfiguration("https://openmatch.example/privacy?q=x", false),
  ).toMatchObject({ url: null });
});
