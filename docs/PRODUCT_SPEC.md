# OpenMatch product specification

Status: Draft 0.1 — 12 August 2026

## 1. Product definition

OpenMatch is a nonprofit public-interest introduction service for adults. It provides a small, understandable set of reciprocal introductions, safe communication, and an easy path to meeting offline. It deliberately avoids infinite browsing, advertisements, premium visibility, streaks, coins, boosts, popularity scores, and engagement notifications.

The app does **not** promise to predict love. Evidence shows that pre-meeting romantic desire is difficult to predict from self-report traits and that relationship-specific dynamics become more informative only after a relationship exists. The product therefore calls results “introductions,” never “scientific compatibility guarantees.”

### North-star outcome

The primary outcome is the consented, aggregate rate of **mutually positive introductions per eligible active person**, followed by an optional hierarchy:

1. both people wanted to talk;
2. a substantive reciprocal conversation occurred;
3. both report an offline/video date;
4. both report wanting another date;
5. both voluntarily report an ongoing relationship at 1, 3, 6, or 12 months;
6. either pauses/leaves because they met someone.

No individual outcome is inferred from private message text. Metrics are never optimized for time, sessions, swipes, messages sent, notification opens, or subscription conversion.

### Non-goals

- predicting a soulmate;
- maximizing daily active users or time in app;
- selling access, attention, data, or ranking;
- gamified swiping or public desirability;
- replacing human judgment, consent, or chemistry;
- diagnosing personality, attachment, mental health, or relationship fitness;
- launching globally before local density and safety operations are adequate.

## 2. Intended users and scope

Initial launch: consenting adults 18+ seeking dates or relationships in one pilot region. All genders, sexual orientations, and consensual relationship structures must be representable without forcing binary assumptions. Launch cohorts and geographic scope require community research and safety capacity.

The system must distinguish:

- identity: how I describe myself;
- visibility: what I choose to disclose and when;
- eligibility: whom I am open to meeting;
- intention: relationship type and current readiness;
- preference: a soft preference, not a requirement;
- boundary: a mutual hard constraint.

## 3. Experience principles (“Apple-like,” operationalized)

- One purpose per screen; one visually dominant action.
- Native platform conventions, high-quality typography, generous whitespace.
- No more than five primary tabs: Today, Connections, Messages, Profile, About.
- Plain nouns and verbs. No casino language, urgency, scarcity, or variable rewards.
- No endless feed. A finite daily/weekly set has a visible end.
- Progressive disclosure: a concise profile first, detail by deliberate action.
- Every introduction answers “Why am I seeing this?” with the exact factors and weights.
- Accessibility: WCAG 2.2 AA on web and equivalent mobile semantics, dynamic type, screen-reader labels, reduced-motion support, non-color cues, 44×44 pt minimum targets.

## 4. MVP feature set

### 4.1 Account and consent

- Email/passkey sign-in; phone number optional and never public.
- Age gate and region eligibility.
- Short, versioned consent screens for service processing, research participation, and optional verification—never bundled.
- Export, pause, hide, and delete controls available from Profile without contacting support. Export, reset, and permanent account deletion are mutually serialized; a rejected request stays in context and explicitly says that no download or deletion completed, while the UI changes only after the corresponding server result or deletion receipt.
- The executable prototype implements JSON export, deletion/reset, pause, and hide across web, iOS, and Android. Profile visibility and account-matching participation change only after server confirmation. While either privacy mutation is running, competing controls are disabled; failure leaves the prior confirmed state visibly active and provides a retryable, action-specific error. These controls still require threat-model and assistive-technology review before any pilot.
- Research consent defaults off and can be withdrawn prospectively at any time. Opt-in and withdrawal preserve the last server-confirmed receipt while saving, disable repeat submission, and expose a local retry error after failure rather than implying that consent changed.
- The executable passphrase prototype accepts 15–128 characters without composition or periodic-change rules, allows password-manager autofill/paste, verifies the current passphrase before a change, and atomically replaces all sessions. Passkeys and verified recovery remain the production direction.
- The executable recovery prototype issues eight one-time 128-bit look-up secrets only after current-passphrase verification, stores only their hashes, invalidates an older set when replaced, and atomically consumes the complete set while replacing the passphrase and all sessions. It is an offline fallback—not verified contact ownership, identity proofing, or MFA.
- When SMTP delivery is explicitly configured, the account service sends an eight-digit, salted-scrypt-protected, single-use email confirmation code that expires within 24 hours. Confirmation proves inbox access only. Unconfirmed accounts can finish private setup but cannot opt into or appear in account matching; missing delivery configuration remains visibly unconfirmed rather than inventing verification.
- A confirmed inbox receives sparse security notices after passphrase change, recovery-code replacement, and account recovery. Notices contain no secrets, links, IP addresses, or device details; clients disclose delivery failure instead of implying notification succeeded.
- A person may add one separately confirmed backup notification email after re-entering the current passphrase. Security notices then go to both confirmed inboxes; the backup address is never a sign-in identifier, recovery secret, matching input, identity claim, or MFA factor.

