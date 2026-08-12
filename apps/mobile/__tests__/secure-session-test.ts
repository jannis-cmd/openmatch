import {
  SESSION_TOKEN_KEY,
  clearSessionToken,
  persistSessionToken,
  restoreSessionToken,
  type SecureSessionStorage,
} from "../lib/secure-session";

const storage = (initial: string | null = null) => {
  let value = initial;
  const adapter: SecureSessionStorage = {
    isAvailableAsync: jest.fn(async () => true),
    getItemAsync: jest.fn(async () => value),
    setItemAsync: jest.fn(async (_key, next) => {
      value = next;
    }),
    deleteItemAsync: jest.fn(async () => {
      value = null;
    }),
  };
  return { adapter, value: () => value };
};

test("persists, restores, and clears only a valid opaque session token", async () => {
  const state = storage();
  const token = "s".repeat(43);
  await persistSessionToken(token, state.adapter);
  expect(state.value()).toBe(token);
  expect(await restoreSessionToken(state.adapter)).toBe(token);
  await clearSessionToken(state.adapter);
  expect(state.value()).toBeNull();
  expect(state.adapter.setItemAsync).toHaveBeenCalledWith(
    SESSION_TOKEN_KEY,
    token,
    expect.objectContaining({ keychainAccessible: expect.any(Number) }),
  );
});

test("fails closed when secure storage is unavailable", async () => {
  const state = storage();
  state.adapter.isAvailableAsync = jest.fn(async () => false);
  await expect(restoreSessionToken(state.adapter)).rejects.toThrow(
    "secure_session_storage_unavailable",
  );
  await expect(
    persistSessionToken("s".repeat(43), state.adapter),
  ).rejects.toThrow("secure_session_storage_unavailable");
});

test("removes malformed stored state instead of using it as authorization", async () => {
  const state = storage("too-short");
  await expect(restoreSessionToken(state.adapter)).rejects.toThrow(
    "invalid_secure_session_token",
  );
  expect(state.value()).toBeNull();
});
