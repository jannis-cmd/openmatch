import type {
  Introduction,
  Preferences,
  Profile,
  PublicProfile,
  WeightSuggestion,
} from "@openmatch/matching";

export type Decision = "interested" | "passed";
export type DataExport = Record<string, unknown> & {
  schemaVersion: "1.1.0";
  algorithmVersion: string;
  exportedAt: string;
};
export type MeetingPreference = "not_asked" | "not_yet" | "open_to_plan";
export type ConnectionOutcomeKind =
  | "met_in_person"
  | "wanted_second_date"
  | "relationship_started"
  | "relationship_ended";
export type ConnectionOutcome = {
  kind: ConnectionOutcomeKind;
  recordedAt: string;
};
export type Connection = {
  id: string;
  profileId: string;
  createdAt: string;
  closedAt: string | null;
  muted: boolean;
  meetingPreference: MeetingPreference;
  outcomes: ConnectionOutcome[];
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
export type ReportUpdateKind =
  "additional_context" | "correction" | "withdrawal_request";
export type ReportUpdate = {
  id: number;
  reportId: number;
  kind: ReportUpdateKind;
  details: string;
  createdAt: string;
};
export type ReportRecord = {
  id: number;
  profileId: string;
  reason: ReportReason;
  details: string;
  status: "received";
  createdAt: string;
  updates: ReportUpdate[];
};
export type AccountStatus = "active" | "paused" | "hidden";
export type DeliverySettings = { batchSize: 1 | 2 | 3 | 4 | 5 };
export type AccountDeliveryStatus = {
  state: "clear" | "retrying";
  pendingCount: number;
  oldestCreatedAt: string | null;
  retryAttempts: number;
  lastAttemptAt: string | null;
  automaticDiscard: false;
};
export type SecurityNotificationDeliveryStatus = AccountDeliveryStatus;
export const securityNotificationDeliveryFallback = (
  status: SecurityNotificationStatus,
): SecurityNotificationDeliveryStatus | null =>
  status === "failed" || status === "partial"
    ? {
        state: "retrying",
        pendingCount: 1,
        oldestCreatedAt: null,
        retryAttempts: 0,
        lastAttemptAt: null,
        automaticDiscard: false,
      }
    : null;
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
export type DirectoryConsentReceipt = {
  participating: boolean;
  noticeVersion:
    "account-directory-prototype-0.1" | "account-directory-prototype-0.2";
  updatedAt: string;
  availableUntil?: string | null;
};
export type SetupReceipt = {
  version: "setup-0.1";
  complete: true;
  profile: Profile;
  preferences: Preferences;
  consent: ConsentReceipt;
  directoryConsent: DirectoryConsentReceipt | null;
};
export type PreferencePoolPreview = {
  eligibleCount: number;
  evaluatedCount: number;
  scope: "current-unresolved-prototype-pool";
  estimate: false;
  preferencesSaved: false;
};
export const directoryParticipationIsActive = (
  receipt: DirectoryConsentReceipt | null,
  now = Date.now(),
) =>
  receipt?.participating === true &&
  typeof receipt.availableUntil === "string" &&
  Date.parse(receipt.availableUntil) > now;
export type DeletionReceipt = {
  deleted: true;
  completedAt: string;
  mode: "synchronous-local-prototype";
  applicationBackups: "none";
};
export type AccountDeletionReceipt = {
  deleted: true;
  completedAt: string;
  credentialsDeleted: true;
  sessionsRevoked: true;
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
export type AuthSession = {
  token: string;
  expiresAt: string;
  authentication: boolean;
  emailVerification?: EmailVerificationStatus & {
    delivery?: "sent" | "failed" | "not_configured";
  };
};
export type EmailVerificationStatus = {
  email: string;
  verifiedAt: string | null;
  deliveryConfigured: boolean;
};
export type EmailChangeStatus = EmailVerificationStatus & {
  pendingEmail: string | null;
  pendingExpiresAt: string | null;
};
export type SecurityNotificationStatus =
  "sent" | "partial" | "failed" | "not_configured" | "unverified";
export type PasswordChangeSession = AuthSession & {
  otherSessionsRevoked: true;
  securityNotification: SecurityNotificationStatus;
};
export type RecoverySession = PasswordChangeSession & {
  recoveryCodesRevoked: true;
};
export type RecoveryCodeSet = {
  codes: string[];
  createdAt: string;
  securityNotification: SecurityNotificationStatus;
};
export type NotificationEmailStatus = {
  primaryEmail: string;
  primaryVerifiedAt: string | null;
  email: string | null;
  verifiedAt: string | null;
  pendingEmail: string | null;
};
export type ApiClientOptions = {
  initialToken?: string | null;
  demoSessions?: boolean;
  client?: "web" | "ios" | "android";
  onTokenChange?: (token: string | null) => void;
  onSessionInvalidated?: () => void;
};
export type AccountSession = {
  id: string;
  client: "web" | "ios" | "android" | "unknown";
  createdAt: string;
  expiresAt: string;
  current: boolean;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null,
    readonly operation: "decision" | "message" | "report" | null = null,
  ) {
    super(`OpenMatch API request failed (${status}: ${code})`);
  }
}

const isSecurityNotificationStatus = (
  value: unknown,
): value is SecurityNotificationStatus =>
  ["sent", "partial", "failed", "not_configured", "unverified"].includes(
    String(value),
  );

export function createApiClient(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
  options: ApiClientOptions = {},
) {
  const origin = baseUrl.replace(/\/$/, "");
  let sessionPromise: Promise<string> | null = options.initialToken
    ? Promise.resolve(options.initialToken)
    : null;
  const createDemoSession = async () => {
    const response = await fetcher(`${origin}/v1/demo/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new ApiError(
        response.status,
        body.error ?? "demo_session_unavailable",
      );
    }
    const body = (await response.json()) as { token?: unknown };
    if (typeof body.token !== "string" || body.token.length < 32)
      throw new ApiError(500, "invalid_demo_session");
    return body.token;
  };
  const sessionToken = () => {
    if (sessionPromise) return sessionPromise;
    if (options.demoSessions === false)
      return Promise.reject(new ApiError(401, "session_required"));
    return (sessionPromise = createDemoSession().catch((error) => {
      sessionPromise = null;
      throw error;
    }));
  };
  const authenticate = async (
    path: "/v1/accounts" | "/v1/sessions",
    email: string,
    password: string,
  ) => {
    const response = await fetcher(`${origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, client: options.client }),
    });
    const body = (await response
      .json()
      .catch(() => ({}))) as Partial<AuthSession> & {
      error?: string;
    };
    if (!response.ok)
      throw new ApiError(
        response.status,
        body.error ?? "authentication_failed",
      );
    if (typeof body.token !== "string" || typeof body.expiresAt !== "string")
      throw new ApiError(500, "invalid_session");
    sessionPromise = Promise.resolve(body.token);
    options.onTokenChange?.(body.token);
    return body as AuthSession;
  };
  const adoptSession = (body: Partial<AuthSession>) => {
    if (typeof body.token !== "string" || typeof body.expiresAt !== "string")
      throw new ApiError(500, "invalid_session");
    sessionPromise = Promise.resolve(body.token);
    options.onTokenChange?.(body.token);
  };
  const request = async <T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> => {
    const perform = async (retry: boolean): Promise<Response> => {
      const token = await sessionToken();
      const response = await fetcher(`${origin}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          ...init.headers,
        },
      });
      if (response.status === 401 && retry) {
        sessionPromise = null;
        if (options.demoSessions === false) options.onSessionInvalidated?.();
        options.onTokenChange?.(null);
        if (options.demoSessions === false) return response;
        return perform(false);
      }
      return response;
    };
    const response = await perform(true);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        operation?: "decision" | "message" | "report";
      };
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new ApiError(
        response.status,
        body.error ?? "unknown_error",
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
        ["decision", "message", "report"].includes(body.operation ?? "")
          ? (body.operation ?? null)
          : null,
      );
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
    createAccount: (email: string, password: string) =>
      authenticate("/v1/accounts", email, password),
    signIn: (email: string, password: string) =>
      authenticate("/v1/sessions", email, password),
    changePassword: async (currentPassword: string, newPassword: string) => {
      const session = await request<PasswordChangeSession>(
        "/v1/account/password",
        json("PATCH", { currentPassword, newPassword }),
      );
      if (
        typeof session.token !== "string" ||
        typeof session.expiresAt !== "string" ||
        session.otherSessionsRevoked !== true ||
        !isSecurityNotificationStatus(session.securityNotification)
      )
        throw new ApiError(500, "invalid_session");
      sessionPromise = Promise.resolve(session.token);
      options.onTokenChange?.(session.token);
      return session;
    },
    generateRecoveryCodes: async (currentPassword: string) => {
      const result = await request<RecoveryCodeSet>(
        "/v1/account/recovery-codes",
        json("POST", { currentPassword }),
      );
      if (!isSecurityNotificationStatus(result.securityNotification))
        throw new ApiError(500, "invalid_security_notification_status");
      return result;
    },
    recoverAccount: async (
      email: string,
      recoveryCode: string,
      newPassword: string,
    ) => {
      const response = await fetcher(`${origin}/v1/account/recover`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          recoveryCode,
          newPassword,
          client: options.client,
        }),
      });
      const body = (await response
        .json()
        .catch(() => ({}))) as Partial<RecoverySession> & { error?: string };
      if (!response.ok)
        throw new ApiError(response.status, body.error ?? "recovery_failed");
      if (
        body.otherSessionsRevoked !== true ||
        body.recoveryCodesRevoked !== true ||
        !isSecurityNotificationStatus(body.securityNotification)
      )
        throw new ApiError(500, "invalid_session");
      adoptSession(body);
      return body as RecoverySession;
    },
    emailVerification: () =>
      request<EmailVerificationStatus>("/v1/account/email-verification"),
    requestEmailVerification: () =>
      request<{ sent: true }>(
        "/v1/account/email-verification/request",
        json("POST"),
      ),
    confirmEmail: (code: string) =>
      request<{ email: string; verifiedAt: string }>(
        "/v1/account/email-verification/confirm",
        json("POST", { code }),
      ),
    emailChange: () => request<EmailChangeStatus>("/v1/account/email-change"),
    requestEmailChange: (email: string, currentPassword: string) =>
      request<{ sent: true; pendingEmail: string; expiresAt: string }>(
        "/v1/account/email-change/request",
        json("POST", { email, currentPassword }),
      ),
    confirmEmailChange: (currentCode: string, newCode: string) =>
      request<{
        email: string;
        verifiedAt: string;
        otherSessionsRevoked: true;
        securityNotification: SecurityNotificationStatus;
      }>(
        "/v1/account/email-change/confirm",
        json("POST", { currentCode, newCode }),
      ),
    notificationEmail: () =>
      request<NotificationEmailStatus>("/v1/account/notification-email"),
    requestNotificationEmail: (email: string, currentPassword: string) =>
      request<{ sent: true; pendingEmail: string }>(
        "/v1/account/notification-email/request",
        json("POST", { email, currentPassword }),
      ),
    confirmNotificationEmail: (code: string) =>
      request<
        NotificationEmailStatus & {
          securityNotification: SecurityNotificationStatus;
        }
      >("/v1/account/notification-email/confirm", json("POST", { code })),
    removeNotificationEmail: (currentPassword: string) =>
      request<
        NotificationEmailStatus & {
          securityNotification: SecurityNotificationStatus;
        }
      >("/v1/account/notification-email", json("DELETE", { currentPassword })),
    signOut: async () => {
      if (sessionPromise) {
        const token = await sessionPromise;
        await fetcher(`${origin}/v1/session`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        });
      }
      sessionPromise = null;
      options.onTokenChange?.(null);
    },
    sessions: () => request<{ items: AccountSession[] }>("/v1/sessions"),
    revokeSession: (sessionId: string) =>
      request<void>(
        `/v1/sessions/${encodeURIComponent(sessionId)}`,
        json("DELETE"),
      ),
    profile: () => request<Profile>("/v1/me"),
    updateProfile: (patch: Partial<Profile>) =>
      request<Profile>("/v1/me", json("PATCH", patch)),
    exportData: () => request<DataExport>("/v1/me/export"),
    deleteAccountData: () => request<DeletionReceipt>("/v1/me", json("DELETE")),
    deleteAccount: () =>
      request<AccountDeletionReceipt>("/v1/account", json("DELETE")),
    preferences: () => request<Preferences>("/v1/preferences"),
    updatePreferences: (patch: Partial<Preferences>) =>
      request<Preferences>("/v1/preferences", json("PATCH", patch)),
    previewPreferences: (patch: Partial<Preferences>) =>
      request<PreferencePoolPreview>(
        "/v1/preferences/preview",
        json("POST", patch),
      ),
    preferenceSuggestions: () =>
      request<{
        items: WeightSuggestion[];
        observationCount: number;
        minimumObservations: number;
        automaticChanges: false;
      }>("/v1/preferences/suggestions"),
    clearPreferenceObservations: () =>
      request<{ cleared: number; observationCount: 0 }>(
        "/v1/preferences/suggestions",
        json("DELETE"),
      ),
    onboarding: () => request<{ complete: boolean }>("/v1/onboarding"),
    completeSetup: (
      profile: Partial<Profile>,
      preferences: Partial<Preferences>,
      joinDirectory: boolean,
    ) =>
      request<SetupReceipt>(
        "/v1/setup",
        json("POST", {
          version: "setup-0.1",
          profile,
          preferences,
          adultConfirmed: true,
          prototypeDataUseAccepted: true,
          joinDirectory,
        }),
      ),
    accountStatus: () =>
      request<{ status: AccountStatus }>("/v1/account/status"),
    updateAccountStatus: (status: AccountStatus) =>
      request<{ status: AccountStatus }>(
        "/v1/account/status",
        json("PATCH", { status }),
      ),
    deliverySettings: () => request<DeliverySettings>("/v1/delivery"),
    accountDeliveryStatus: () =>
      request<AccountDeliveryStatus>("/v1/account/delivery-status"),
    securityNotificationStatus: () =>
      request<SecurityNotificationDeliveryStatus>(
        "/v1/account/security-notification-status",
      ),
    retrySecurityNotifications: () =>
      request<SecurityNotificationDeliveryStatus>(
        "/v1/account/security-notification-status",
        json("POST"),
      ),
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
    directoryConsent: () =>
      request<{ receipt: DirectoryConsentReceipt | null }>(
        "/v1/consents/directory",
      ),
    updateDirectoryConsent: (participating: boolean) =>
      request<DirectoryConsentReceipt>(
        "/v1/consents/directory",
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
    connections: () =>
      request<{ items: Connection[]; pastItems: Connection[] }>(
        "/v1/connections",
      ),
    messages: (connectionId: string) =>
      request<{ items: Message[] }>(
        `/v1/connections/${encodeURIComponent(connectionId)}/messages`,
      ),
    sendMessage: (
      connectionId: string,
      text: string,
      safetyAcknowledged = false,
      clientRequestId?: string,
    ) =>
      request<Message>(
        `/v1/connections/${encodeURIComponent(connectionId)}/messages`,
        json("POST", { text, safetyAcknowledged, clientRequestId }),
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
    updateConnectionOutcome: (
      connectionId: string,
      kind: ConnectionOutcomeKind,
      recorded: boolean,
    ) =>
      request<{ outcomes: ConnectionOutcome[] }>(
        `/v1/connections/${encodeURIComponent(connectionId)}/outcomes/${encodeURIComponent(kind)}`,
        json("PATCH", { recorded }),
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
    addReportUpdate: (
      reportId: number,
      kind: ReportUpdateKind,
      details: string,
    ) =>
      request<ReportUpdate>(
        `/v1/reports/${encodeURIComponent(reportId)}/updates`,
        json("POST", { kind, details }),
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
