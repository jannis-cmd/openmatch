export function validateReleaseOrigin(value, variableName) {
  if (!value?.trim()) {
    return `${variableName} is required for every EAS build.`;
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return `${variableName} must be a valid URL.`;
  }

  if (parsed.protocol !== "https:") {
    return `${variableName} must use HTTPS for an EAS build.`;
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    return `${variableName} must be a plain origin without credentials, a path, query, or fragment.`;
  }

  return null;
}

export const validateReleaseApiUrl = (value) =>
  validateReleaseOrigin(value, "EXPO_PUBLIC_OPENMATCH_API_URL");

export const validateSourceRevision = (value) =>
  /^[0-9a-f]{40}$/.test(value ?? "")
    ? null
    : "EAS_BUILD_GIT_COMMIT_HASH must be the full lowercase Git commit hash.";

if (process.env.EAS_BUILD === "true" || process.env.EAS_BUILD === "1") {
  const error = validateReleaseApiUrl(
    process.env.EXPO_PUBLIC_OPENMATCH_API_URL,
  );
  const webError = validateReleaseOrigin(
    process.env.EXPO_PUBLIC_OPENMATCH_WEB_URL,
    "EXPO_PUBLIC_OPENMATCH_WEB_URL",
  );
  const sourceError = validateSourceRevision(
    process.env.EAS_BUILD_GIT_COMMIT_HASH,
  );

  if (error || webError || sourceError) {
    console.error(
      `OpenMatch mobile configuration error: ${error ?? webError ?? sourceError}`,
    );
    process.exit(1);
  }

  console.log("OpenMatch mobile HTTPS service configuration validated.");
}
