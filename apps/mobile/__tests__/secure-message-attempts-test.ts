import {
  MESSAGE_ATTEMPTS_KEY,
  clearPendingMessageAttempts,
  parsePendingMessageAttempts,
  persistPendingMessageAttempts,
  restorePendingMessageAttempts,
} from "../lib/secure-message-attempts";
import type { SecureSessionStorage } from "../lib/secure-session";

const requestId = "b4aca909-c73f-44f8-8b15-bc812155bf16";

const storage = () => {
  let value: string | null = null;
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

test("protects and restores the exact pending send attempt", async () => {
  const state = storage();
  const attempts = { connection: { text: "Still the same", requestId } };
  await persistPendingMessageAttempts(attempts, state.adapter);
  expect(await restorePendingMessageAttempts(state.adapter)).toEqual(attempts);
  expect(state.adapter.setItemAsync).toHaveBeenCalledWith(
    MESSAGE_ATTEMPTS_KEY,
    JSON.stringify(attempts),
    expect.objectContaining({ keychainAccessible: expect.any(Number) }),
  );
  await clearPendingMessageAttempts(state.adapter);
  expect(state.value()).toBeNull();
});

test("ignores corrupt, invalid, and excessive stored values", () => {
  expect(parsePendingMessageAttempts("not json")).toEqual({});
  expect(
    parsePendingMessageAttempts(
      JSON.stringify({
        valid: { text: "keep", requestId },
        badUuid: { text: "drop", requestId: "predictable" },
        tooLong: { text: "x".repeat(1_001), requestId },
      }),
    ),
  ).toEqual({ valid: { text: "keep", requestId } });
});