The first-run product setup is intentionally short: public name, adult age, short biography, self-described gender, overlapping discovery groups, mutual gender/age/distance boundaries, and four named priority levels (Off, Low, Medium, High). Because values, smoking/children compatibility, and schedule are active prototype factors, the executable clients also expose those profile-side inputs and the human-written conversation prompt during setup and later editing; no demo answer is silently treated as the user’s own. Gender is never inferred, and partner preferences remain private. It does not use a personality test or claim that questionnaire length improves relationship outcomes. Inclusion, consent, and safety details required for a real pilot must continue through focused participatory research rather than inference from this executable baseline.

The prototype saves setup through one transactional, versioned `setup-0.1` command. Profile, preferences, required consent, optional directory participation, onboarding completion, and introduction-batch invalidation either commit together or roll back together. Web and native clients serialize submission, retain the entered form and checked acknowledgements after failure, and only leave setup after the complete receipt. Automated fault injection proves that a storage failure at the final write leaves every earlier field and consent unchanged. This local SQLite transaction is an implemented integrity guarantee, not evidence that the setup questions improve matching outcomes.

### 4.2 Profile

Required in the executable prototype: display name/pseudonym, age, approximate region, gender description, people sought, relationship intention, short biography, and availability/readiness. A representative photo remains absent until the separate public safety, privacy, abuse-operations, accessibility, outing-risk, and inclusion review permits it.

Optional structured fields: languages, accessibility needs, children/current parenting, desire for children, religion/importance, politics/importance, smoking, alcohol, other substances, pets, schedule, distance/mobility, relationship structure, and selected values/prompts.

Sensitive fields are private-by-default and independently visibility-controlled. Exact location, income, employer, legal name, contacts, and immigration/health status are not requested for matching.

The executable clients show a live literal preview during setup and editing of every field currently transmitted in the public profile, including smoking, children plans, and typical schedule. The same fields are visibly rendered to introduction recipients. The preview separately names discovery routing groups, people sought, boundaries, priorities, one-sided decisions, and the private candidate-side factor trace as not public. Later profile and matching-preference edits are isolated drafts until the service confirms each complete update; a failed save remains editable and retryable, while cancel restores the last confirmed version. Matching and introduction ordering continue to use the confirmed preference set until that acknowledgement, and a successful save followed by a refresh failure is disclosed separately rather than misreported as a failed write. This is a disclosure-comprehension hypothesis grounded in self-presentation and privacy research, not evidence that a preview improves matching outcomes or safety.

Identity, eligibility, and disclosure must be technically independent. A person may need the service to process an identity or accessibility need without revealing it to every candidate. The app must support neutral notifications, rapid profile concealment, and graduated photo/detail visibility for users at risk of outing, stalking, fetishization, or workplace/family discovery.

### 4.3 Preferences and boundaries

Users configure mutual hard constraints first: age range, distance/region, gender eligibility, intention/relationship structure, smoking/substance boundaries, and child-related incompatibilities. Web, iOS, and Android offer an explicit aggregate-only check of unsaved boundaries against the current unresolved prototype pool. It returns the mutually eligible and evaluated counts, saves nothing, exposes no identity, clears stale results after an edit, and says directly that a smaller count is not a recommendation to relax a boundary. It is an exact count for that small current pool, not a forecast of future availability or evidence that a boundary is good or bad.

