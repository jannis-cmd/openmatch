import { resolveApiConfiguration } from "../lib/api-configuration";

test("development can use the explicit local fallback", () => {
  expect(resolveApiConfiguration(undefined, true)).toEqual({
    url: "http://127.0.0.1:4000",
    error: null,
  });
});

test("preview and production fail closed without HTTPS", () => {
  expect(resolveApiConfiguration(undefined, false)).toMatchObject({
    url: null,
  });
  expect(resolveApiConfiguration("http://192.168.1.134:4000", false)).toEqual({
    url: null,
    error:
      "Preview and production builds require an HTTPS WhyMatch service URL.",
  });
});

test("production accepts only a plain HTTPS origin", () => {
  expect(
    resolveApiConfiguration("https://api.openmatch.example/", false),
  ).toEqual({ url: "https://api.openmatch.example", error: null });
  expect(
    resolveApiConfiguration(
      "https://user:secret@api.openmatch.example/v1?token=x",
      false,
    ),
  ).toMatchObject({ url: null });
});
