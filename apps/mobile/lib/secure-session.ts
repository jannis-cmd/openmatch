import * as SecureStore from "expo-secure-store";

export const SESSION_TOKEN_KEY = "openmatch.account-session.v1";
const sessionOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type SecureSessionStorage = Pick<
  typeof SecureStore,
  "isAvailableAsync" | "getItemAsync" | "setItemAsync" | "deleteItemAsync"
>;

const requireAvailable = async (storage: SecureSessionStorage) => {
  if (!(await storage.isAvailableAsync()))
    throw new Error("secure_session_storage_unavailable");
};

export const restoreSessionToken = async (
  storage: SecureSessionStorage = SecureStore,
) => {
  await requireAvailable(storage);
  const token = await storage.getItemAsync(SESSION_TOKEN_KEY, sessionOptions);
  if (token === null) return null;
  if (token.length >= 32) return token;
  await storage.deleteItemAsync(SESSION_TOKEN_KEY, sessionOptions);
  throw new Error("invalid_secure_session_token");
};

export const persistSessionToken = async (
  token: string,
  storage: SecureSessionStorage = SecureStore,
) => {
  if (token.length < 32) throw new Error("invalid_secure_session_token");
  await requireAvailable(storage);
  await storage.setItemAsync(SESSION_TOKEN_KEY, token, sessionOptions);
};

export const clearSessionToken = async (
  storage: SecureSessionStorage = SecureStore,
) => {
  if (!(await storage.isAvailableAsync())) return;
  await storage.deleteItemAsync(SESSION_TOKEN_KEY, sessionOptions);
};
