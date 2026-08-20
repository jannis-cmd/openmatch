import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHash, randomBytes } from "node:crypto";
import {
  ALGORITHM_VERSION,
  POLITE_CLOSE_MESSAGE,
  createIntroduction,
  createIntroductions,
  demoCandidates,
  messageSafetyFlags,
  nextWeeklyBatchAt,
  publicWeeklySeed,
  toPublicProfile,
  validatePreferences,
  type BehaviorEvent,
  type Candidate,
  type DatingDataSettings,
  type InteractionFeedback,
} from "@openmatch/matching";
import {
  CONNECTION_OUTCOME_KINDS,
  Store,
  type ConnectionOutcomeKind,
  type ReportUpdateKind,
  type SetupCommand,
} from "./store.js";
import { AccountError, Accounts } from "./accounts.js";
import {
  smtpAccountEmailSenders,
  type EmailVerificationSender,
  type SecurityNotificationEvent,
  type SecurityNotificationSender,
} from "./email-verification.js";

const send = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-methods": "GET,PATCH,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-expose-headers":
      "retry-after,ratelimit-remaining,operation-ratelimit-limit,operation-ratelimit-remaining",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  response.end(status === 204 ? undefined : JSON.stringify(body));
};
const readJson = async (request: IncomingMessage, maximumBytes = 64 * 1024) => {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maximumBytes) throw new RangeError("request body is too large");
    chunks.push(buffer);
  }
  return chunks.length
    ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown)
    : {};
};
const introductionOptions = (store: Store) => ({
  weeklySeed: publicWeeklySeed(),
  explorationSlots: store.deliverySettings().batchSize === 5 ? 1 : 0,
  limit: store.deliverySettings().batchSize,
});
const currentBatchIntroductions = (
  store: Store,
  excluded: Set<string>,
  candidates: Candidate[] = demoCandidates,
  accountDirectory = false,
) => {
  const weeklySeed = publicWeeklySeed();
  const batchSize = store.deliverySettings().batchSize;
  let batch = store.introductionBatch();
  if (
    !batch ||
    batch.algorithmVersion !== ALGORITHM_VERSION ||
    batch.weeklySeed !== weeklySeed ||
    batch.batchSize !== batchSize
  ) {
    const unavailable = new Set([
      ...store.decidedIds(),
      ...store.hiddenIds(),
      ...store.savedIds(),
    ]);
    const items = createIntroductions(
      store.profile(),
      candidates.filter(({ profile }) => !unavailable.has(profile.id)),
      store.preferences(),
      introductionOptions(store),
    );
    batch = {
      algorithmVersion: ALGORITHM_VERSION,
      weeklySeed,
      batchSize,
      entries: items.map(({ profile, explanation }) => ({
        profileId: profile.id,
        selectionMode: explanation.selectionMode,
        selectionProbability: explanation.selectionProbability,
      })),
    };
    store.saveIntroductionBatch(batch);
  }
  return batch.entries.flatMap((entry) => {
    if (excluded.has(entry.profileId)) return [];
    const candidate = candidates.find(
      ({ profile }) => profile.id === entry.profileId,
    );
    if (!candidate) return [];
    const item = createIntroduction(
      store.profile(),
      candidate,
      store.preferences(),
    );
    if (!item.explanation.eligible) return [];
    return [
      {
        ...item,
        profile: accountDirectory
          ? { ...item.profile, distanceBand: "Same approximate region" }
          : item.profile,
        explanation: {
          ...item.explanation,
          selectionMode: entry.selectionMode,
          selectionProbability: entry.selectionProbability,
          weeklySeed: batch.weeklySeed,
        },
      },
    ];
  });
};

const pairConnectionId = (left: string, right: string) =>
  `connection-${createHash("sha256")
    .update([left, right].sort().join(":"))
    .digest("base64url")
    .slice(0, 22)}`;

const messageDeliveryEventId = (accountId: string, clientRequestId: string) =>
  `message-${createHash("sha256")
    .update(`${accountId}:${clientRequestId}`)
    .digest("base64url")}`;

type OperationName = "decision" | "message" | "report";
type RateLimit = { maximum: number; windowMs: number };

const defaultOperationRateLimits: Record<OperationName, RateLimit> = {
  decision: { maximum: 20, windowMs: 60_000 },
  message: { maximum: 30, windowMs: 60_000 },
  report: { maximum: 20, windowMs: 60 * 60_000 },
};

