export type WebConfiguration =
  { url: string; error: null } | { url: null; error: string };

export function resolveWebConfiguration(
  configuredUrl: string | undefined,
  development: boolean,
): WebConfiguration {
  const value = configuredUrl?.trim();
  if (!value) {
    if (development) return { url: "http://127.0.0.1:3000", error: null };
    return {
      url: null,
      error:
        "This build has no WhyMatch public website URL. Privacy and support links are unavailable.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { url: null, error: "The WhyMatch public website URL is invalid." };
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  )
    return {
      url: null,
      error:
        "The WhyMatch public website URL must be a plain origin without credentials, a path, query, or fragment.",
    };

  if (development) {
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return {
        url: null,
        error: "The development public website URL must use HTTP or HTTPS.",
      };
  } else if (parsed.protocol !== "https:") {
    return {
      url: null,
      error:
        "Preview and production builds require an HTTPS WhyMatch public website URL.",
    };
  }

  return { url: parsed.origin, error: null };
}