Soft priorities are capped at five and weighted by the user as Low, Medium, or High. A user can turn every soft signal off. Preference changes take effect immediately and appear in the explanation.

### 4.4 Introductions

- Default batch: up to five introductions twice per week; configurable down to one or paused.
- Each executable card shows core information, biography, intention, shared/compatible factors, known differences, and an exact score explanation. Photos are deliberately absent until the consent, secure-processing, abuse-operations, accessibility, outing-risk, and inclusion questions in the public product boundaries are resolved; if later approved, image analysis and beauty scoring remain prohibited.
- Actions: Interested, Pass, Save for later, Report/Block. The executable prototype has no scheduled saved-item expiry yet. Save/return changes only after server confirmation; competing decisions are disabled during the write, a failure preserves the prior list with explicit retry guidance, and success updates only the affected current/saved lists without depending on a broad refresh.
- Pass is private and has no penalty. No undo monetization. Interested/Pass remains unresolved on an ordinary write failure, disables competing save/decision controls while submitting, and removes the card locally only after confirmation. Connection and learning-suggestion refresh is secondary and cannot turn a confirmed decision into a reported failure. A separately identified queued cross-account delivery is reconciled from server state and never represented as receipt by the other person.
- A connection opens only after mutual interest.
- If fewer eligible people exist, show that honestly; never insert incompatible or inactive accounts.
- Completed batches cannot be restarted as a repeatable feed. The executable clients publish the next Monday UTC window while stating that resolved profiles stay resolved and only newly eligible profiles may appear.

The batch size is a testable starting hypothesis—not settled science. Users may select a finite alternative, and research must evaluate wellbeing and outcomes. The clients keep the last server-confirmed size visibly active while an update is running, prevent concurrent updates, disclose a failed write for explicit retry, and distinguish a confirmed save from a later introduction-refresh failure.

The executable account service now includes a deliberately non-production
multi-account path: after completed setup and a separate, versioned,
reversible account-matching opt-in, Active accounts can
appear to mutually eligible accounts only when normalized self-entered
city/region text matches exactly. One-sided interest stays private; reciprocal
interest creates a shared connection and text messages are copied to each
account store. The UI labels this “Same approximate region” and never claims a
distance. This proves the cross-platform flow, not geographic safety, pool
viability, distributed delivery operations, moderation readiness, or pilot
consent. A local durable journal now replays interrupted cross-account actions
idempotently, but it is not a production message service.

### 4.5 Messaging and meeting

While the app is visible, clients quietly synchronize the minimal connection list so a mutual match or remote closure appears without a reload. An open conversation synchronizes its text messages on a shorter bounded interval and when the native app returns to the foreground. Synchronization pauses in a hidden browser tab or backgrounded app and never creates read receipts, typing indicators, online status, presence history, engagement notifications, or message-content ranking.

Each open connection owns a separate composer draft and retry identity. Switching conversations never moves or erases another conversation's text, and returning restores it. Ordinary text that has never been submitted remains in memory only. Immediately before the first send attempt, the exact submitted text and random retry identity are retained per tab on web and in device-only protected storage on iOS and Android. An interrupted unchanged send therefore survives a browser reload or native process restart without becoming a duplicate. A successful send, edit, confirmed connection closure, sign-out, account replacement/deletion, or rejected session clears that protected pending state.

- Text messages after mutual connection; image attachments disabled at MVP to reduce unsolicited sexual content and moderation burden.
- Every message visibly and accessibly identifies its author; sent/received state never relies on color or alignment alone.
- When more than one connection exists, the person explicitly chooses the conversation; drafts, messages, meeting preferences, and safety actions must never leak across that selection boundary.
- Optional profile-specific conversation prompts, never AI-written impersonation.
- Mute, unmatch, block, and report remain one tap away.
- Optional “Would you like to meet?” card after reciprocal activity. It suggests public-place safety practices but never exposes location.
- The executable prototype implements this as a private, reversible planning preference rather than an outcome claim. It is not sent to a demo candidate or another account and does not record that a meeting occurred. Meeting-planning and mute controls preserve their last server-confirmed values during writes, prevent overlapping connection-preference actions or connection switching, and expose a local retry error after failure instead of implying persistence.
- Web, iOS, and Android provide a separate voluntary private outcome journal with independently removable milestones for meeting in person, wanting another date, starting a relationship, and a relationship ending. Each entry is explicitly one person's self-report—not proof or a statement from both people—and is never copied to the connection, inferred from messages, or used to update matching automatically. Confirmed entries are exported and deleted with personal data; a rejected write leaves the prior journal authoritative. Keeping stages separate follows the measurement requirement that exposure, interest, dates, second-date intention, relationship formation, and exit are different outcomes. These four plain milestones are a prototype measurement scaffold, not a validated satisfaction instrument and not permission to aggregate or publish small cells.
- Optional video-date path may be tested before in-person planning. No beauty, emotion, deception, disability, or safety inference is performed on video.
- Users can close a conversation politely with a standard message; silence is never penalized.

