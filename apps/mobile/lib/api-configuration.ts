export type ApiConfiguration =
  { url: string; error: null } | { url: null; error: string };

export function resolveApiConfiguration(
  configuredUrl: string | undefined,
  development: boolean,
): ApiConfiguration {
  const value = configuredUrl?.trim();
  if (!value) {
    if (development) return { url: "http://127.0.0.1:4000", error: null };
    return {
      url: null,
      error:
        "This build has no OpenMatch service URL. The distributor must configure EXPO_PUBLIC_OPENMATCH_API_URL before building it.",
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return {
      url: null,
      error: "The configured OpenMatch service URL is invalid.",
    };
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
        "The OpenMatch service URL must be a plain origin without credentials, a path, query, or fragment.",
    };
  if (development) {
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return {
        url: null,
        error: "The development service URL must use HTTP or HTTPS.",
      };
  } else if (parsed.protocol !== "https:") {
    return {
      url: null,
      error:
        "Preview and production builds require an HTTPS OpenMatch service URL.",
    };
  }
  return { url: parsed.origin, error: null };
}
