# OpenMatch product decisions

Status: baseline decisions for the bilingual prototype. Every item can be changed through a public proposal with evidence and a migration plan.

## Language and internationalization

- German (`de`) is the default for the current Swiss beta; English (`en`) is the complete second launch language.
- Locale selection accepts BCP 47 tags such as `de-CH` and `en-GB`, resolves them to the current base-language catalogs, and keeps language separate from location, nationality, ethnicity, and matching.
- The UI provides an explicit language choice. New languages add a catalog and review; stored canonical option IDs are never translated, so adding a language does not corrupt filters or analytics.
- Free text remains in the language written by the person. OpenMatch does not silently translate or classify it for ranking.

## Profile and preference defaults

- Structured choices are used for every filterable attribute. Bio, prompt answer, pronouns, occupation and optional identity self-description remain free text and are never hard-filter inputs.
- Adults only. Age, reciprocal gender discovery, maximum coarse-region distance, relationship intention, smoking and children plans can be explicit boundaries.
- Religion and political identity are optional, private by default, user-controlled and never inferred. They may become explicit boundaries only after a dedicated discrimination, safety, sparsity and legal review.
- Values, interests, education, occupation, personality and profile completeness are never automatic exclusion criteria. They may provide an editable, low-stakes explanation only after validation.
- The current simple algorithm favors mutual eligibility and reciprocal fit. It does not use a global desirability/Elo score, appearance inference, paid boosts or time-in-app optimization.

## Photos and sensitive data

- Target: up to six ordered photos, with one required for a public pilot. The baseline currently supports one optional compressed image and must migrate before launch.
- No face recognition, attractiveness score, body inference, identity inference or photo-derived preference learning.
- Orientation, relationship status, religion, politics and personality measurements are hidden by default and shared only through granular consent.

## Behavior and outcomes

- Swipe behavior may only produce visible, editable preference suggestions after sufficient observations; it never silently changes ranking.
- Message contents are not ranking inputs. Safety checks remain narrow, disclosed client-facing warnings and do not become compatibility features.
- There is no forced first writer and no minimum message length in the baseline. Optional conversation prompts create less coercion and should be tested first.
- Match, message volume and time in app are not definitions of success. Optional structured feedback—met, wanted another date, relationship started—is separately consented and may be deleted.
- Exploration remains a small, published part of each finite batch to reduce filter bubbles. New profiles must not be penalized for missing popularity history.

## Administration

- Admin identities, sessions and routes are separate from user identities. Sessions expire after 30 minutes.
- Admin currently sees only service health and aggregate counts. It cannot read profiles, preferences, precise locations or messages.
- Every admin authorization is checked per request and security-relevant actions are audited without IP, device fingerprint, token or personal content.
- The current Tailnet-only prototype may use a password. MFA, named individual accounts, recovery, audit retention, key rotation and emergency revocation are release blockers before public internet exposure.

## Open decisions before a public pilot

- Validate every German and English string with native speakers and accessibility testing.
- Define the lawful nonprofit entity, moderation duty, age assurance, jurisdiction, data controller and incident response.
- Choose and document coarse-location representation and a minimum-anonymity rule for sparse areas.
- Decide whether religion/politics boundaries create more autonomy than harm, using pre-registered research and fairness analysis.
- Validate which similarity factors predict mutually reported positive outcomes rather than app engagement. Do not ship complementarity claims without evidence.
- Implement six-photo storage, moderation and deletion without introducing image inference.
- Recruit representative pilot participants and publish sample sizes, missingness, negative outcomes, subgroup uncertainty and all algorithm changes.
