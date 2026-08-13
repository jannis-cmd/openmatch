export const PENDING_MESSAGE_ATTEMPTS_KEY =
  "openmatch.pending-message-attempts.v1";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parsePendingMessageAttempts(value) {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(
          ([connectionId, attempt]) =>
            connectionId.length > 0 &&
            connectionId.length <= 200 &&
            attempt &&
            typeof attempt === "object" &&
            typeof attempt.text === "string" &&
            attempt.text.length > 0 &&
            attempt.text.length <= 1_000 &&
            typeof attempt.requestId === "string" &&
            uuid.test(attempt.requestId),
        )
        .slice(0, 50),
    );
  } catch {
    return {};
  }
}

export function restorePendingMessageAttempts(storage) {
  try {
    return parsePendingMessageAttempts(
      storage.getItem(PENDING_MESSAGE_ATTEMPTS_KEY),
    );
  } catch {
    return {};
  }
}

export function persistPendingMessageAttempts(storage, attempts) {
  try {
    if (Object.keys(attempts).length === 0)
      storage.removeItem(PENDING_MESSAGE_ATTEMPTS_KEY);
    else
      storage.setItem(PENDING_MESSAGE_ATTEMPTS_KEY, JSON.stringify(attempts));
  } catch {
    // Sending still works when browser storage is unavailable; only restart-safe
    // retry identity is unavailable for that tab.
  }
}

export function clearPendingMessageAttempts(storage) {
  try {
    storage.removeItem(PENDING_MESSAGE_ATTEMPTS_KEY);
  } catch {
    // Nothing else can be cleared when browser storage is unavailable.
  }
}