### 4.6 Safety

Submitting a report immediately conceals that profile from the reporter's future discovery surfaces. It does not silently erase an existing conversation, so the reporter can preserve context and separately choose unmatch or block; this local concealment is not a moderation finding or a claim that staff reviewed the report. The form preserves reason and written context after a rejected submission and exposes a local retry error. After a receipt, concealment and success copy are immediate; report-history refresh is secondary and cannot recast a received report as failed.

- Block/report from every profile and conversation.
- A production service requires an evidence-preserving report flow, severity triage, published response targets, status tracking, human appeal, and anti-retaliation controls. The executable prototype currently provides append-only user corrections/context/withdrawal requests and an honest unstaffed `received` status, not triage, response targets, moderation findings, or appeals.
- Rate limits, device/account abuse signals, duplicate-account checks, and optional privacy-preserving liveness/photo verification.
- Every verification badge states exactly what was checked and what it cannot establish. Photo/liveness verification must never imply background safety or good intent.
- Scam defenses include risky-link and payment-request friction, contextual education, fast escalation, evidence preservation, trained human support, and a non-blaming recovery path. Automated suspicion never silently lowers dating visibility.
- The executable prototype implements the friction portion with two inspectable rules and explicit human confirmation. It does not claim to identify scams, retain a suspicion label, or perform automatic enforcement.
- Location is stored at coarse regional/geohash precision; public distance is bucketed and never continuously updated.
- No read receipts, online status, precise last-active time, contact discovery, or screenshot alerts in MVP.
- Crisis and local support resources are accessible without filing a report.
- The executable prototype provides a Switzerland-scoped no-report help path publicly and in every client. It distinguishes 117/144 emergencies from the non-emergency 142 victim-support line and warns that calls/external sites can leave records outside OpenMatch.
- Safety advisory council includes women, LGBTQIA+ people, disabled people, racialized communities, and survivors; contributors are compensated.

### 4.7 Transparency center

Available in-app and publicly on web:

- current matching source and human-readable specification;
- deployed commit hash, model/formula version, and change log;
- interactive score calculator using synthetic/local data;
- every collected field, purpose, retention period, and access role;
- aggregate funnel and outcome metrics with denominators and uncertainty;
- exposure distribution and fairness audits;
- moderation rules, volumes, response times, appeals, and reversals;
- incidents, vulnerabilities after remediation, uptime, budget, donors, compensation, vendors, and conflicts of interest;
- research protocols, preregistrations, instruments, null results, withdrawals, and publication status;
- board minutes and algorithm-change proposals.

Small cells are suppressed and privacy budgets used where necessary. Transparency reports must not enable re-identification.

## 5. Matching v0

The algorithm is deliberately a deterministic, auditable introduction score—not machine learning.

1. **Mutual eligibility:** exclude pairs when either person’s hard boundary is unmet, either has blocked/reported the other, accounts are inactive/paused, or the pair has already resolved.
2. **Per-person fit:** for each enabled soft factor `f`, convert compatibility to `[0,1]`; calculate `fit(A→B) = Σ(weight_A,f × compatibility_f(A,B)) / Σ(weight_A,f)`.
3. **Reciprocity:** `reciprocalFit = harmonicMean(fit(A→B), fit(B→A))`. The harmonic mean penalizes one-sided fit and is fully explained.
4. **Opportunity:** apply a bounded, published exposure factor only to reduce large exposure disparities; it must never use protected characteristics as a negative signal or alter hard boundaries.
5. **Exploration:** reserve a published fraction of slots for randomly ordered eligible candidates so new or historically underexposed people can be seen and causal evaluation remains possible. Show when an introduction is exploratory.
6. **Ordering:** order by final score, then deterministic lottery seeded from the public weekly seed. Never use attractiveness, predicted engagement, spending, or message-content sentiment.

