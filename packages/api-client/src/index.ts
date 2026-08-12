import type {
  Introduction,
  Preferences,
  Profile,
  PublicProfile,
  WeightSuggestion,
} from "@openmatch/matching";

export type Decision = "interested" | "passed";
export type Connection = {
  id: string;
  profileId: string;
  createdAt: string;
  closedAt: string | null;
  profile?: PublicProfile;
};
export type Message = {
  id: number;
  connectionId: string;
  senderId: string;
  text: string;
  createdAt: string;
};
export type ReportReason =
  "harassment" | "scam" | "impersonation" | "offline_safety" | "other";
export type AccountStatus = "active" | "paused" | "hidden";
export type ConsentReceipt = {
  adultConfirmed: true;
  prototypeDataUseAccepted: true;
  noticeVersion: "prototype-0.1";
  acceptedAt: string;
};
export type TransparencyVersion = {
  matching: string;
  hiddenFactors: false;
  privatePersonalInputsMayBeRedacted: true;
  status: "prototype";
  objective: "useful introductions, not engagement";
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`OpenMatch API request failed (${status}: ${code})`);
  }
}

export function createApiClient(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
) {
  const request = async <T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> => {
    const response = await fetcher(`${baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-demo-session": "openmatch-local-demo",
        ...init.headers,
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new ApiError(response.status, body.error ?? "unknown_error");
    }
    return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
  };
  const json = (method: string, body?: unknown): RequestInit => ({
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return {
    profile: () => request<Profile>("/v1/me"),
    updateProfile: (patch: Partial<Profile>) =>
      request<Profile>("/v1/me", json("PATCH", patch)),
    exportData: () => request<Record<string, unknown>>("/v1/me/export"),
    deleteAccountData: () => request<void>("/v1/me", json("DELETE")),
    preferences: () => request<Preferences>("/v1/preferences"),
    updatePreferences: (patch: Partial<Preferences>) =>
      request<Preferences>("/v1/preferences", json("PATCH", patch)),
    preferenceSuggestions: () =>
      request<{
        items: WeightSuggestion[];
        minimumObservations: number;
        automaticChanges: false;
      }>("/v1/preferences/suggestions"),
    onboarding: () => request<{ complete: boolean }>("/v1/onboarding"),
    accountStatus: () =>
      request<{ status: AccountStatus }>("/v1/account/status"),
    updateAccountStatus: (status: AccountStatus) =>
      request<{ status: AccountStatus }>(
        "/v1/account/status",
        json("PATCH", { status }),
      ),
    completeOnboarding: () =>
      request<{ complete: true }>("/v1/onboarding/complete", json("POST")),
    consent: () => request<{ receipt: ConsentReceipt | null }>("/v1/consents"),
    acceptPrototypeConsent: () =>
      request<ConsentReceipt>(
        "/v1/consents",
        json("PATCH", {
          adultConfirmed: true,
          prototypeDataUseAccepted: true,
        }),
      ),
    transparencyVersion: () =>
      request<TransparencyVersion>("/v1/transparency/version"),
    introductions: () =>
      request<{ items: Introduction[]; finite: true; remaining: number }>(
        "/v1/introductions",
      ),
    decide: (profileId: string, decision: Decision) =>
      request<{ profileId: string; decision: Decision; mutual: boolean }>(
        `/v1/introductions/${encodeURIComponent(profileId)}/decision`,
        json("POST", { decision }),
      ),
    connections: () => request<{ items: Connection[] }>("/v1/connections"),
    messages: (connectionId: string) =>
      request<{ items: Message[] }>(
        `/v1/connections/${encodeURIComponent(connectionId)}/messages`,
      ),
    sendMessage: (connectionId: string, text: string) =>
      request<Message>(
        `/v1/connections/${encodeURIComponent(connectionId)}/messages`,
        json("POST", { text }),
      ),
    unmatch: (connectionId: string) =>
      request<void>(
        `/v1/connections/${encodeURIComponent(connectionId)}`,
        json("DELETE"),
      ),
    block: (profileId: string) =>
      request<{ profileId: string; blocked: true }>(
        `/v1/profiles/${encodeURIComponent(profileId)}/block`,
        json("POST"),
      ),
    report: (profileId: string, reason: ReportReason, details = "") =>
      request<{ id: number; status: "received" }>(
        "/v1/reports",
        json("POST", { profileId, reason, details }),
      ),
    reset: () => request<{ reset: true }>("/v1/demo/reset", json("POST")),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
