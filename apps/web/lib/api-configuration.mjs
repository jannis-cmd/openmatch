export function resolveWebApiConfiguration(configuredUrl, development) {
  const value = configuredUrl?.trim();
  if (!value) {
    if (development) return { url: "http://127.0.0.1:4000", error: null };
    return {
      url: null,
      error:
        "The interactive demo is not configured for this deployment. The public explanation and transparency resources remain available.",
    };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { url: null, error: "The configured demo service URL is invalid." };
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    return {
      url: null,
      error:
        "The demo service URL must be a plain origin without credentials, a path, query, or fragment.",
    };
  }

  if (development) {
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        url: null,
        error: "The development demo service must use HTTP or HTTPS.",
      };
    }
  } else if (parsed.protocol !== "https:") {
    return {
      url: null,
      error: "A hosted interactive demo requires an HTTPS service URL.",
    };
  }

  return { url: parsed.origin, error: null };
}
