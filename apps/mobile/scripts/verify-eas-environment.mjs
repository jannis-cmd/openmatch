export function validateReleaseApiUrl(value) {
  if (!value?.trim()) {
    return "EXPO_PUBLIC_OPENMATCH_API_URL is required for every EAS build.";
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return "EXPO_PUBLIC_OPENMATCH_API_URL must be a valid URL.";
  }

  if (parsed.protocol !== "https:") {
    return "EXPO_PUBLIC_OPENMATCH_API_URL must use HTTPS for an EAS build.";
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    return "EXPO_PUBLIC_OPENMATCH_API_URL must be a plain origin without credentials, a path, query, or fragment.";
  }

  return null;
}

if (process.env.EAS_BUILD === "true" || process.env.EAS_BUILD === "1") {
  const error = validateReleaseApiUrl(
    process.env.EXPO_PUBLIC_OPENMATCH_API_URL,
  );

  if (error) {
    console.error(`OpenMatch mobile configuration error: ${error}`);
    process.exit(1);
  }

  console.log("OpenMatch mobile HTTPS service configuration validated.");
}