The exact executable formula and explanation format live in `packages/matching` and `docs/MATCHING.md`.

### Initial factors

Only user-configured, interpretable factors enter v0:

- relationship intention alignment;
- child/parenting plans where not a hard boundary;
- relationship-structure alignment;
- distance or mobility preference;
- lifestyle compatibility explicitly selected by each user;
- user-selected values or issues they mark important;
- schedule/availability overlap;
- shared language when relevant.

Big Five similarity, attachment style, “love languages,” MBTI, inferred attractiveness, income proxies, race-based similarity, text embeddings, facial analysis, and opaque behavioral prediction are excluded from v0. They require ethical review and prospective evidence before even an experiment.

## 6. Outcome measurement and anti-engagement safeguards

### Public product metrics

- eligible users receiving at least one introduction;
- mutual-interest rate per reciprocal exposure;
- substantive-conversation rate using metadata-only definitions;
- mutually confirmed date and second-date intention rates;
- voluntary relationship/healthy-exit reports;
- median time to useful introduction and healthy exit;
- safety reports and upheld reports per exposure/conversation;
- exposure and outcome distributions across audited groups;
- loneliness/wellbeing measures only in separately consented research.

Every metric includes cohort, period, numerator, denominator, missingness, confidence interval where suitable, and whether it was preregistered.

The analytics funnel must never collapse distinct stages. Exposure, profile interest, mutual interest, reply, conversation, video/offline date, desired second date, relationship, satisfaction, duration, safety, and wellbeing remain separate outcomes. A change cannot be declared successful by improving an earlier proxy while harming or failing to measure later outcomes.

### Prohibited optimization and design

- no ads, premium tier, boosts, paid filters, affiliate lead sales, or data brokerage;
- no streaks, loot-box mechanics, artificial scarcity, infinite scroll, auto-play, or deceptive notifications;
- no ranking based on likelihood to pay, open, reply, remain single, or spend time;
- no withholding compatible people to increase retention;
- no secret A/B tests;
- no employee access to private data outside audited least-privilege workflows.

## 7. Research-backed rationale

The evidence register is normative for claims. Current high-level conclusions:

- Online access expands the pool, but commercial compatibility claims historically exceed their evidence.
- Individual romantic desire toward a particular person was not predictably captured by hundreds of pre-date traits in a multi-study machine-learning analysis.
- Across 43 longitudinal couple datasets, relationship-specific perceptions predicted current relationship quality more robustly than individual traits, but those variables largely do not exist before two people meet.
- Personality similarity should not be treated as a compatibility engine; large couple analyses find little or no incremental relationship-satisfaction effect.
- Dating is reciprocal, so both people’s boundaries and preferences matter; one-sided item recommendation is structurally wrong.
- Large choice sets and repeated rejection can worsen selection satisfaction in some experiments, although choice-overload effects are context-dependent and newer findings may conflict. Finite batches must therefore be tested, not asserted as fact.
- Harassment and unwanted sexual behavior are common and unevenly distributed, making safety a core matching outcome.
- Exact location and intimate profile fields create concrete re-identification and physical-safety risks.

## 8. Release plan

### Phase 0 — discovery and governance (3–6 months)

Form the nonprofit, independent safety and research boards, conduct participatory research, publish threat model/data map, select a pilot community, preregister success metrics, and prototype without real profiles.

Exit criteria: governance operating; ethics pathway approved; at least 40 diverse qualitative participants across underserved groups; accessibility and safety review; no unresolved critical threat.

### Phase 1 — closed research pilot

200–500 adults in one dense region, invite-only, manual safety coverage, deterministic v0 matching, conservative feature set. Measure operational feasibility—not efficacy marketing.

