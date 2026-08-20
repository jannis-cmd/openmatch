# Dating data model 1.0

Status: implemented storage and API contract; not all fields influence the live matching algorithm.

The canonical TypeScript contract is `packages/matching/src/data-model.ts`. The service stores the person's settings as one versioned record and operational observations as individually consent-versioned records. This separation is deliberate: defining a possible feature is not permission to collect it, and collecting it is not permission to rank with it.

## Record map

| Record | What it contains | Visibility | Default matching use |
| --- | --- | --- | --- |
| Existing `Profile` | age, gender identity/routing groups, approximate region, bio, prompt, values, basic lifestyle, current profile photo | selected public fields | eligibility and explicit fit |
| `ProfileAttributes` | orientation, language, education, occupation, relationship form/status, children, religion, politics, lifestyle, interests, voluntary personality/values/goals and verification results | private unless the person marks the field shown | none until a published algorithm version enables a field |
| `ProfileVisibilitySettings` | shown/hidden choice per sensitive profile section | person only | never |
| `DiscoveryCriteria` | accepted values and one importance per field: not used, preference, important, dealbreaker | person only | hard filters or user-weighted fit |
| `BehaviorEvent` | explicit impression/choice event plus coarse, optional client metadata and selection propensity | person only | pair prediction only after opt-in |
| `MatchFunnelEvent` | match, message, reply, conversation threshold and user-reported offline steps | person only | evaluation; prediction only where disclosed |
| `CommunicationMetadataAggregate` | counts, coarse length/latency buckets and reciprocity; never message text | person only | off by default |
| `ActivityAggregate` | coarse period totals and time buckets | person only | off by default; never a direct heavy-user boost |
| `ProfileQualityFeatures` | completeness and presentation metadata | person only | never a human-quality or attractiveness score |
| `PairFeatures` | distance band, shared interests, explicit two-way fit, and optional pair measures | service private | versioned pair prediction |
| `PairPrediction` | both directed interest probabilities, mutual probability, downstream probability, uncertainty and explanation IDs | service private | eligible models only |
| `RecommendationDecision` | hard-filter trace, every score component, exploration mode/probability and public seed | person can export/audit | audit record, not a feature |
| `InteractionFeedback` | voluntary meeting/quality/future-contact responses and optional unmatch reason | person only | structured answers are off by default; free text is never a ranking input |
| `SafetySignal` | source, confidence, review state and action | service private | safety review; never an automatic popularity penalty |

Raw verification documents, biometric templates, precise coordinates, movement histories, device fingerprints, invisible message-content ranking features, and a global attractiveness/Elo score are outside the model.

## Preference semantics

Every supported criterion carries its own importance. `dealbreaker` is an eligibility boundary, `important` and `preference` are visible soft priorities, and `not_used` removes the field. A generic dealbreaker record exists for narrow future fields, but clients should prefer the typed criterion wherever one exists.

Similarity and complementarity are not universal defaults:

- Explicit goals and constraints such as relationship form, children, smoking and maximum distance are treated as agreement/boundary questions.
- Shared interests, values and communication preferences may be similarity features only when the person enables them.
- Personality complementarity is research-only. The voluntary BFI-2-XS representation is stored, but no personality score enters the current algorithm because the existing evidence review does not justify it.
- Politics and religion remain sensitive explicit choices. They are never inferred from text or behavior.

## Personalized prediction

The model represents directed probabilities separately:

```text
P(mutual interest A,B) = P(A interested in B) × P(B interested in A)
```

The product may later evaluate an interaction objective such as:

```text
P(mutual interest) × P(reciprocal conversation | match)
```

It must not silently optimize time in app, swipe volume, message volume, or subscription conversion. “Date” and “positive interaction” remain voluntary self-reports, not inferred facts. Exact score weights are not scientific facts; any new weight set requires a named model version, a model card, offline calibration/fairness results, a preregistered pilot outcome, and a rollback rule.

The proposed 30/20/15/15/10/5/5 split from the design notes is therefore represented by score components but is **not** installed as a validated production policy.

## Exploration and cold start

An exploration policy separates scored, uncertainty, diversity and publicly seeded random slots. Shares must sum to one and appear in the decision record. Cold start uses explicit preferences plus seeded diversity. Behavior can only supplement explicit choices after opt-in; it never overwrites them. Selection probability is retained with observations so later evaluation can correct for what the existing policy chose to show.

## Consent and retention

All optional learning controls default off:

- behavioral learning
- interaction-outcome learning
- activity timing
- local bio classification
- local message classification

Research use is governed by the separate research-consent receipt, so it cannot be enabled indirectly through matching settings.

Accepted operational records carry the notice version active at collection. The API refuses behavior and interaction feedback when the corresponding control is off. Export 1.2 includes settings, policies and records. Local-data reset and account deletion remove the records synchronously. Rolling 30/90-day enforcement is part of the production-readiness gate; the prototype currently guarantees deletion at reset/account deletion.

Local classification means on-device processing with only person-confirmed categories leaving the device. It does not mean silent server analysis. Message classification is not a ranking input even when enabled; it is reserved for user-facing safety assistance.

## API

- `GET /v1/data-model`: model version, current settings, public field policies and prohibited derived scores.
- `PATCH /v1/data-model`: replace and validate the complete settings record.
- `POST /v1/data-model/behavior-events`: consent-gated event ingestion.
- `POST /v1/data-model/interaction-feedback`: consent-gated voluntary outcome feedback.
- `GET /v1/me/export`: export settings, field catalogue and all retained records.
- `DELETE /v1/me` or authenticated account deletion: remove the data.

Prediction and recommendation writes are internal service operations. A client cannot submit its own ranking score.

## Open implementation gates

1. Replace the legacy single-photo field with ordered media assets and migration support before exposing the new media model in clients.
2. Build accessible preset editors for the structured profile and per-field importance model on web, iOS and Android.
3. Decide which shown fields are disclosed in introductions, and test that private criteria never leak through explanations.
4. Validate an appropriate translated BFI-2-XS license/instrument flow before shipping the voluntary questionnaire.
5. Preregister what “positive interaction” means and how missing/self-selected outcome reports will be handled.
6. Define cohort fairness audits without using protected attributes as hidden desirability proxies.
7. Implement rolling retention jobs and independently test deletion across backups before a real pilot.
8. Publish model cards and calibration plots before enabling any learned pair probability.
