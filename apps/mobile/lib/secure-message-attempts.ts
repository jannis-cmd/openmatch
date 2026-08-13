import * as SecureStore from "expo-secure-store";
import type { SecureSessionStorage } from "./secure-session";

export const MESSAGE_ATTEMPTS_KEY = "openmatch.pending-message-attempts.v1";
const storageOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PendingMessageAttempts = Record<
  string,
  { text: string; requestId: string }
>;

export const parsePendingMessageAttempts = (
  value: string | null,
): PendingMessageAttempts => {
  if (value === null) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(
          ([connectionId, attempt]) =>
            connectionId.length > 0 &&
            connectionId.length <= 200 &&
            attempt !== null &&
            typeof attempt === "object" &&
            "text" in attempt &&
            typeof attempt.text === "string" &&
            attempt.text.length > 0 &&
            attempt.text.length <= 1_000 &&
            "requestId" in attempt &&
            typeof attempt.requestId === "string" &&
            uuid.test(attempt.requestId),
        )
        .slice(0, 50),
    ) as PendingMessageAttempts;
  } catch {
    return {};
  }
};

export const restorePendingMessageAttempts = async (
  storage: SecureSessionStorage = SecureStore,
) => {
  if (!(await storage.isAvailableAsync())) return {};
  return parsePendingMessageAttempts(
    await storage.getItemAsync(MESSAGE_ATTEMPTS_KEY, storageOptions),
  );
};

export const persistPendingMessageAttempts = async (
  attempts: PendingMessageAttempts,
  storage: SecureSessionStorage = SecureStore,
) => {
  if (!(await storage.isAvailableAsync())) return;
  if (Object.keys(attempts).length === 0)
    await storage.deleteItemAsync(MESSAGE_ATTEMPTS_KEY, storageOptions);
  else
    await storage.setItemAsync(
      MESSAGE_ATTEMPTS_KEY,
      JSON.stringify(attempts),
      storageOptions,
    );
};

export const clearPendingMessageAttempts = async (
  storage: SecureSessionStorage = SecureStore,
) => {
  if (!(await storage.isAvailableAsync())) return;
  await storage.deleteItemAsync(MESSAGE_ATTEMPTS_KEY, storageOptions);
};
