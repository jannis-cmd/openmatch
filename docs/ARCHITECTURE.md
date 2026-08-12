# Architecture

## Shape

```text
iOS / Android (Expo) ─┐
                      ├─ HTTPS API ─ PostgreSQL
Accessible web ───────┘       │
                              ├─ matching worker (shared deterministic package)
                              ├─ moderation queue (separate privileged boundary)
                              └─ aggregate transparency pipeline
Public transparency site reads only disclosure-reviewed aggregates and repository artifacts.
```

The current web build can be deployed as the public transparency site without
an API. In production, a missing endpoint disables only interactive demo entry
and performs no implicit localhost request. A future interactive build must
receive a plain HTTPS origin explicitly at build time. This separation lets the
public-interest documentation ship before the private service is safe to host.

## Technology baseline

- TypeScript monorepo with pnpm.
- Expo/React Native for iOS and Android during MVP; retain native-module escape hatch.
- Next.js for accessible web and public transparency pages.
- Node API with generated OpenAPI contract.
- PostgreSQL with row-level authorization enforced in service code and database policies where practical.
- Object storage for encrypted media with short-lived signed access.
- Matching package is pure, deterministic, dependency-light, and usable client-side for score reproduction.

Versions are provisional until an implementation ADR checks current support, accessibility, security, and app-store compatibility.

### Prototype persistence decision

The development API uses Node's built-in SQLite interface directly, with schema creation in `services/api/src/store.ts`. This gives durable local state, foreign keys, and transactional primitives without an ORM or external service. A dependency-free typed client is shared by web and mobile so endpoint semantics do not drift. PostgreSQL remains the production direction only when multi-user deployment requires it; domain and API boundaries should remain unchanged.

The release gate is intentionally layered: pure matching invariants, API/client contract tests, a native component journey under `jest-expo`, and one Chromium journey that exercises the durable vertical slice and runs WCAG 2.2 A/AA rules at setup, explanation, and conversation states. Device-level assistive-technology and native end-to-end testing remain required before a pilot.

The development API has no universal credential. Its explicitly enabled local
demo mode issues random 256-bit bearer tokens but still targets one shared demo
identity. Separately enabled prototype accounts normalize email, use a
per-account salted scrypt passphrase hash, persist only SHA-256 session-token
hashes, and route requests to account-specific SQLite stores. Web and production
mobile builds expose create/sign-in flows. Native account tokens use device-only
Expo SecureStore and are restored before personal data loads; invalid or
unavailable secure state is not used. Each client submits only an allowlisted
coarse client type. People can inspect their own session creation and expiry
times and revoke another session without collecting an IP address, user agent,
device fingerprint, exact model, or activity history. Synchronous account
deletion removes credentials, sessions, and the isolated application store.
Cross-account tests cover application data and session authorization. This is
still not pilot-ready authentication: verification, recovery, production
migrations, and independent review remain open.

For non-production account-flow testing, the account registry assembles
candidates only from other completed, active accounts with a separate
versioned account-directory opt-in whose
normalized self-entered city/region text exactly matches. It substitutes a
transparent “Same approximate region” label and does not geocode or calculate a
distance. The matching package still applies both accounts' boundaries and
private priorities. A reciprocal interest creates one deterministic pair
connection identifier in both isolated stores; messages are written to each
participant's store and connection closure is mirrored. This is deliberately a
bridge for end-to-end testing, not a production transaction protocol: partial
write recovery, durable queues, cross-store locking, moderation retention, and
privacy-reviewed region identifiers remain unresolved.

Native development may explicitly target a local HTTP origin. EAS development,
preview, and production builds instead read a plain HTTPS origin from their
separate EAS environments. A build hook rejects missing or unsafe values, and
the client independently fails closed before making a request. No developer LAN
or Tailnet address is embedded in a distributable profile.

Release builds set `OPENMATCH_COMMIT_SHA` to the exact 7–40 character hexadecimal source revision. The API validates and publishes it through the transparency contract; web and native clients link that immutable revision. Development builds without it are visibly labeled `development-unpinned` and never substitute the current branch name or an invented hash.

## Service boundaries

- Identity service knows credentials and internal user ID.
- Profile service knows user-visible fields and coarse region.
- Matching worker receives only fields required for configured constraints/factors.
- Messaging service encrypts transport/storage; moderation access requires a report or documented safety/legal threshold.
- Research vault uses separate consent, IDs, access roles, retention, and deletion workflows.
- Public analytics never queries raw production through an internet-facing path.

## Core API surface

Core routes include POST /v1/accounts, POST /v1/sessions, PATCH /v1/account/password, GET /v1/sessions, DELETE /v1/sessions/{id}, DELETE /v1/session, GET/PATCH/DELETE /v1/me, GET/PATCH /v1/account/status, GET/PATCH /v1/preferences, GET /v1/introductions, POST /v1/introductions/{id}/decision, GET /v1/connections, GET/POST /v1/connections/{id}/messages, POST /v1/reports, POST /v1/profiles/{id}/block, GET/PATCH /v1/consents, GET/PATCH /v1/consents/research, GET/PATCH /v1/consents/directory, GET /v1/me/export, and GET /v1/transparency/version. The prototype requires an explicit versioned adult/data-use consent receipt before onboarding can complete. Research and account-directory participation are separate, reversible receipts; none substitutes for pilot legal review.

All list endpoints use opaque pagination. Error schemas are public. Authorization and rate limits are explicit in OpenAPI before implementation.

## Environments and reproducibility

Local, test, staging, research, production. Infrastructure-as-code, reproducible builds, signed mobile releases, SBOMs, dependency review, secret scanning, and public deployment commit. Production user data never enters development or public datasets.
