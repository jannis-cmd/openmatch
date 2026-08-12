# Implementation status

This repository is a verified pre-alpha development foundation, not a deployable dating service. The narrow local-demo scope is complete enough to extend without replacing its architecture.

## Implemented and verified

| Requirement | Evidence |
|---|---|
| Web, iOS, and Android clients | Next.js production build plus Expo iOS and Android exports |
| One durable product flow | Onboarding → finite introductions → decision → mutual connection → text message → safety action |
| User-controlled public profile | Name, adult age, approximate city/region, optional free-text pronouns, relationship intention, and biography are editable during setup and later on web and mobile |
| Public meeting readiness | “Prefer to chat first” or “Ready to meet in person” is editable and visible on all clients, migrates existing profiles to the cautious default, and is explicitly excluded from matching |
| User-controlled mutual boundaries | Age range, accepted relationship intentions, smoking, children, and distance boundaries are editable independently from ordering priorities on web and mobile |
| Explicit prototype consent | Server-enforced adult confirmation and local data-use acknowledgement produce a timestamped, versioned receipt that is exported and cleared on deletion |
| Separate research consent | Optional research enrollment defaults to no receipt, can be opted into and withdrawn independently on web/mobile, never changes matching, and is versioned/exported/deleted |
| Transparent reciprocal matching | Shared deterministic kernel; mutual boundaries; separate A→B and B→A compatibility and weights; harmonic mean; versioned explanations |
| Matching invariant tests | 2,000 deterministic generated cases verify hard-boundary exclusion, two-sided symmetry, monotonicity, score bounds, bounded exposure, and zero-priority behavior alongside concrete adversarial cases |
| In-app transparency center | Deployed algorithm version, validated commit link (or explicit unpinned-development state), objective, source code, evidence register, decision history, privacy distinction, and known limitations are reachable on web and mobile |
| Logged-out public transparency | The landing page exposes source, evidence, decision history, data inventory, known limits, and the shared offline score calculator without account/demo entry or API traffic |
| Local score calculator | Web, iOS, and Android call the shared deterministic kernel with adjustable synthetic two-sided fit and boundary inputs; no API request is involved |
| Machine-readable data inventory | Every current local storage/export collection lists its fields, purpose, retention rule, access roles, disclosure, and notable exclusions in `docs/DATA_INVENTORY.json` |
| Proximity without public precision | Internal coarse-region estimate; only five public distance bands leave the matching boundary |
| Limited learning from decisions | Interested/Pass observations store only shown A-side factors and selection probability; suggestions require 20 mixed observations; no automatic changes |
| Saved introductions | Save/restore is persisted independently from Interested/Pass, available on web and mobile, private from candidates, exported, and cleared on reset/deletion; the prototype queue has no scheduled expiry yet |
| User-controlled finite delivery | A persisted 1–5 batch-size control is enforced by the API and exposed on web and mobile with an explicit hypothesis caveat; pause remains separately available |
| Personal-data transparency | JSON export, pause, hide, resume, and deletion/reset from Profile on web and mobile |
| Preference privacy | Candidate factor traces default private; sharing is explicit; redaction is tested not to change scores |
| Basic safety | Report/block from introductions and conversations, mutual-only user-written text messaging, no read receipts, confirmed destructive actions, categorized reports with optional user context, private report history/status, visible report receipts, and always-reachable safer-dating/scam guidance |
| Polite conversation close | Web and mobile can atomically send a published standard closing message and close the connection; the final message remains in export while silence and unmatching remain unpenalized alternatives |
| Private conversation mute | Web and mobile persist mute independently from unmatch/block/report, export it, and explain that it will suppress future message notifications while the current prototype sends none |
| Human-controlled conversation starter | Web and mobile can copy a deterministic draft based only on the candidate’s visible, human-written prompt answer; the person must review/edit and explicitly send it |
| Local API hardening | SQLite, validation, 64 KiB body limit, allowlisted browser origins, no-store responses, configurable per-address request throttling with `Retry-After`, known-profile checks, explicit demo boundary |
| Accessibility baseline | Semantic controls, visible/non-color states, automated WCAG 2.2 A/AA scans at four web states, native component queries, contrast fixes |
| Open development | AGPL software license, CC BY documentation license, governance, research proposal template, evidence register, decision log, and formatting gate |

Mobile clients also refresh private state when returning to the foreground. The release gate is:

```bash
pnpm format:check
pnpm test
pnpm typecheck
pnpm build
cd apps/mobile && pnpm dlx expo-doctor
```

## Deliberately not claimed

Before any real-user pilot, the project still requires production authentication and authorization, a true multi-user datastore and migrations, identity/inclusion research, photo storage and processing, staffed moderation and appeals, rate limiting beyond the local boundary, encryption and secret management, notification design, deletion/backup drills, device-level assistive-technology testing, security review, legal/DPIA review, and a geographically viable safety program.

The matching method is a transparent hypothesis. Passing tests proves implementation invariants, not that the score predicts attraction, love, relationship satisfaction, or safety. Those claims remain explicitly forbidden without prospective evidence.

## Best next development increment

Replace the single visible demo session with a minimal authenticated multi-user pilot model while preserving the existing domain contracts. Do not add photos, notifications, or broader matching fields until privacy, inclusion, and safety requirements for those features are resolved.
