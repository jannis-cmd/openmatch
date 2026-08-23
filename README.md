# OpenMatch

OpenMatch is a proposed nonprofit, open-source dating service whose only product goal is to help compatible people meet safely and leave the app.

This repository is an initial, research-backed specification and executable skeleton—not a claim that romantic compatibility can currently be predicted with scientific certainty.

## Principles

1. Optimize for useful introductions and healthy exits, never attention or revenue.
2. Publish every eligibility rule, score, weight, experiment, metric, governance decision, and source of funding.
3. Keep personal data private. System transparency never means user-data publicity.
4. Use the least complicated method supported by evidence.
5. Let users inspect and change every preference that affects their results.
6. Measure real outcomes only with informed, revocable consent.
7. Treat safety, accessibility, inclusion, and fairness as release requirements.

## Repository map

- `docs/PRODUCT_SPEC.md` — complete product and technical specification
- `docs/IMPLEMENTATION_STATUS.md` — verified scope, release gate, and honest pilot boundary
- `research/RESEARCH_PLAN.md` — staged research program
- `research/EVIDENCE_REGISTER.md` — evidence, limitations, and product implications
- `research/LITERATURE_MAP.md` — broad, annotated map of valuable dating research
- `docs/MATCHING.md` — matching formula and explanation contract
- `docs/DATA_MODEL.md` — complete versioned dating-data, consent, prediction, and audit contract
- `docs/ALGORITHM_DECISIONS.md` — evidence, uncertainty, and falsification log for algorithm choices
- `docs/PRIVACY_SECURITY.md` — data minimization and threat model
- `docs/ARCHITECTURE.md` — mobile, web, API, and data architecture
- `docs/TESTFLIGHT.md` — fail-closed mobile build and distribution guide
- `docs/RELEASE_ARTIFACTS.md` — current verified mobile build provenance and hashes
- `docs/STORE_LISTING_DRAFT.md` — plain-language listing copy, disclosures, and submission blockers
- `docs/WEB_DEPLOYMENT.md` — landing-only and future interactive hosting modes
- `docs/SELF_HOSTED_DEV.md` — portable PostgreSQL/Auth/Mailpit development stack
- `docs/TAILNET_BETA.md` — current owner-only web/mobile beta topology and limits
- `governance/GOVERNANCE.md` — nonprofit and algorithm-change governance
- `packages/matching` — executable transparent matching kernel
- `packages/api-client` — dependency-free typed client shared by web and mobile
- `apps/mobile` — Expo shell targeting iOS and Android
- `apps/web` — public/transparency web shell
- `services/api` — API boundary and domain types

## Current status

Specification and pre-alpha scaffold. No production service exists yet. “Science-based” here means hypotheses are traceable to evidence and tested openly—not that the app has a scientifically proven compatibility oracle.

## Quick start

```bash
corepack enable
pnpm install
pnpm test
pnpm dev
```

`pnpm test` runs the matching invariants, API and client contracts, a native Expo component journey, and a Chromium end-to-end journey with automated WCAG 2.2 A/AA checks. The native test setup follows Expo's current `jest-expo` and React Native Testing Library guidance. `pnpm --filter @openmatch/mobile exec expo-doctor` checks Expo dependency compatibility.

The matching package has no runtime dependencies. App versions are intentionally pinned and should be reviewed before the first implementation milestone.

## Working prototype

The repository now contains a thin, local-first vertical slice:

- finite mutually eligible introductions;
- a persisted first-run setup where every active profile-side matching input,
  mutual boundary, and named priority is visible and editable;
- pass/interested decisions;
- editable proximity and factor priorities;
- a contribution-by-contribution score explanation;
- decision-only preference suggestions that never apply automatically;
- genuine two-sided eligibility and directed fit from both people's explicit demo preferences;
- profile and privacy views;
- a versioned structured dating-data model with per-field importance, private-by-default learning controls, pair-specific prediction/audit records, export, and deletion;
- self-service JSON export and synchronous local demo-data deletion with a non-retained completion receipt;
- optional email/password accounts; the portable self-hosted mode uses Supabase Auth (GoTrue) for credentials, confirmation and tokens while OpenMatch stores a minimal identity/session mirror, and the standalone legacy test mode retains the documented scrypt/recovery-code implementation; both use account-isolated application data and device-secure iOS/Android session restoration;
- the same shared matching package on web, iOS, Android, and API;
- a SQLite development API with profile, preferences, introductions, decisions, reset, and transparency endpoints.

