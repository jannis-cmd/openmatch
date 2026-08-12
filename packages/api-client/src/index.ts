import type {
  Introduction,
  Preferences,
  Profile,
  PublicProfile,
  WeightSuggestion,
} from "@openmatch/matching";

export type Decision = "interested" | "passed";
export type MeetingPreference = "not_asked" | "not_yet" | "open_to_plan";
export type Connection = {
  id: string;
  profileId: string;
  createdAt: string;
  closedAt: string | null;
  muted: boolean;
  meetingPreference: MeetingPreference;
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
export type ReportRecord = {
  id: number;
  profileId: string;
  reason: ReportReason;
  details: string;
  status: "received";
  createdAt: string;
};
export type AccountStatus = "active" | "paused" | "hidden";
export type DeliverySettings = { batchSize: 1 | 2 | 3 | 4 | 5 };
export type IntroductionBatch = {
  items: Introduction[];
  finite: true;
  remaining: number;
  weeklySeed: string;
  nextBatchAt: string;
  explorationSlots: number;
};
export type ConsentReceipt = {
  adultConfirmed: true;
  prototypeDataUseAccepted: true;
  noticeVersion: "prototype-0.1";
  acceptedAt: string;
};
export type ResearchConsentReceipt = {
  participating: boolean;
  noticeVersion: "research-prototype-0.1";
  updatedAt: string;
};
export type DeletionReceipt = {
  deleted: true;
  completedAt: string;
  mode: "synchronous-local-prototype";
  applicationBackups: "none";
};
export type TransparencyVersion = {
  matching: string;
  hiddenFactors: false;
  privatePersonalInputsMayBeRedacted: true;
  status: "prototype";
  objective: "useful introductions, not engagement";
  deployedCommit: string | null;
  buildStatus: "pinned" | "development-unpinned";
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
    deleteAccountData: () => request<DeletionReceipt>("/v1/me", json("DELETE")),
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
    deliverySettings: () => request<DeliverySettings>("/v1/delivery"),
    updateDeliverySettings: (batchSize: DeliverySettings["batchSize"]) =>
      request<DeliverySettings>("/v1/delivery", json("PATCH", { batchSize })),
    completeOnboarding: () =>
      request<{ complete: true }>("/v1/onboarding/complete", json("POST")),
    consent: () => request<{ receipt: ConsentReceipt | null }>("/v1/consents"),
    researchConsent: () =>
      request<{ receipt: ResearchConsentReceipt | null }>(
        "/v1/consents/research",
      ),
    updateResearchConsent: (participating: boolean) =>
      request<ResearchConsentReceipt>(
        "/v1/consents/research",
        json("PATCH", { participating }),
      ),
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
    introductions: () => request<IntroductionBatch>("/v1/introductions"),
    savedIntroductions: () =>
      request<{ items: Introduction[] }>("/v1/introductions/saved"),
    saveIntroduction: (profileId: string) =>
      request<{ profileId: string; saved: true; createdAt: string }>(
        `/v1/introductions/${encodeURIComponent(profileId)}/saved`,
        json("POST"),
      ),
    unsaveIntroduction: (profileId: string) =>
      request<void>(
        `/v1/introductions/${encodeURIComponent(profileId)}/saved`,
        json("DELETE"),
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
    sendMessage: (
      connectionId: string,
      text: string,
      safetyAcknowledged = false,
    ) =>
      request<Message>(
        `/v1/connections/${encodeURIComponent(connectionId)}/messages`,
        json("POST", { text, safetyAcknowledged }),
      ),
    unmatch: (connectionId: string) =>
      request<void>(
        `/v1/connections/${encodeURIComponent(connectionId)}`,
        json("DELETE"),
      ),
    closePolitely: (connectionId: string) =>
      request<{ message: Message; closed: true }>(
        `/v1/connections/${encodeURIComponent(connectionId)}/close-politely`,
        json("POST"),
      ),
    updateConnectionMute: (connectionId: string, muted: boolean) =>
      request<{ muted: boolean }>(
        `/v1/connections/${encodeURIComponent(connectionId)}/mute`,
        json("PATCH", { muted }),
      ),
    updateMeetingPreference: (
      connectionId: string,
      meetingPreference: MeetingPreference,
    ) =>
      request<{ meetingPreference: MeetingPreference }>(
        `/v1/connections/${encodeURIComponent(connectionId)}/meeting-preference`,
        json("PATCH", { meetingPreference }),
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
    reports: () => request<{ items: ReportRecord[] }>("/v1/reports"),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
