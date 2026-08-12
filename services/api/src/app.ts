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
} from "@openmatch/matching";
import { Store } from "./store.js";
import { AccountError, Accounts } from "./accounts.js";

const send = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-methods": "GET,PATCH,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  response.end(status === 204 ? undefined : JSON.stringify(body));
};
const readJson = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 64 * 1024) throw new RangeError("request body is too large");
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
const currentBatchIntroductions = (store: Store, excluded: Set<string>) => {
  const weeklySeed = publicWeeklySeed();
  const batchSize = store.deliverySettings().batchSize;
  let batch = store.introductionBatch();
  if (
    !batch ||
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
      demoCandidates.filter(({ profile }) => !unavailable.has(profile.id)),
      store.preferences(),
      introductionOptions(store),
    );
    batch = {
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
    const candidate = demoCandidates.find(
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
  const knownProfile = (id: string) =>
    demoCandidates.some((candidate) => candidate.profile.id === id);
  const publicCandidateProfile = (id: string) => {
    const profile = demoCandidates.find(
      (candidate) => candidate.profile.id === id,
    )?.profile;
    return profile ? toPublicProfile(profile) : undefined;
  };
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
  const requestWindows = new Map<
    string,
    { startedAt: number; count: number }
  >();
  const authenticationWindows = new Map<
    string,
    { startedAt: number; count: number }
  >();
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
        return send(response, 200, { status: "ok", service: "openmatch-api" });
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
        const previousAuth = authenticationWindows.get(key);
        const authWindow =
          !previousAuth ||
          now - previousAuth.startedAt >= authRateLimit.windowMs
            ? { startedAt: now, count: 0 }
            : previousAuth;
        authWindow.count += 1;
        authenticationWindows.set(key, authWindow);
        if (authWindow.count > authRateLimit.maximum) {
          response.setHeader(
            "retry-after",
            String(
              Math.max(
                1,
                Math.ceil(
                  (authRateLimit.windowMs - (now - authWindow.startedAt)) /
                    1000,
                ),
              ),
            ),
          );
          return send(response, 429, {
            error: "authentication_rate_limit_exceeded",
          });
        }
        const body = (await readJson(request)) as {
          email?: unknown;
          password?: unknown;
        };
        try {
          const session =
            url.pathname === "/v1/accounts"
              ? accounts.register(body.email, body.password)
              : accounts.signIn(body.email, body.password);
          return send(response, url.pathname === "/v1/accounts" ? 201 : 200, {
            token: session.token,
            expiresAt: session.expiresAt,
            authentication: true,
          });
        } catch (error) {
          if (error instanceof AccountError)
            return send(response, error.status, { error: error.code });
          throw error;
        }
      }
      const authorization = request.headers.authorization;
      const token = authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;
      const tokenHash = token ? sessionHash(token) : null;
      const expiresAt = tokenHash ? demoSessions.get(tokenHash) : undefined;
      const accountSession =
        token && accounts ? accounts.authenticate(token) : undefined;
      const demoSessionValid = Boolean(expiresAt && expiresAt > now);
      if (!token || (!accountSession && !demoSessionValid)) {
        if (tokenHash && expiresAt) demoSessions.delete(tokenHash);
        return send(response, 401, { error: "session_required" });
      }
      const store = accountSession?.store ?? demoStore;
      if (request.method === "DELETE" && url.pathname === "/v1/session") {
        if (accountSession && accounts) accounts.revoke(token);
        else if (tokenHash) demoSessions.delete(tokenHash);
        return send(response, 204, null);
      }
      if (request.method === "DELETE" && url.pathname === "/v1/account") {
        if (!accountSession || !accounts)
          return send(response, 409, {
            error: "authenticated_account_required",
          });
        accounts.deleteAccount(accountSession.accountId);
        return send(response, 200, {
          deleted: true,
          completedAt: new Date().toISOString(),
          credentialsDeleted: true,
          sessionsRevoked: true,
          applicationBackups: "none",
        });
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
            (await readJson(request)) as Parameters<Store["updateProfile"]>[0],
          ),
        );
      if (request.method === "GET" && url.pathname === "/v1/preferences")
        return send(response, 200, store.preferences());
      if (
        request.method === "GET" &&
        url.pathname === "/v1/preferences/suggestions"
      )
        return send(response, 200, {
          items: store.preferenceSuggestions(),
          minimumObservations: 20,
          automaticChanges: false,
        });
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
        const items = currentBatchIntroductions(store, hidden);
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
            demoCandidates,
            store.preferences(),
          ).filter(
            (item) =>
              saved.has(item.profile.id) && !unavailable.has(item.profile.id),
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
          demoCandidates,
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
        if (!knownProfile(decision[1]))
          return send(response, 404, { error: "profile_not_found" });
        const unavailable = new Set([
          ...store.decidedIds(),
          ...store.hiddenIds(),
        ]);
        const introduction =
          currentBatchIntroductions(store, unavailable).find(
            (item) => item.profile.id === decision[1],
          ) ??
          (store.savedIds().has(decision[1])
            ? createIntroductions(
                store.profile(),
                demoCandidates.filter(
                  ({ profile }) => profile.id === decision[1],
                ),
                store.preferences(),
              )[0]
            : undefined);
        if (!introduction)
          return send(response, 409, { error: "profile_not_eligible" });
        const body = (await readJson(request)) as { decision?: string };
        if (body.decision !== "interested" && body.decision !== "passed")
          return send(response, 400, { error: "invalid_decision" });
        return send(
          response,
          200,
          store.decide(decision[1], body.decision, {
            factors: Object.fromEntries(
              introduction.explanation.factorsForA.map((factor) => [
                factor.id,
                factor.compatibility,
              ]),
            ),
            selectionProbability: introduction.explanation.selectionProbability,
          }),
        );
      }
      if (request.method === "GET" && url.pathname === "/v1/connections")
        return send(response, 200, {
          items: store.connections().map((connection) => ({
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
        if (!store.connection(messages[1]))
          return send(response, 404, { error: "connection_not_found" });
        const body = (await readJson(request)) as {
          text?: string;
          safetyAcknowledged?: unknown;
        };
        const text = body.text?.trim() ?? "";
        if (!text || text.length > 2000)
          return send(response, 400, { error: "invalid_message" });
        const safetyFlags = messageSafetyFlags(text);
        if (safetyFlags.length && body.safetyAcknowledged !== true)
          return send(response, 409, {
            error: "message_safety_confirmation_required",
            flags: safetyFlags,
          });
        return send(response, 201, store.sendMessage(messages[1], text));
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
      if (request.method === "POST" && politeClose) {
        const result = store.closePolitely(
          politeClose[1],
          POLITE_CLOSE_MESSAGE,
        );
        return result
          ? send(response, 200, result)
          : send(response, 404, { error: "connection_not_found" });
      }
      if (request.method === "DELETE" && connection)
        return send(
          response,
          store.closeConnection(connection[1]) ? 204 : 404,
          null,
        );
      const block = url.pathname.match(/^\/v1\/profiles\/([^/]+)\/block$/);
      if (request.method === "POST" && block) {
        if (!knownProfile(block[1]))
          return send(response, 404, { error: "profile_not_found" });
        return send(response, 200, store.block(block[1]));
      }
      if (request.method === "GET" && url.pathname === "/v1/reports")
        return send(response, 200, { items: store.reports() });
      if (request.method === "POST" && url.pathname === "/v1/reports") {
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
      return send(response, 404, { error: "not_found" });
    } catch (error) {
      return send(response, 400, {
        error: "bad_request",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
  server.on("close", () => {
    demoStore.close();
    accounts?.close();
  });
  return server;
}
