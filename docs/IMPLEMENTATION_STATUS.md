# Implementation status

This repository is a verified pre-alpha development foundation, not a deployable dating service. The narrow local-demo scope is complete enough to extend without replacing its architecture.

## Implemented and verified

| Requirement | Evidence |
|---|---|
| Web, iOS, and Android clients | Next.js production build plus Expo iOS and Android exports |
| One durable product flow | Onboarding → finite introductions → decision → mutual connection → text message → safety action |
| User-controlled public profile | Name, adult age, approximate city/region, optional free-text pronouns, relationship intention, and biography are editable during setup and later on web and mobile |
| User-controlled mutual boundaries | Age range, accepted relationship intentions, smoking, children, and distance boundaries are editable independently from ordering priorities on web and mobile |
| Explicit prototype consent | Server-enforced adult confirmation and local data-use acknowledgement produce a timestamped, versioned receipt that is exported and cleared on deletion |
| Transparent reciprocal matching | Shared deterministic kernel; mutual boundaries; separate A→B and B→A compatibility and weights; harmonic mean; versioned explanations |
| In-app transparency center | Deployed algorithm version, objective, source code, evidence register, decision history, privacy distinction, and known limitations are reachable on web and mobile |
| Proximity without public precision | Internal coarse-region estimate; only five public distance bands leave the matching boundary |
| Limited learning from decisions | Interested/Pass observations store only shown A-side factors and selection probability; suggestions require 20 mixed observations; no automatic changes |
| Personal-data transparency | JSON export, pause, hide, resume, and deletion/reset from Profile on web and mobile |
| Preference privacy | Candidate factor traces default private; sharing is explicit; redaction is tested not to change scores |
| Basic safety | Report/block from introductions and conversations, mutual-only user-written text messaging, no read receipts, confirmed destructive actions, categorized reports with optional user context, visible report receipts, and always-reachable safer-dating/scam guidance |
| Local API hardening | SQLite, validation, 64 KiB body limit, allowlisted browser origins, no-store responses, known-profile checks, explicit demo boundary |
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
