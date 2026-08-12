import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  ALGORITHM_VERSION,
  POLITE_CLOSE_MESSAGE,
  createIntroductions,
  demoCandidates,
  toPublicProfile,
} from "@openmatch/matching";
import { Store } from "./store.js";

const send = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-methods": "GET,PATCH,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,x-demo-session",
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
const demoSession = (request: IncomingMessage) =>
  request.headers["x-demo-session"] === "openmatch-local-demo";

export function createApp(
  options: { store?: Store; allowedOrigins?: string[] } = {},
) {
  const store = options.store ?? new Store();
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
      if (!demoSession(request))
        return send(response, 401, { error: "demo_session_required" });
      if (request.method === "GET" && url.pathname === "/v1/me")
        return send(response, 200, store.profile());
      if (request.method === "GET" && url.pathname === "/v1/me/export")
        return send(response, 200, store.exportData());
      if (request.method === "DELETE" && url.pathname === "/v1/me") {
        store.reset();
        return send(response, 204, null);
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
          });
        const hidden = new Set([
          ...store.decidedIds(),
          ...store.hiddenIds(),
          ...store.savedIds(),
        ]);
        const items = createIntroductions(
          store.profile(),
          demoCandidates,
          store.preferences(),
        )
          .filter((item) => !hidden.has(item.profile.id))
          .slice(0, store.deliverySettings().batchSize);
        return send(response, 200, {
          items,
          finite: true,
          remaining: items.length,
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
        const introduction = createIntroductions(
          store.profile(),
          demoCandidates,
          store.preferences(),
        ).find((item) => item.profile.id === decision[1]);
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
            selectionProbability: 1,
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
        const body = (await readJson(request)) as { text?: string };
        const text = body.text?.trim() ?? "";
        if (!text || text.length > 2000)
          return send(response, 400, { error: "invalid_message" });
        return send(response, 201, store.sendMessage(messages[1], text));
      }
      const connection = url.pathname.match(/^\/v1\/connections\/([^/]+)$/);
      const politeClose = url.pathname.match(
        /^\/v1\/connections\/([^/]+)\/close-politely$/,
      );
      const connectionMute = url.pathname.match(
        /^\/v1\/connections\/([^/]+)\/mute$/,
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
        });
      return send(response, 404, { error: "not_found" });
    } catch (error) {
      return send(response, 400, {
        error: "bad_request",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
  server.on("close", () => store.close());
  return server;
}
