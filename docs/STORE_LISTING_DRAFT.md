# Mobile store listing draft

Status: internal draft for OpenMatch 0.1.0. Do not submit unchanged until every
placeholder and disclosure has been reviewed against the deployed service.

## Shared public copy

### Name

OpenMatch

### Short description / subtitle

Transparent introductions, not endless swiping

### Promotional sentence

A small set of reciprocal introductions, with every matching input and score
explained.

### Full description

OpenMatch is an open-source introduction app designed to help compatible people
meet—not keep them browsing.

You set your own profile, boundaries, and priorities. OpenMatch first checks
that important boundaries work in both directions. It then orders eligible
introductions with a simple public formula that considers both people’s stated
preferences. You can inspect every contribution to your score.

There is no infinite feed, advertising, premium ranking, boost, streak, public
popularity score, or hidden engagement model. A conversation opens only after
mutual interest. Passes remain private and are not punished.

Current features include:

- finite batches of introductions;
- editable mutual boundaries and matching priorities;
- a complete explanation for every score;
- saved introductions;
- mutual text conversations without read receipts;
- unmatch, mute, block, and structured report controls;
- scam-warning friction for links and payment requests;
- data export, pause, hide, and account deletion;
- public source code, research evidence, algorithm decisions, data inventory,
  privacy notice, and known limitations.

OpenMatch does not claim to calculate love, attraction, relationship success,
or safety. Research can help identify obvious incompatibilities and guide
testable product choices, but chemistry still requires human judgment and a
real interaction.

This release is a restricted prototype. It is not an open public dating
service, and its small test pool is not evidence that its matching method is
effective or fair for a population.

### Keywords

dating, introductions, transparent matching, open source, nonprofit,
relationships, privacy

Review the word “nonprofit” before submission. It describes the intended
governance model but must not imply that a legal nonprofit entity already
exists if one has not been formed.

## Required public URLs

- Marketing: `[PUBLIC_HTTPS_ORIGIN]/`
- Privacy: `[PUBLIC_HTTPS_ORIGIN]/privacy`
- Support: `[PUBLIC_HTTPS_ORIGIN]/support`
- Source: `https://github.com/jannis-cmd/openmatch`

The current tailnet URLs are acceptable only for owner/internal testing. Store
reviewers and public users cannot be expected to join a private tailnet.

## App Review notes draft

OpenMatch is a transparent, finite-introduction prototype. It does not sell
subscriptions, rankings, boosts, advertisements, or digital goods. All matching
inputs are entered by the user. The deterministic matching source and formula
are public. No message text is used for matching or analytics.

Account deletion is available in Profile and synchronously removes the account
credential state, sessions, and isolated application store in the current
service. Research and account-directory participation are separate, reversible
choices and default off.

The current build connects to a private tailnet and therefore is suitable only
for internal testing. Before review, replace this paragraph with a reachable
review environment and provide `[REVIEW_ACCOUNT]` plus precise setup steps. Do
not provide a shared production credential.

Contact name: `[REVIEW_CONTACT_NAME]`

Phone: `[REVIEW_CONTACT_PHONE]`

Email: `[PRIVATE_REVIEW_CONTACT_EMAIL]`

## Screenshot plan

Use real UI with synthetic profiles and no personal tester data.

1. Landing / mission: “Made to help you leave.”
2. Finite introductions: one profile with visible score and no infinite feed.
3. Full calculation: both directed fits, harmonic mean, and selection mode.
4. Preferences: mutual boundaries separated from ordering priorities.
5. Mutual conversation: clear authorship plus mute/unmatch/report controls.
6. Transparency: source, evidence, decisions, privacy, and known limitations.

Do not show an inbox, email address, recovery code, session token, report
details, or identifiable conversation in store media.

## Apple privacy-label working draft

This is a mapping aid, not a completed App Store Connect answer. Review Apple’s
current definitions and the deployed vendors before submission.

Potential linked-to-user data:

- contact information: primary and optional backup email;
- user content: profile fields including self-described gender, prompt answers,
  text messages, reports;
- identifiers: internal account, profile, session, connection, and report IDs;
- coarse location: self-entered approximate city or region;
- preferences and other data: boundaries, priorities, decisions, consent,
  private self-routing and gender-group preferences, saved introductions,
  account state, meeting-planning preference.

Current purposes:

- app functionality;
- account management and security;
- safety/report handling when operational capacity exists;
- separately consented research only if an approved protocol later collects
  research data.

Not used for third-party advertising, first-party advertising, data brokerage,
or engagement-based personalization. Matching personalization uses only the
explicit preferences described in the app.

## Google Play data-safety working draft

Review the final build, server, SMTP provider, Tailscale/public hosting,
monitoring, and support vendors before answering the Play Console form.

- Data is encrypted in transit: yes for distributed builds, using HTTPS.
- Account deletion request: in-app synchronous deletion exists in the
  prototype; a public web deletion path and operational verification may still
  be required by current policy.
- Data sharing: public profile disclosure to mutually eligible users is an
  app-function disclosure authorized by separate directory consent; message
  delivery discloses deliberate text to the matched recipient. Vendor
  processing and policy definitions require legal review.
- Optional data: backup notification email, pronouns, research consent, and
  several profile fields are optional. A gender description and explicit
  public/private discovery choices are required only to enter matching; they
  are sensitive user content and preferences. Required-vs-optional answers
  must match the final onboarding UI.

## Content and age-rating review

OpenMatch is adults-only and should not be represented as suitable for
children. User-generated profiles, dating conversations, and safety reports can
contain mature themes. Final age-rating answers require review of store-specific
questionnaires and the actual moderation operation.

## Submission blockers

- active Apple Developer Program membership and accepted agreements;
- public HTTPS service and public marketing/privacy/support URLs;
- accountable legal operator and authorized public/private contact channels;
- staffed moderation, appeals, safety, privacy, and incident response;
- reviewer-accessible environment and non-shared review account;
- final screenshots captured from reviewed binaries with synthetic data;
- Apple privacy and Google data-safety forms checked against all vendors;
- age/content declarations;
- independent security, accessibility, legal, and DPIA review;
- Google Play Console enrollment and tester-track setup.