export function createApp(
  options: {
    store?: Store;
    allowedOrigins?: string[];
    rateLimit?: { maximum: number; windowMs: number };
    deployedCommit?: string | null;
    demoSessionsEnabled?: boolean;
    demoSessionTtlMs?: number;
    accounts?: Accounts | false;
    authRateLimit?: { maximum: number; windowMs: number };
    operationRateLimits?: Partial<Record<OperationName, RateLimit>>;
    emailVerificationSender?: EmailVerificationSender | null;
    securityNotificationSender?: SecurityNotificationSender | null;
    securityNotificationRetryIntervalMs?: number;
    accountDeliveryRetryIntervalMs?: number;
  } = {},
) {
  const demoStore = options.store ?? new Store();
  const accounts =
    options.accounts === false
      ? null
      : (options.accounts ??
        (process.env.OPENMATCH_ENABLE_ACCOUNTS === "true"
          ? new Accounts()
          : null));
  const demoSessionsEnabled =
    options.demoSessionsEnabled ??
    process.env.OPENMATCH_ENABLE_DEMO_SESSIONS === "true";
  const configuredEmailSenders =
    options.emailVerificationSender === undefined ||
    options.securityNotificationSender === undefined
      ? smtpAccountEmailSenders()
      : null;
  const emailVerificationSender =
    options.emailVerificationSender === undefined
      ? (configuredEmailSenders?.verification ?? null)
      : options.emailVerificationSender;
  const securityNotificationSender =
    options.securityNotificationSender === undefined
      ? (configuredEmailSenders?.security ?? null)
      : options.securityNotificationSender;
  const securityNotificationRetryIntervalMs =
    options.securityNotificationRetryIntervalMs ?? 30_000;
  if (
    !Number.isInteger(securityNotificationRetryIntervalMs) ||
    securityNotificationRetryIntervalMs < 10
  )
    throw new RangeError(
      "security notification retry interval must be at least 10ms",
    );
  const accountDeliveryRetryIntervalMs =
    options.accountDeliveryRetryIntervalMs ?? 5_000;
  if (
    !Number.isInteger(accountDeliveryRetryIntervalMs) ||
    accountDeliveryRetryIntervalMs < 10
  )
    throw new RangeError(
      "account delivery retry interval must be at least 10ms",
    );
  const demoSessionTtlMs = options.demoSessionTtlMs ?? 12 * 60 * 60 * 1000;
  if (!Number.isInteger(demoSessionTtlMs) || demoSessionTtlMs < 60_000)
    throw new RangeError("demo session lifetime must be at least one minute");
  const demoSessions = new Map<string, number>();
  const sessionHash = (token: string) =>
    createHash("sha256").update(token).digest("base64url");
  const allowedOrigins = new Set(
    options.allowedOrigins ??
      (
        process.env.OPENMATCH_ALLOWED_ORIGINS ??
        "http://localhost:3000,http://127.0.0.1:3000"
      )
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
  );
  const rateLimit = options.rateLimit ?? {
    maximum: Number(process.env.OPENMATCH_RATE_LIMIT_MAX ?? 600),
    windowMs: Number(process.env.OPENMATCH_RATE_LIMIT_WINDOW_MS ?? 60_000),
  };
  const authRateLimit = options.authRateLimit ?? {
    maximum: Number(process.env.OPENMATCH_AUTH_RATE_LIMIT_MAX ?? 10),
    windowMs: Number(
      process.env.OPENMATCH_AUTH_RATE_LIMIT_WINDOW_MS ?? 15 * 60_000,
    ),
  };
  const environmentOperationRateLimits: Record<OperationName, RateLimit> = {
    decision: {
      maximum: Number(
        process.env.OPENMATCH_DECISION_RATE_LIMIT_MAX ??
          defaultOperationRateLimits.decision.maximum,
      ),
      windowMs: Number(
        process.env.OPENMATCH_DECISION_RATE_LIMIT_WINDOW_MS ??
          defaultOperationRateLimits.decision.windowMs,
      ),
    },
    message: {
      maximum: Number(
        process.env.OPENMATCH_MESSAGE_RATE_LIMIT_MAX ??
          defaultOperationRateLimits.message.maximum,
      ),
      windowMs: Number(
        process.env.OPENMATCH_MESSAGE_RATE_LIMIT_WINDOW_MS ??
          defaultOperationRateLimits.message.windowMs,
      ),
    },
    report: {
      maximum: Number(
        process.env.OPENMATCH_REPORT_RATE_LIMIT_MAX ??
          defaultOperationRateLimits.report.maximum,
      ),
      windowMs: Number(
        process.env.OPENMATCH_REPORT_RATE_LIMIT_WINDOW_MS ??
          defaultOperationRateLimits.report.windowMs,
      ),
    },
  };
  const operationRateLimits = {
    ...environmentOperationRateLimits,
    ...options.operationRateLimits,
  };
  const configuredCommit =
    options.deployedCommit === undefined
      ? (process.env.OPENMATCH_COMMIT_SHA ?? null)
      : options.deployedCommit;
  const deployedCommit =
    configuredCommit && /^[0-9a-f]{7,40}$/i.test(configuredCommit)
      ? configuredCommit.toLowerCase()
      : null;
  if (configuredCommit && !deployedCommit)
    throw new RangeError(
      "OPENMATCH_COMMIT_SHA must be a 7–40 character hex hash",
    );
  if (
    !Number.isInteger(rateLimit.maximum) ||
    rateLimit.maximum < 1 ||
    !Number.isInteger(rateLimit.windowMs) ||
    rateLimit.windowMs < 1000
  )
    throw new RangeError("invalid rate limit configuration");
  if (
    !Number.isInteger(authRateLimit.maximum) ||
    authRateLimit.maximum < 1 ||
    !Number.isInteger(authRateLimit.windowMs) ||
    authRateLimit.windowMs < 1000
  )
    throw new RangeError("invalid authentication rate limit configuration");
  for (const limit of Object.values(operationRateLimits))
    if (
      !Number.isInteger(limit.maximum) ||
      limit.maximum < 1 ||
      !Number.isInteger(limit.windowMs) ||
      limit.windowMs < 1000
    )
      throw new RangeError("invalid operation rate limit configuration");
  const requestWindows = new Map<
    string,
    { startedAt: number; count: number }
  >();
  const authenticationWindows = new Map<
    string,
    { startedAt: number; count: number }
  >();
  const operationWindows = new Map<
    string,
    { startedAt: number; count: number }
  >();
  const consumeAuthenticationAttempt = (
    key: string,
    now: number,
    response: ServerResponse,
  ) => {
    const previous = authenticationWindows.get(key);
    const window =
      !previous || now - previous.startedAt >= authRateLimit.windowMs
        ? { startedAt: now, count: 0 }
        : previous;
    window.count += 1;
    authenticationWindows.set(key, window);
    response.setHeader(
      "authentication-ratelimit-remaining",
      String(Math.max(0, authRateLimit.maximum - window.count)),
    );
    if (window.count <= authRateLimit.maximum) return true;
    response.setHeader(
      "retry-after",
      String(
        Math.max(
          1,
          Math.ceil((authRateLimit.windowMs - (now - window.startedAt)) / 1000),
        ),
      ),
    );
    return false;
  };
  const deliverEmailVerification = async (accountId: string) => {
    if (!accounts || !emailVerificationSender) return "not_configured" as const;
    const verification = accounts.createEmailVerification(accountId);
    try {
      await emailVerificationSender(verification);
      return "sent" as const;
    } catch {
      accounts.cancelEmailVerification(accountId);
      return "failed" as const;
    }
  };
  const retrySecurityNotifications = async (
    accountId: string,
    currentJobId?: string,
    force = false,
  ) => {
    if (!accounts || !securityNotificationSender) return null;
    let currentSent = 0;
    let currentRecipients = 0;
    for (const job of accounts.claimSecurityNotificationJobs(
      accountId,
      force,
    )) {
      const pending = job.recipients.filter(
        (email) => !job.delivered.has(email),
      );
      const results = await Promise.allSettled(
        pending.map((email) =>
          securityNotificationSender({
            email,
            event: job.event,
            occurredAt: job.occurredAt,
          }),
        ),
      );
      const delivered = pending.filter(
        (_email, index) => results[index]?.status === "fulfilled",
      );
      accounts.recordSecurityNotificationAttempt(accountId, job.id, delivered);
      if (job.id === currentJobId) {
        currentSent = delivered.length;
        currentRecipients = pending.length;
      }
    }
    return { currentSent, currentRecipients };
  };
  const deliverSecurityNotification = async (
    accountId: string,
    event: SecurityNotificationEvent,
    occurredAt: string,
  ) => {
    if (!accounts || !securityNotificationSender)
      return "not_configured" as const;
    const jobId = accounts.enqueueSecurityNotification(
      accountId,
      event,
      occurredAt,
    );
    if (!jobId) return "unverified" as const;
    const result = await retrySecurityNotifications(accountId, jobId, true);
    const currentSent = result?.currentSent ?? 0;
    const currentRecipients = result?.currentRecipients ?? 0;
    if (currentSent === currentRecipients) return "sent" as const;
    return currentSent ? ("partial" as const) : ("failed" as const);
  };
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin))
      return send(response, 403, { error: "origin_not_allowed" });
    if (origin) {
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader("vary", "origin");
    }
    if (request.method === "OPTIONS") return send(response, 204, null);
    const url = new URL(request.url ?? "/", "http://localhost");
    try {
      if (request.method === "GET" && url.pathname === "/health")
        return send(response, 200, {
          status:
            accounts &&
            (accounts.pendingDeliveryCount() ||
              accounts.pendingSecurityNotificationCount())
              ? "degraded"
              : "ok",
          service: "openmatch-api",
          delivery: accounts
            ? {
                accountActions: accounts.pendingDeliveryCount()
                  ? "retrying"
                  : "clear",
                securityNotifications:
                  accounts.pendingSecurityNotificationCount()
                    ? "retrying"
                    : "clear",
              }
            : { accountActions: "disabled", securityNotifications: "disabled" },
        });
      const now = Date.now();
      const key = request.socket.remoteAddress ?? "unknown";
      const previous = requestWindows.get(key);
      const window =
        !previous || now - previous.startedAt >= rateLimit.windowMs
          ? { startedAt: now, count: 0 }
          : previous;
      window.count += 1;
      requestWindows.set(key, window);
      response.setHeader(
        "ratelimit-remaining",
        String(Math.max(0, rateLimit.maximum - window.count)),
      );
      if (window.count > rateLimit.maximum) {
        response.setHeader(
          "retry-after",
          String(
            Math.max(
              1,
              Math.ceil((rateLimit.windowMs - (now - window.startedAt)) / 1000),
            ),
          ),
        );
        return send(response, 429, { error: "rate_limit_exceeded" });
      }
      if (request.method === "POST" && url.pathname === "/v1/demo/session") {
        if (!demoSessionsEnabled)
          return send(response, 404, { error: "demo_sessions_disabled" });
        for (const [hash, expiry] of demoSessions)
          if (expiry <= now) demoSessions.delete(hash);
        const token = randomBytes(32).toString("base64url");
        const expiresAt = now + demoSessionTtlMs;
        demoSessions.set(sessionHash(token), expiresAt);
        return send(response, 201, {
          token,
          expiresAt: new Date(expiresAt).toISOString(),
          authentication: false,
        });
      }
      if (
        request.method === "POST" &&
        ["/v1/accounts", "/v1/sessions"].includes(url.pathname)
      ) {
        if (!accounts)
          return send(response, 404, { error: "accounts_disabled" });
        if (!consumeAuthenticationAttempt(key, now, response))
          return send(response, 429, {
            error: "authentication_rate_limit_exceeded",
          });
        const body = (await readJson(request)) as {
          email?: unknown;
          password?: unknown;
          client?: unknown;
        };
        try {
          const creating = url.pathname === "/v1/accounts";
          const session = creating
            ? accounts.register(body.email, body.password, body.client)
            : accounts.signIn(body.email, body.password, body.client);
          const email = accounts.emailStatus(session.accountId);
          const delivery = creating
            ? await deliverEmailVerification(session.accountId)
            : undefined;
          return send(response, url.pathname === "/v1/accounts" ? 201 : 200, {
            token: session.token,
            expiresAt: session.expiresAt,
            authentication: true,
            emailVerification: {
              ...email,
              deliveryConfigured: Boolean(emailVerificationSender),
              ...(delivery ? { delivery } : {}),
            },
          });
        } catch (error) {
          if (error instanceof AccountError)
            return send(response, error.status, { error: error.code });
          throw error;
        }
      }
      if (request.method === "POST" && url.pathname === "/v1/admin/sessions") {
        if (!accounts)
          return send(response, 404, { error: "accounts_disabled" });
        if (!consumeAuthenticationAttempt(`admin:${key}`, now, response))
          return send(response, 429, {
            error: "authentication_rate_limit_exceeded",
          });
        const body = (await readJson(request)) as {
          email?: unknown;
          password?: unknown;
        };
        try {
          const session = accounts.signInAdmin(body.email, body.password);
          return send(response, 200, {
            token: session.token,
            email: session.email,
            expiresAt: session.expiresAt,
            authentication: true,
          });
        } catch (error) {
          if (error instanceof AccountError)
            return send(response, error.status, { error: error.code });
          throw error;
        }
      }
      if (request.method === "POST" && url.pathname === "/v1/account/recover") {
        if (!accounts)
          return send(response, 404, { error: "accounts_disabled" });
        if (!consumeAuthenticationAttempt(key, now, response))
          return send(response, 429, {
            error: "authentication_rate_limit_exceeded",
          });
        const body = (await readJson(request)) as {
          email?: unknown;
          recoveryCode?: unknown;
          newPassword?: unknown;
          client?: unknown;
        };
        try {
          const session = accounts.recoverAccount(
            body.email,
            body.recoveryCode,
            body.newPassword,
            body.client,
          );
          const notification = await deliverSecurityNotification(
            session.accountId,
            "account_recovered",
            new Date().toISOString(),
          );
          return send(response, 200, {
            token: session.token,
            expiresAt: session.expiresAt,
            authentication: true,
            otherSessionsRevoked: true,
            recoveryCodesRevoked: true,
            securityNotification: notification,
          });
        } catch (error) {
          if (error instanceof AccountError)
            return send(response, error.status, { error: error.code });
          throw error;
        }
      }
      if (
        request.method === "GET" &&
        url.pathname === "/v1/transparency/version"
      )
        return send(response, 200, {
          matching: ALGORITHM_VERSION,
          hiddenFactors: false,
          privatePersonalInputsMayBeRedacted: true,
          status: "prototype",
          objective: "useful introductions, not engagement",
          deployedCommit,
          buildStatus: deployedCommit ? "pinned" : "development-unpinned",
        });
      const authorization = request.headers.authorization;
      const token = authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;
      const tokenHash = token ? sessionHash(token) : null;
      const expiresAt = tokenHash ? demoSessions.get(tokenHash) : undefined;
      const accountSession =
        token && accounts ? accounts.authenticate(token) : undefined;
      const adminSession =
        token && accounts ? accounts.authenticateAdmin(token) : undefined;
      const demoSessionValid = Boolean(expiresAt && expiresAt > now);
      if (url.pathname.startsWith("/v1/admin/")) {
        if (!token)
          return send(response, 401, { error: "admin_session_required" });
        if (!adminSession)
          return send(response, accountSession ? 403 : 401, {
            error: accountSession
              ? "admin_forbidden"
              : "admin_session_required",
          });
        const adminAccounts = accounts;
        if (!adminAccounts)
          return send(response, 404, { error: "accounts_disabled" });
        if (request.method === "GET" && url.pathname === "/v1/admin/overview")
          return send(response, 200, {
            admin: {
              email: adminSession.email,
              expiresAt: adminSession.expiresAt,
            },
            service: {
              status:
                adminAccounts.pendingDeliveryCount() ||
                adminAccounts.pendingSecurityNotificationCount()
                  ? "degraded"
                  : "ok",
              algorithmVersion: ALGORITHM_VERSION,
              deployedCommit,
            },
            ...adminAccounts.adminOverview(adminSession.adminId),
            fixtures: { fictionalProfiles: demoCandidates.length },
            privacy: {
              messageContentExposed: false,
              profileDataExposed: false,
              preferenceDataExposed: false,
              preciseLocationExposed: false,
            },
            generatedAt: new Date().toISOString(),
          });
        if (request.method === "GET" && url.pathname === "/v1/admin/audit")
          return send(response, 200, {
            items: adminAccounts.adminAuditEvents(adminSession.adminId),
          });
        if (
          request.method === "DELETE" &&
          url.pathname === "/v1/admin/session"
        ) {
          adminAccounts.revokeAdmin(token);
          return send(response, 204, null);
        }
        return send(response, 404, { error: "not_found" });
      }
      if (!token || (!accountSession && !demoSessionValid)) {
        if (tokenHash && expiresAt) demoSessions.delete(tokenHash);
        return send(response, 401, { error: "session_required" });
      }
      const store = accountSession?.store ?? demoStore;
      const operationClientKey =
        accountSession?.accountId ?? tokenHash ?? "missing-session";
      if (
        request.method === "GET" &&
        url.pathname === "/v1/account/delivery-status"
      ) {
        if (accountSession && accounts)
          try {
            accounts.flushDeliveryEvents(true);
          } catch {
            // Status remains readable after a failed retry. Any newer
            // cross-account mutation still enters the ordered journal and
            // fails explicitly until the oldest event can be delivered.
          }
        return send(
          response,
          200,
          accountSession && accounts
            ? accounts.deliveryStatus(accountSession.accountId)
            : {
                state: "clear",
                pendingCount: 0,
                oldestCreatedAt: null,
                retryAttempts: 0,
                lastAttemptAt: null,
                automaticDiscard: false,
              },
        );
      }
      if (
        ["GET", "POST"].includes(request.method ?? "") &&
        url.pathname === "/v1/account/security-notification-status"
      ) {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        if (request.method === "POST")
          await retrySecurityNotifications(
            accountSession.accountId,
            undefined,
            true,
          );
        return send(
          response,
          200,
          accounts.securityNotificationStatus(accountSession.accountId),
        );
      }
      const consumeOperation = (
        operation: OperationName,
        operationResponse: ServerResponse,
      ) => {
        const limit = operationRateLimits[operation];
        const operationKey = `${operation}:${operationClientKey}`;
        const previousOperation = operationWindows.get(operationKey);
        const operationWindow =
          !previousOperation ||
          now - previousOperation.startedAt >= limit.windowMs
            ? { startedAt: now, count: 0 }
            : previousOperation;
        operationWindow.count += 1;
        operationWindows.set(operationKey, operationWindow);
        operationResponse.setHeader(
          "operation-ratelimit-limit",
          String(limit.maximum),
        );
        operationResponse.setHeader(
          "operation-ratelimit-remaining",
          String(Math.max(0, limit.maximum - operationWindow.count)),
        );
        if (operationWindow.count <= limit.maximum) return true;
        operationResponse.setHeader(
          "retry-after",
          String(
            Math.max(
              1,
              Math.ceil(
                (limit.windowMs - (now - operationWindow.startedAt)) / 1000,
              ),
            ),
          ),
        );
        return false;
      };
      const accountDirectory = Boolean(accountSession && accounts);
      const candidates =
        accountSession && accounts
          ? emailVerificationSender &&
            !accounts.emailStatus(accountSession.accountId).verifiedAt
            ? []
            : accounts
                .candidatesFor(accountSession.accountId)
                .filter(
                  ({ profile }) =>
                    !emailVerificationSender ||
                    Boolean(accounts.emailStatus(profile.id).verifiedAt),
                )
          : demoCandidates;
      const knownProfile = (id: string) =>
        accountSession && accounts
          ? accounts.hasAccount(id) && id !== accountSession.accountId
          : demoCandidates.some((candidate) => candidate.profile.id === id);
      const publicCandidateProfile = (id: string) => {
        if (accountSession && accounts) return accounts.publicProfile(id);
        const profile = demoCandidates.find(
          (candidate) => candidate.profile.id === id,
        )?.profile;
        return profile ? toPublicProfile(profile) : undefined;
      };
      if (request.method === "DELETE" && url.pathname === "/v1/session") {
        if (accountSession && accounts) accounts.revoke(token);
        else if (tokenHash) demoSessions.delete(tokenHash);
        return send(response, 204, null);
      }
      if (request.method === "GET" && url.pathname === "/v1/sessions") {
        if (!accountSession || !accounts)
          return send(response, 200, { items: [] });
        return send(response, 200, {
          items: accounts.sessions(
            accountSession.accountId,
            accountSession.sessionId,
          ),
        });
      }
      if (
        request.method === "GET" &&
        url.pathname === "/v1/account/email-verification"
      ) {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        return send(response, 200, {
          ...accounts.emailStatus(accountSession.accountId),
          deliveryConfigured: Boolean(emailVerificationSender),
        });
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/account/email-verification/request"
      ) {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        if (!emailVerificationSender)
          return send(response, 503, {
            error: "email_delivery_not_configured",
          });
        if (!consumeAuthenticationAttempt(key, now, response))
          return send(response, 429, {
            error: "authentication_rate_limit_exceeded",
          });
        try {
          const delivery = await deliverEmailVerification(
            accountSession.accountId,
          );
          return delivery === "sent"
            ? send(response, 202, { sent: true })
            : send(response, 503, { error: "email_delivery_failed" });
        } catch (error) {
          if (error instanceof AccountError)
            return send(response, error.status, { error: error.code });
          throw error;
        }
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/account/email-verification/confirm"
      ) {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        if (!consumeAuthenticationAttempt(key, now, response))
          return send(response, 429, {
            error: "authentication_rate_limit_exceeded",
          });
        const body = (await readJson(request)) as { code?: unknown };
        try {
          return send(
            response,
            200,
            accounts.confirmEmail(accountSession.accountId, body.code),
          );
        } catch (error) {
          if (error instanceof AccountError)
            return send(response, error.status, { error: error.code });
          throw error;
        }
      }
      if (
        request.method === "GET" &&
        url.pathname === "/v1/account/email-change"
      ) {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        return send(response, 200, {
          ...accounts.emailChangeStatus(accountSession.accountId),
          deliveryConfigured: Boolean(emailVerificationSender),
        });
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/account/email-change/request"
      ) {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        if (!emailVerificationSender)
          return send(response, 503, {
            error: "email_delivery_not_configured",
          });
        if (!consumeAuthenticationAttempt(key, now, response))
          return send(response, 429, {
            error: "authentication_rate_limit_exceeded",
          });
        const body = (await readJson(request)) as {
          email?: unknown;
          currentPassword?: unknown;
        };
        try {
          const verification = accounts.createEmailChange(
            accountSession.accountId,
            body.currentPassword,
            body.email,
          );
          const deliveries = await Promise.allSettled([
            emailVerificationSender(verification.current),
            emailVerificationSender(verification.proposed),
          ]);
          if (deliveries.some(({ status }) => status === "rejected")) {
            accounts.cancelEmailChange(accountSession.accountId);
            return send(response, 503, { error: "email_delivery_failed" });
          }
          return send(response, 202, {
            sent: true,
            pendingEmail: verification.proposed.email,
            expiresAt: verification.proposed.expiresAt,
          });
        } catch (error) {
          if (error instanceof AccountError)
            return send(response, error.status, { error: error.code });
          throw error;
        }
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/account/email-change/confirm"
      ) {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        if (!consumeAuthenticationAttempt(key, now, response))
          return send(response, 429, {
            error: "authentication_rate_limit_exceeded",
          });
        const body = (await readJson(request)) as {
          currentCode?: unknown;
          newCode?: unknown;
        };
        try {
          const changed = accounts.confirmEmailChange(
            accountSession.accountId,
            accountSession.sessionId,
            body.currentCode,
            body.newCode,
          );
          let securityNotification:
            "sent" | "partial" | "failed" | "not_configured" | "unverified" =
            changed.notificationId ? "failed" : "unverified";
          if (!securityNotificationSender)
            securityNotification = "not_configured";
          else if (changed.notificationId) {
            const delivery = await retrySecurityNotifications(
              accountSession.accountId,
              changed.notificationId,
              true,
            );
            const sent = delivery?.currentSent ?? 0;
            const recipients = delivery?.currentRecipients ?? 0;
            securityNotification =
              sent === recipients ? "sent" : sent ? "partial" : "failed";
          }
          return send(response, 200, {
            email: changed.email,
            verifiedAt: changed.verifiedAt,
            otherSessionsRevoked: changed.otherSessionsRevoked,
            securityNotification,
          });
        } catch (error) {
          if (error instanceof AccountError)
            return send(response, error.status, { error: error.code });
          throw error;
        }
      }
      if (
        request.method === "DELETE" &&
        url.pathname === "/v1/account/email-change"
      ) {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        return accounts.cancelEmailChange(accountSession.accountId)
          ? send(response, 204, null)
          : send(response, 404, { error: "email_change_not_found" });
      }
      if (
        request.method === "GET" &&
        url.pathname === "/v1/account/notification-email"
      ) {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        return send(
          response,
          200,
          accounts.notificationAddressStatus(accountSession.accountId),
        );
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/account/notification-email/request"
      ) {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        if (!emailVerificationSender)
          return send(response, 503, {
            error: "email_delivery_not_configured",
          });
        if (!consumeAuthenticationAttempt(key, now, response))
          return send(response, 429, {
            error: "authentication_rate_limit_exceeded",
          });
        const body = (await readJson(request)) as {
          email?: unknown;
          currentPassword?: unknown;
        };
        try {
          const verification = accounts.createNotificationAddressVerification(
            accountSession.accountId,
            body.currentPassword,
            body.email,
          );
          try {
            await emailVerificationSender(verification);
          } catch {
            accounts.cancelNotificationAddressVerification(
              accountSession.accountId,
            );
            return send(response, 503, { error: "email_delivery_failed" });
          }
          return send(response, 202, {
            sent: true,
            pendingEmail: verification.email,
          });
        } catch (error) {
          if (error instanceof AccountError)
            return send(response, error.status, { error: error.code });
          throw error;
        }
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/account/notification-email/confirm"
      ) {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        if (!consumeAuthenticationAttempt(key, now, response))
          return send(response, 429, {
            error: "authentication_rate_limit_exceeded",
          });
        const body = (await readJson(request)) as { code?: unknown };
        try {
          const confirmed = accounts.confirmNotificationAddress(
            accountSession.accountId,
            body.code,
          );
          const securityNotification = await deliverSecurityNotification(
            accountSession.accountId,
            "notification_address_added",
            confirmed.verifiedAt,
          );
          return send(response, 200, {
            ...accounts.notificationAddressStatus(accountSession.accountId),
            securityNotification,
          });
        } catch (error) {
          if (error instanceof AccountError)
            return send(response, error.status, { error: error.code });
          throw error;
        }
      }
      if (
        request.method === "DELETE" &&
        url.pathname === "/v1/account/notification-email"
      ) {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        if (!consumeAuthenticationAttempt(key, now, response))
          return send(response, 429, {
            error: "authentication_rate_limit_exceeded",
          });
        const body = (await readJson(request)) as {
          currentPassword?: unknown;
        };
        try {
          accounts.removeNotificationAddress(
            accountSession.accountId,
            body.currentPassword,
          );
          const securityNotification = await deliverSecurityNotification(
            accountSession.accountId,
            "notification_address_removed",
            new Date().toISOString(),
          );
          return send(response, 200, {
            ...accounts.notificationAddressStatus(accountSession.accountId),
            securityNotification,
          });
        } catch (error) {
          if (error instanceof AccountError)
            return send(response, error.status, { error: error.code });
          throw error;
        }
      }
      const managedSession = url.pathname.match(/^\/v1\/sessions\/([^/]+)$/);
      if (request.method === "DELETE" && managedSession) {
        if (!accountSession || !accounts)
          return send(response, 404, { error: "session_not_found" });
        if (managedSession[1] === accountSession.sessionId)
          return send(response, 409, {
            error: "use_sign_out_for_current_session",
          });
        return accounts.revokeSession(
          accountSession.accountId,
          managedSession[1],
        )
          ? send(response, 204, null)
          : send(response, 404, { error: "session_not_found" });
      }
      if (request.method === "DELETE" && url.pathname === "/v1/account") {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        if (!consumeAuthenticationAttempt(key, now, response))
          return send(response, 429, {
            error: "authentication_rate_limit_exceeded",
          });
        const body = (await readJson(request)) as {
          currentPassword?: unknown;
        };
        try {
          accounts.deleteAccount(
            accountSession.accountId,
            body.currentPassword,
          );
          return send(response, 200, {
            deleted: true,
            completedAt: new Date().toISOString(),
            credentialsDeleted: true,
            sessionsRevoked: true,
            applicationBackups: "none",
          });
        } catch (error) {
          if (error instanceof AccountError)
            return send(response, error.status, { error: error.code });
          throw error;
        }
      }
      if (
        request.method === "PATCH" &&
        url.pathname === "/v1/account/password"
      ) {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        if (!consumeAuthenticationAttempt(key, now, response))
          return send(response, 429, {
            error: "authentication_rate_limit_exceeded",
          });
        const body = (await readJson(request)) as {
          currentPassword?: unknown;
          newPassword?: unknown;
        };
        try {
          const session = accounts.changePassword(
            accountSession.accountId,
            accountSession.sessionId,
            body.currentPassword,
            body.newPassword,
          );
          const notification = await deliverSecurityNotification(
            accountSession.accountId,
            "password_changed",
            new Date().toISOString(),
          );
          return send(response, 200, {
            token: session.token,
            expiresAt: session.expiresAt,
            authentication: true,
            otherSessionsRevoked: true,
            securityNotification: notification,
          });
        } catch (error) {
          if (error instanceof AccountError)
            return send(response, error.status, { error: error.code });
          throw error;
        }
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/account/recovery-codes"
      ) {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        if (!consumeAuthenticationAttempt(key, now, response))
          return send(response, 429, {
            error: "authentication_rate_limit_exceeded",
          });
        const body = (await readJson(request)) as {
          currentPassword?: unknown;
        };
        try {
          const result = accounts.generateRecoveryCodes(
            accountSession.accountId,
            body.currentPassword,
          );
          const notification = await deliverSecurityNotification(
            accountSession.accountId,
            "recovery_codes_replaced",
            result.createdAt,
          );
          return send(response, 201, {
            ...result,
            securityNotification: notification,
          });
        } catch (error) {
          if (error instanceof AccountError)
            return send(response, error.status, { error: error.code });
          throw error;
        }
      }
      if (request.method === "GET" && url.pathname === "/v1/me")
        return send(response, 200, store.profile());
      if (request.method === "GET" && url.pathname === "/v1/me/export")
        return send(response, 200, store.exportData());
      if (request.method === "DELETE" && url.pathname === "/v1/me") {
        store.reset();
        return send(response, 200, {
          deleted: true,
          completedAt: new Date().toISOString(),
          mode: "synchronous-local-prototype",
          applicationBackups: "none",
        });
      }
      if (request.method === "PATCH" && url.pathname === "/v1/me")
        return send(
          response,
          200,
          store.updateProfile(
            (await readJson(request, 700 * 1024)) as Parameters<
              Store["updateProfile"]
            >[0],
          ),
        );
      if (request.method === "GET" && url.pathname === "/v1/preferences")
        return send(response, 200, store.preferences());
      if (request.method === "GET" && url.pathname === "/v1/data-model")
        return send(response, 200, store.dataModelDescription());
      if (request.method === "PATCH" && url.pathname === "/v1/data-model")
        return send(
          response,
          200,
          store.replaceDatingDataSettings(
            (await readJson(request, 256 * 1024)) as DatingDataSettings,
          ),
        );
      if (
        request.method === "POST" &&
        url.pathname === "/v1/data-model/behavior-events"
      )
        return send(
          response,
          201,
          store.recordBehaviorEvent((await readJson(request)) as BehaviorEvent),
        );
      if (
        request.method === "POST" &&
        url.pathname === "/v1/data-model/interaction-feedback"
      )
        return send(
          response,
          201,
          store.recordInteractionFeedback(
            (await readJson(request)) as InteractionFeedback,
          ),
        );
      if (
        request.method === "POST" &&
        url.pathname === "/v1/preferences/preview"
      ) {
        const patch = (await readJson(request)) as Parameters<
          Store["updatePreferences"]
        >[0];
        const current = store.preferences();
        const preferences = validatePreferences({
          ...current,
          ...patch,
          weights: { ...current.weights, ...patch.weights },
        });
        const unavailable = new Set([
          ...store.decidedIds(),
          ...store.hiddenIds(),
          ...store.savedIds(),
        ]);
        const unresolved = candidates.filter(
          ({ profile }) => !unavailable.has(profile.id),
        );
        return send(response, 200, {
          eligibleCount: createIntroductions(
            store.profile(),
            unresolved,
            preferences,
          ).length,
          evaluatedCount: unresolved.length,
          scope: "current-unresolved-prototype-pool",
          estimate: false,
          preferencesSaved: false,
        });
      }
      if (
        request.method === "GET" &&
        url.pathname === "/v1/preferences/suggestions"
      )
        return send(response, 200, {
          items: store.preferenceSuggestions(),
          observationCount: store.preferenceObservationCount(),
          minimumObservations: 20,
          automaticChanges: false,
        });
      if (
        request.method === "DELETE" &&
        url.pathname === "/v1/preferences/suggestions"
      )
        return send(response, 200, store.clearPreferenceObservations());
      if (request.method === "PATCH" && url.pathname === "/v1/preferences")
        return send(
          response,
          200,
          store.updatePreferences(
            (await readJson(request)) as Parameters<
              Store["updatePreferences"]
            >[0],
          ),
        );
      if (request.method === "GET" && url.pathname === "/v1/onboarding")
        return send(response, 200, { complete: store.onboardingComplete() });
      if (request.method === "POST" && url.pathname === "/v1/setup") {
        const body = (await readJson(request, 700 * 1024)) as SetupCommand;
        if (
          body.joinDirectory === true &&
          accountSession &&
          accounts &&
          emailVerificationSender &&
          !accounts.emailStatus(accountSession.accountId).verifiedAt
        )
          return send(response, 409, { error: "email_verification_required" });
        return send(response, 200, store.completeSetup(body));
      }
      if (request.method === "GET" && url.pathname === "/v1/account/status")
        return send(response, 200, { status: store.accountStatus() });
      if (request.method === "GET" && url.pathname === "/v1/delivery")
        return send(response, 200, store.deliverySettings());
      if (request.method === "PATCH" && url.pathname === "/v1/delivery") {
        const body = (await readJson(request)) as { batchSize?: unknown };
        if (
          !Number.isInteger(body.batchSize) ||
          Number(body.batchSize) < 1 ||
          Number(body.batchSize) > 5
        )
          return send(response, 400, { error: "invalid_batch_size" });
        return send(
          response,
          200,
          store.updateDeliverySettings({
            batchSize: body.batchSize as 1 | 2 | 3 | 4 | 5,
          }),
        );
      }
      if (request.method === "PATCH" && url.pathname === "/v1/account/status") {
        const body = (await readJson(request)) as { status?: unknown };
        if (
          typeof body.status !== "string" ||
          !["active", "paused", "hidden"].includes(body.status)
        )
          return send(response, 400, { error: "invalid_account_status" });
        return send(
          response,
          200,
          store.updateAccountStatus(
            body.status as "active" | "paused" | "hidden",
          ),
        );
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/onboarding/complete"
      )
        return store.consentReceipt()
          ? send(response, 200, store.completeOnboarding())
          : send(response, 400, { error: "prototype_consent_required" });
      if (request.method === "GET" && url.pathname === "/v1/consents")
        return send(response, 200, { receipt: store.consentReceipt() });
      if (request.method === "GET" && url.pathname === "/v1/consents/research")
        return send(response, 200, {
          receipt: store.researchConsentReceipt(),
        });
      if (request.method === "GET" && url.pathname === "/v1/consents/directory")
        return send(response, 200, {
          receipt: store.directoryConsentReceipt(),
        });
      if (
        request.method === "PATCH" &&
        url.pathname === "/v1/consents/research"
      ) {
        const body = (await readJson(request)) as { participating?: unknown };
        if (typeof body.participating !== "boolean")
          return send(response, 400, { error: "invalid_research_consent" });
        return send(
          response,
          200,
          store.updateResearchConsent(body.participating),
        );
      }
      if (
        request.method === "PATCH" &&
        url.pathname === "/v1/consents/directory"
      ) {
        const body = (await readJson(request)) as { participating?: unknown };
        if (typeof body.participating !== "boolean")
          return send(response, 400, { error: "invalid_directory_consent" });
        if (body.participating && !store.discoveryConfigured())
          return send(response, 409, {
            error: "gender_discovery_configuration_required",
          });
        if (
          body.participating &&
          accountSession &&
          accounts &&
          emailVerificationSender &&
          !accounts.emailStatus(accountSession.accountId).verifiedAt
        )
          return send(response, 409, { error: "email_verification_required" });
        return send(
          response,
          200,
          store.updateDirectoryConsent(body.participating),
        );
      }
      if (request.method === "PATCH" && url.pathname === "/v1/consents") {
        const body = (await readJson(request)) as {
          adultConfirmed?: unknown;
          prototypeDataUseAccepted?: unknown;
        };
        if (
          body.adultConfirmed !== true ||
          body.prototypeDataUseAccepted !== true
        )
          return send(response, 400, { error: "invalid_prototype_consent" });
        return send(response, 200, store.acceptPrototypeConsent());
      }
      if (request.method === "GET" && url.pathname === "/v1/introductions") {
        if (store.accountStatus() !== "active")
          return send(response, 200, {
            items: [],
            finite: true,
            remaining: 0,
            weeklySeed: publicWeeklySeed(),
            nextBatchAt: nextWeeklyBatchAt(),
            explorationSlots: 0,
          });
        const hidden = new Set([
          ...store.decidedIds(),
          ...store.hiddenIds(),
          ...store.savedIds(),
        ]);
        const items = currentBatchIntroductions(
          store,
          hidden,
          candidates,
          accountDirectory,
        );
        return send(response, 200, {
          items,
          finite: true,
          remaining: items.length,
          weeklySeed: publicWeeklySeed(),
          nextBatchAt: nextWeeklyBatchAt(),
          explorationSlots: items.filter(
            ({ explanation }) => explanation.selectionMode === "exploration",
          ).length,
        });
      }
      if (
        request.method === "GET" &&
        url.pathname === "/v1/introductions/saved"
      ) {
        if (store.accountStatus() !== "active")
          return send(response, 200, { items: [] });
        const saved = store.savedIds();
        const unavailable = new Set([
          ...store.decidedIds(),
          ...store.hiddenIds(),
        ]);
        return send(response, 200, {
          items: createIntroductions(
            store.profile(),
            candidates,
            store.preferences(),
          )
            .filter(
              (item) =>
                saved.has(item.profile.id) && !unavailable.has(item.profile.id),
            )
            .map((item) =>
              accountDirectory
                ? {
                    ...item,
                    profile: {
                      ...item.profile,
                      distanceBand: "Same approximate region",
                    },
                  }
                : item,
            ),
        });
      }
      const savedIntroduction = url.pathname.match(
        /^\/v1\/introductions\/([^/]+)\/saved$/,
      );
      if (request.method === "POST" && savedIntroduction) {
        const profileId = savedIntroduction[1];
        if (!knownProfile(profileId))
          return send(response, 404, { error: "profile_not_found" });
        if (
          store.decidedIds().has(profileId) ||
          store.hiddenIds().has(profileId)
        )
          return send(response, 409, { error: "profile_not_available" });
        const eligible = createIntroductions(
          store.profile(),
          candidates,
          store.preferences(),
        ).some((item) => item.profile.id === profileId);
        if (!eligible)
          return send(response, 409, { error: "profile_not_eligible" });
        return send(response, 201, store.saveIntroduction(profileId));
      }
      if (request.method === "DELETE" && savedIntroduction)
        return send(
          response,
          store.unsaveIntroduction(savedIntroduction[1]) ? 204 : 404,
          null,
        );
      const decision = url.pathname.match(
        /^\/v1\/introductions\/([^/]+)\/decision$/,
      );
      if (request.method === "POST" && decision) {
        if (!consumeOperation("decision", response))
          return send(response, 429, {
            error: "operation_rate_limit_exceeded",
            operation: "decision",
          });
        if (
          accountSession &&
          accounts &&
          emailVerificationSender &&
          !accounts.emailStatus(accountSession.accountId).verifiedAt
        )
          return send(response, 409, { error: "email_verification_required" });
        if (!knownProfile(decision[1]))
          return send(response, 404, { error: "profile_not_found" });
        const unavailable = new Set([
          ...store.decidedIds(),
          ...store.hiddenIds(),
        ]);
        const introduction =
          currentBatchIntroductions(
            store,
            unavailable,
            candidates,
            accountDirectory,
          ).find((item) => item.profile.id === decision[1]) ??
          (store.savedIds().has(decision[1])
            ? createIntroductions(
                store.profile(),
                candidates.filter(({ profile }) => profile.id === decision[1]),
                store.preferences(),
              )[0]
            : undefined);
        if (!introduction)
          return send(response, 409, { error: "profile_not_eligible" });
        const body = (await readJson(request)) as { decision?: string };
        if (body.decision !== "interested" && body.decision !== "passed")
          return send(response, 400, { error: "invalid_decision" });
        const peerStore =
          accountSession && accounts
            ? accounts.accountStore(decision[1])
            : undefined;
        const mutual = accountSession
          ? body.decision === "interested" &&
            peerStore?.decisionFor(accountSession.accountId) === "interested"
          : body.decision === "interested" &&
            ["mara", "noah"].includes(decision[1]);
        const connectionId =
          accountSession && mutual
            ? pairConnectionId(accountSession.accountId, decision[1])
            : `connection-${decision[1]}`;
        const observation = {
          factors: Object.fromEntries(
            introduction.explanation.factorsForA.map((factor) => [
              factor.id,
              factor.compatibility,
            ]),
          ),
          selectionProbability: introduction.explanation.selectionProbability,
        };
        if (accountSession && accounts) {
          const createdAt = new Date().toISOString();
          accounts.deliverPairEvent(
            accountSession.accountId,
            {
              kind: "decision",
              profileId: decision[1],
              decision: body.decision,
              observation,
              mutual,
              connectionId,
            },
            mutual ? decision[1] : undefined,
            mutual
              ? {
                  kind: "ensure_connection",
                  connectionId,
                  profileId: accountSession.accountId,
                  createdAt,
                }
              : undefined,
          );
          return send(response, 200, {
            profileId: decision[1],
            decision: body.decision,
            mutual,
          });
        }
        const result = store.decide(
          decision[1],
          body.decision,
          observation,
          mutual,
          connectionId,
        );
        return send(response, 200, result);
      }
      if (request.method === "GET" && url.pathname === "/v1/connections")
        return send(response, 200, {
          items: store.connections().map((connection) => ({
            ...connection,
            profile: publicCandidateProfile(connection.profileId),
          })),
          pastItems: store.pastConnections().map((connection) => ({
            ...connection,
            profile: publicCandidateProfile(connection.profileId),
          })),
        });
      const messages = url.pathname.match(
        /^\/v1\/connections\/([^/]+)\/messages$/,
      );
      if (request.method === "GET" && messages) {
        if (!store.connection(messages[1]))
          return send(response, 404, { error: "connection_not_found" });
        return send(response, 200, { items: store.messages(messages[1]) });
      }
      if (request.method === "POST" && messages) {
        if (!consumeOperation("message", response))
          return send(response, 429, {
            error: "operation_rate_limit_exceeded",
            operation: "message",
          });
        const body = (await readJson(request)) as {
          text?: string;
          safetyAcknowledged?: unknown;
          clientRequestId?: unknown;
        };
        const text = body.text?.trim() ?? "";
        if (!text || text.length > 2000)
          return send(response, 400, { error: "invalid_message" });
        const clientRequestId =
          body.clientRequestId === undefined
            ? null
            : typeof body.clientRequestId === "string" &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                  body.clientRequestId,
                )
              ? body.clientRequestId.toLowerCase()
              : undefined;
        if (clientRequestId === undefined)
          return send(response, 400, { error: "invalid_client_request_id" });
        const requestedEventId =
          accountSession && clientRequestId
            ? messageDeliveryEventId(accountSession.accountId, clientRequestId)
            : undefined;
        const existingMessage = requestedEventId
          ? store.messageForDeliveryEvent(requestedEventId)
          : undefined;
        if (existingMessage) {
          if (
            existingMessage.connectionId !== messages[1] ||
            existingMessage.text !== text ||
            existingMessage.senderId !== "me"
          )
            return send(response, 409, {
              error: "client_request_id_reused",
            });
          return send(response, 200, existingMessage);
        }
        const activeConnection = store.connection(messages[1]);
        if (!activeConnection)
          return send(response, 404, { error: "connection_not_found" });
        const safetyFlags = messageSafetyFlags(text);
        if (safetyFlags.length && body.safetyAcknowledged !== true)
          return send(response, 409, {
            error: "message_safety_confirmation_required",
            flags: safetyFlags,
          });
        if (accountSession && accounts) {
          const peer = accounts.accountStore(activeConnection.profileId);
          if (!peer?.connection(messages[1]))
            return send(response, 409, {
              error: "peer_connection_unavailable",
            });
          const createdAt = new Date().toISOString();
          const eventId = accounts.deliverPairEvent(
            accountSession.accountId,
            {
              kind: "message",
              connectionId: messages[1],
              text,
              senderId: "me",
              createdAt,
            },
            activeConnection.profileId,
            {
              kind: "message",
              connectionId: messages[1],
              text,
              senderId: accountSession.accountId,
              createdAt,
            },
            requestedEventId,
          );
          const message = store.messageForDeliveryEvent(eventId);
          if (!message) throw new Error("account_message_delivery_failed");
          return send(response, 201, message);
        }
        const message = store.sendMessage(messages[1], text);
        return send(response, 201, message);
      }
      const connection = url.pathname.match(/^\/v1\/connections\/([^/]+)$/);
      const politeClose = url.pathname.match(
        /^\/v1\/connections\/([^/]+)\/close-politely$/,
      );
      const connectionMute = url.pathname.match(
        /^\/v1\/connections\/([^/]+)\/mute$/,
      );
      const meetingPreference = url.pathname.match(
        /^\/v1\/connections\/([^/]+)\/meeting-preference$/,
      );
      const connectionOutcome = url.pathname.match(
        /^\/v1\/connections\/([^/]+)\/outcomes\/([^/]+)$/,
      );
      if (request.method === "PATCH" && connectionMute) {
        const body = (await readJson(request)) as { muted?: unknown };
        if (typeof body.muted !== "boolean")
          return send(response, 400, { error: "invalid_mute_state" });
        const result = store.updateConnectionMute(
          connectionMute[1],
          body.muted,
        );
        return result
          ? send(response, 200, result)
          : send(response, 404, { error: "connection_not_found" });
      }
      if (request.method === "PATCH" && meetingPreference) {
        const body = (await readJson(request)) as {
          meetingPreference?: unknown;
        };
        if (
          !["not_asked", "not_yet", "open_to_plan"].includes(
            String(body.meetingPreference),
          )
        )
          return send(response, 400, {
            error: "invalid_meeting_preference",
          });
        const result = store.updateMeetingPreference(
          meetingPreference[1],
          body.meetingPreference as "not_asked" | "not_yet" | "open_to_plan",
        );
        return result
          ? send(response, 200, result)
          : send(response, 404, { error: "connection_not_found" });
      }
      if (request.method === "PATCH" && connectionOutcome) {
        const kind = connectionOutcome[2] as ConnectionOutcomeKind;
        const body = (await readJson(request)) as { recorded?: unknown };
        if (
          !CONNECTION_OUTCOME_KINDS.includes(kind) ||
          typeof body.recorded !== "boolean"
        )
          return send(response, 400, { error: "invalid_connection_outcome" });
        const result = store.updateConnectionOutcome(
          connectionOutcome[1],
          kind,
          body.recorded,
        );
        return result
          ? send(response, 200, result)
          : send(response, 404, { error: "connection_not_found" });
      }
      if (request.method === "POST" && politeClose) {
        const activeConnection = store.connection(politeClose[1]);
        if (activeConnection && accountSession && accounts) {
          const peer = accounts.accountStore(activeConnection.profileId);
          if (!peer?.connection(politeClose[1]))
            return send(response, 409, {
              error: "peer_connection_unavailable",
            });
          const createdAt = new Date().toISOString();
          const eventId = accounts.deliverPairEvent(
            accountSession.accountId,
            {
              kind: "polite_close",
              connectionId: politeClose[1],
              text: POLITE_CLOSE_MESSAGE,
              senderId: "me",
              createdAt,
            },
            activeConnection.profileId,
            {
              kind: "polite_close",
              connectionId: politeClose[1],
              text: POLITE_CLOSE_MESSAGE,
              senderId: accountSession.accountId,
              createdAt,
            },
          );
          const message = store.messageForDeliveryEvent(eventId);
          if (!message) throw new Error("account_close_delivery_failed");
          return send(response, 200, { message, closed: true });
        }
        const result = store.closePolitely(
          politeClose[1],
          POLITE_CLOSE_MESSAGE,
        );
        return result
          ? send(response, 200, result)
          : send(response, 404, { error: "connection_not_found" });
      }
      if (request.method === "DELETE" && connection) {
        const activeConnection = store.connection(connection[1]);
        if (!activeConnection) return send(response, 404, null);
        if (accountSession && accounts) {
          const closedAt = new Date().toISOString();
          accounts.deliverPairEvent(
            accountSession.accountId,
            {
              kind: "close_connection",
              connectionId: connection[1],
              closedAt,
            },
            activeConnection.profileId,
            {
              kind: "close_connection",
              connectionId: connection[1],
              closedAt,
            },
          );
        } else store.closeConnection(connection[1]);
        return send(response, 204, null);
      }
      const block = url.pathname.match(/^\/v1\/profiles\/([^/]+)\/block$/);
      if (request.method === "POST" && block) {
        if (!knownProfile(block[1]))
          return send(response, 404, { error: "profile_not_found" });
        if (accountSession && accounts) {
          accounts.deliverPairEvent(
            accountSession.accountId,
            { kind: "block", profileId: block[1] },
            block[1],
            {
              kind: "close_connection",
              connectionId: pairConnectionId(
                accountSession.accountId,
                block[1],
              ),
              closedAt: new Date().toISOString(),
            },
          );
          return send(response, 200, {
            profileId: block[1],
            blocked: true,
          });
        }
        const result = store.block(block[1]);
        return send(response, 200, result);
      }
      if (request.method === "GET" && url.pathname === "/v1/reports")
        return send(response, 200, { items: store.reports() });
      const reportUpdate = url.pathname.match(
        /^\/v1\/reports\/(\d+)\/updates$/,
      );
      if (request.method === "POST" && reportUpdate) {
        if (!consumeOperation("report", response))
          return send(response, 429, {
            error: "operation_rate_limit_exceeded",
            operation: "report",
          });
        const body = (await readJson(request)) as {
          kind?: unknown;
          details?: unknown;
        };
        const kinds: ReportUpdateKind[] = [
          "additional_context",
          "correction",
          "withdrawal_request",
        ];
        const details =
          typeof body.details === "string" ? body.details.trim() : "";
        if (
          typeof body.kind !== "string" ||
          !kinds.includes(body.kind as ReportUpdateKind) ||
          details.length < 1 ||
          details.length > 2000
        )
          return send(response, 400, { error: "invalid_report_update" });
        const update = store.addReportUpdate(
          Number(reportUpdate[1]),
          body.kind as ReportUpdateKind,
          details,
        );
        return update
          ? send(response, 201, update)
          : send(response, 404, { error: "report_not_found" });
      }
      if (request.method === "POST" && url.pathname === "/v1/reports") {
        if (!consumeOperation("report", response))
          return send(response, 429, {
            error: "operation_rate_limit_exceeded",
            operation: "report",
          });
        const body = (await readJson(request)) as {
          profileId?: string;
          reason?: string;
          details?: string;
        };
        if (
          !body.profileId ||
          !knownProfile(body.profileId) ||
          ![
            "harassment",
            "scam",
            "impersonation",
            "offline_safety",
            "other",
          ].includes(body.reason ?? "")
        )
          return send(response, 400, { error: "invalid_report" });
        return send(
          response,
          201,
          store.report(
            body.profileId,
            body.reason!,
            body.details?.slice(0, 4000) ?? "",
          ),
        );
      }
      if (request.method === "POST" && url.pathname === "/v1/demo/reset") {
        store.reset();
        return send(response, 200, { reset: true });
      }
      return send(response, 404, { error: "not_found" });
    } catch (error) {
      if (error instanceof AccountError) {
        if (error.status === 503) response.setHeader("retry-after", "5");
        return send(response, error.status, { error: error.code });
      }
      return send(response, 400, {
        error: "bad_request",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
  let securityRetryRunning = false;
  const securityRetryTimer = securityNotificationSender
    ? setInterval(() => {
        if (!accounts || securityRetryRunning) return;
        securityRetryRunning = true;
        void (async () => {
          try {
            for (const accountId of accounts.pendingSecurityNotificationAccountIds())
              await retrySecurityNotifications(accountId);
          } finally {
            securityRetryRunning = false;
          }
        })();
      }, securityNotificationRetryIntervalMs)
    : null;
  securityRetryTimer?.unref();
  let accountDeliveryRetryRunning = false;
  const accountDeliveryRetryTimer = accounts
    ? setInterval(() => {
        if (accountDeliveryRetryRunning) return;
        accountDeliveryRetryRunning = true;
        try {
          accounts.flushDeliveryEvents();
        } catch {
          // The oldest row has already recorded its bounded next attempt.
          // Strict ordering prevents later actions from bypassing it.
        } finally {
          accountDeliveryRetryRunning = false;
        }
      }, accountDeliveryRetryIntervalMs)
    : null;
  accountDeliveryRetryTimer?.unref();
  server.on("close", () => {
    if (securityRetryTimer) clearInterval(securityRetryTimer);
    if (accountDeliveryRetryTimer) clearInterval(accountDeliveryRetryTimer);
    demoStore.close();
    accounts?.close();
  });
  return server;
}