Run `pnpm dev`, then open the web app at `http://localhost:3000` or launch the Expo client. The web and mobile clients both use the API at `http://127.0.0.1:4000` by default. The standalone API stores shared demo state in `openmatch.sqlite`, its legacy account registry in `openmatch-accounts.sqlite`, and each account's application data in `openmatch-account-data/`. The self-hosted setup in `docs/SELF_HOSTED_DEV.md` instead makes GoTrue/PostgreSQL authoritative for credentials while the local account registry contains no reusable user password. `POST /v1/demo/reset` restores only the shared sample state.

For Android Emulator, start with `EXPO_PUBLIC_OPENMATCH_API_URL=http://10.0.2.2:4000 pnpm --filter @openmatch/mobile android`. For a physical device, set `HOST=0.0.0.0` for the API and point `EXPO_PUBLIC_OPENMATCH_API_URL` at the development computer's LAN address. These settings are development-only. Each client obtains a random, expiring in-memory bearer token, but that gates one shared demo identity and is not production authentication.

EAS builds contain no committed endpoint and require a separately configured
plain HTTPS API origin. See `docs/TESTFLIGHT.md`; distributed builds are not
ready until the production-service prerequisites listed there are complete.

Account email confirmation is provider-neutral SMTP. Set both
`OPENMATCH_SMTP_URL` (an `smtp:` or `smtps:` URL) and
`OPENMATCH_EMAIL_FROM` (a plain sender mailbox) on the API service. Delivery
requires TLS, and confirmation codes are never printed or returned by an API
endpoint. With no SMTP configuration, local accounts remain visibly
unconfirmed and the development-only account-matching bridge remains available;
a real-person deployment must configure delivery, which then blocks unconfirmed
accounts from account matching.

If the web client runs on another development origin, add it explicitly with `OPENMATCH_ALLOWED_ORIGINS`. Wildcard browser access is intentionally disabled so unrelated websites cannot mutate the localhost demo service.

A production web build with no API URL is intentionally a complete public
landing/transparency site with the demo disabled; it never falls back to a
visitor's localhost. See `docs/WEB_DEPLOYMENT.md`. Do not configure a hosted
interactive demo until the shared demo identity has been replaced by production
authentication and user-partitioned storage.

Implemented API capabilities include editable profile/preferences, finite introductions, mutual connections, accessible author-labeled text-only messages, unmatch, block, structured reports, opt-in expiring local demo sessions, and a minimal account-isolation foundation with SMTP-backed primary and backup inbox confirmation plus security-change notices, authenticated passphrase/session rotation, one-time offline recovery codes, active-session revocation, and synchronous account deletion. Completed active accounts with a separate reversible account-matching opt-in in an exactly matching self-entered approximate region can exercise a non-production reciprocal introduction, mutual connection, synchronized message, and closure flow; when email delivery is configured, this bridge excludes unconfirmed accounts. Local durable journals preserve interrupted cross-account actions and failed security-notice recipients without silently discarding them; web, iOS, and Android expose privacy-minimal pending state and authenticated retry. Web and native message composers retain a cryptographically random request ID with the exact submitted text while retrying an unchanged message, including across a browser reload or native process restart, preventing a lost response from turning one send action into two stored messages. Native account sessions and pending send attempts restore from device-only Expo SecureStore; web pending attempts stay only in the current tab session. The account system is intentionally incomplete: passkeys, automatic mail workers with bounce/complaint monitoring and staffed dead-letter operations, a staffed account-takeover response path, privacy-reviewed coarse location, transactional production migrations/authorization, moderation staffing/tools, encryption key management, independent security review, and public deployment remain future milestones.

Release metadata is deliberately narrow: mobile builds request no notification, vibration, overlay, local-network, Face ID, or external-storage capability; the resolved Android manifest retains only internet access and disables application backup, while iOS rejects arbitrary/local transport exceptions. The web app includes installable raster icons but no service worker that could cache private API responses.

[`docs/PRODUCT_BOUNDARIES.json`](docs/PRODUCT_BOUNDARIES.json) makes absent and mission-forbidden capabilities machine-readable. The release tests reject direct advertising, engagement-analytics, push, contact, location, camera/photo, tracking, and related dependencies or application APIs instead of relying on policy prose alone.

## License

Software is AGPL-3.0-or-later. Documentation and research materials are CC BY 4.0; see `LICENSE-DOCS`.