Exit criteria: support targets met, critical abuse mitigations tested, deletion/export verified, sufficient reciprocal opportunity for pilot groups, independent review permits expansion.

### Phase 2 — prospective validation

Preregister comparison of transparent variants using outcome metrics and equitable exposure. No engagement objective. Publish negative and null findings.

### Phase 3 — public local launch

Expand one locality at a time only when safety operations and pool composition pass published thresholds. Federation is a research track, not MVP.

## 9. Acceptance criteria for MVP

- One codebase produces Android and iOS apps; essential flows work on accessible web.
- A user can understand why every introduction appeared and reproduce the score.
- No network request is needed for the local score calculator.
- Hard boundaries are verified with property-based and adversarial tests.
- All data fields appear in a machine-readable public data inventory.
- Account deletion completes within the published window and is integration-tested.
- Report, block, and appeal workflows pass survivor-informed review.
- No analytics event measures dwell time or scrolling.
- Reproducible transparency report generated from privacy-reviewed aggregate queries.
- Independent security assessment completed before open registration.

The executable accessibility baseline also requires visible keyboard focus,
reflow without horizontal scrolling at 320 CSS pixels, reduced-motion
preference support, scalable native text without a fixed-height tab-bar clip,
and programmatic announcement of important status/error changes. Automated
checks cannot substitute for VoiceOver, TalkBack, switch-control, keyboard-only,
and maximum text-size testing on physical release devices.

## 10. Open questions

### Mission and governance

1. Which jurisdiction and nonprofit form best prevents acquisition or demutualization?
2. Should users elect board seats, and how are vulnerable/minority users protected from simple-majority governance?
3. What funding sources and donation concentration limits prevent influence?
4. Who has emergency authority to change matching or moderation, and how is it reviewed?

### Population and inclusion

5. Which single pilot region and initial relationship intentions provide adequate density?
6. How should the app support monogamous, non-monogamous, asexual, disabled, trans, and nonbinary users without unsafe disclosure or fragmented pools?
7. Which languages and cultural adaptations are necessary before launch?
8. Should age minimum be 18 everywhere or higher in some regions/cohorts?

### Matching and evidence

9. What exactly counts as success: date, desired second date, relationship, wellbeing, or user-defined goal?
10. What batch size and cadence balance agency, opportunity, and overload for different users?
11. Which compatibility constructs have prospective, out-of-sample predictive validity before meeting?
12. How should stated preferences be balanced with evidence that stated and revealed choices can diverge—without covert inference?
13. What exposure-fairness definition is legitimate in a reciprocal, heterogeneous market?
14. How can exploration be understandable and consensual without reducing dignity to an experiment?
15. When should a formula change require a vote, expert approval, or both?

### Safety, privacy, and moderation

16. Is identity or photo verification net-beneficial after considering exclusion, biometric risk, false confidence, and stalking?
17. Which data can moderators access, under what threshold, and for how long?
18. How can cross-account repeat abuse be detected while honoring deletion and avoiding permanent biometric identifiers?
19. What reporting SLA is feasible 24/7, and what launch size can safely be supported?
20. How should credible off-platform harm reports, legal orders, and appeals be handled across jurisdictions?
21. Can research outcomes be collected without creating a sensitive relationship-history database?

### Product

22. Are photos shown first, alongside context, or after selected compatibility information?
23. Should messaging be unlimited, rate-limited, or intentionally moved toward an offline/video meeting?
24. Which notifications are genuinely useful and non-coercive?
25. Should users browse/search in addition to finite introductions, and how would that affect exposure fairness?
26. How are inactive, traveling, or intermittently available people represented honestly?

### Engineering and operations

27. Native apps versus shared Expo UI after accessibility/performance prototypes?
28. Centralized service versus federation; who carries moderation responsibility across servers?
29. Which minimal analytics system can publish outcomes without surveillance?
30. What is the sustainable per-user operating cost and reserve requirement?
31. Which app-store policies constrain donation prompts, account deletion, moderation, or research consent?

## 11. Decisions required before coding beyond prototype

Pilot jurisdiction/region, nonprofit legal form, target relationship scope, verification stance, research ethics partner, moderation coverage model, success outcome hierarchy, data-retention schedule, initial batch experiment, and governance ratification process.
