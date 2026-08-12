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

The temporary `x-demo-session: openmatch-local-demo` header makes the lack of production authentication explicit. It is not a security mechanism and must be replaced by passkey/email session authentication before any networked pilot.

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

`POST /v1/accounts`, `GET/PATCH/DELETE /v1/me`, `GET/PATCH /v1/account/status`, `GET/PATCH /v1/profile`, `GET/PATCH /v1/preferences`, `GET /v1/introductions`, `POST /v1/introductions/{id}/decision`, `GET/POST /v1/connections`, `GET/POST /v1/connections/{id}/messages`, `POST /v1/reports`, `POST /v1/blocks`, `GET/PATCH /v1/consents`, `POST /v1/export`, `GET /v1/transparency/version`. The local prototype requires an explicit versioned adult/data-use consent receipt before onboarding can complete; it is not research consent or a substitute for pilot legal review.

All list endpoints use opaque pagination. Error schemas are public. Authorization and rate limits are explicit in OpenAPI before implementation.

## Environments and reproducibility

Local, test, staging, research, production. Infrastructure-as-code, reproducible builds, signed mobile releases, SBOMs, dependency review, secret scanning, and public deployment commit. Production user data never enters development or public datasets.
