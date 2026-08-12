# Transparent matching contract — v1 draft

## What the score means

The score estimates how well two profiles satisfy **the preferences they explicitly configured**. It does not estimate attraction, love, relationship quality, or personal worth.

## Formula

After mutual hard-constraint filtering:

```text
directedFit(A, B) = sum(weight(A,f) × compatibility(f,A,B)) / sum(weight(A,f))
reciprocalFit(A,B) = 2 × fit(A,B) × fit(B,A) / (fit(A,B) + fit(B,A))
finalScore = reciprocalFit × exposureFactor
```

Each side's `compatibility` and `weight` are explicit values in `[0,1]`. A symmetric factor such as selected-value overlap may have the same compatibility for both sides; a directional factor such as distance may differ because each person chooses their own ideal radius. Neither value is inferred from the other person's settings. `exposureFactor` defaults to `1` and, if enabled by governance, is bounded in `[1, 1.10]`. It may improve underexposed eligible profiles’ opportunity but may not lower anyone below their reciprocal fit.

If neither side selects soft factors, the reciprocal score is `1`: all mutually eligible profiles are equal and ordered by the published deterministic lottery.

The product UI intentionally exposes only four priority choices—Off, Low, Medium, and High—mapped publicly to `0`, `1/3`, `2/3`, and `1`. More granular numbers would suggest an unsupported precision. The kernel accepts continuous values so preregistered research can compare representations without silently changing the public mapping.

### Proximity

Proximity uses a coarse profile region, never live GPS. Each person chooses an ideal and maximum radius. Each directed compatibility is `1` inside that person's ideal radius, declines linearly and visibly, and reaches `0` at their maximum. Either maximum can make the pair ineligible. This reflects opportunity to meet, not a claim that closeness creates compatibility.

### Limited preference learning

The app may learn only from explicit Interested/Pass decisions on introductions actually shown. It does not read messages, dwell time, taps, photos, or notification behavior.

For each visible factor, the learner compares the mean compatibility among Interested and Passed profiles, corrects recorded exploration probability with capped inverse-propensity weights, and shrinks the difference toward zero when data are sparse. It requires at least 20 observations and at least five decisions of each kind. Fewer than 100 observations are labeled low confidence; 100 or more are merely moderate confidence.

The result is an **editable suggestion**, never an automatic weight change. It shows sample size, both means, estimated difference, current weight, proposed weight, formula version, and the warning that association in an exposed pool is neither causal preference nor relationship compatibility.

The API records one observation only when a person explicitly chooses Interested or Pass. It stores the visible A-side compatibility vector and the recorded selection probability, never the other person's private weights. `/v1/preferences/suggestions` returns the published minimum, confidence, caveat, and `automaticChanges: false`; accepting a suggestion uses the ordinary explicit preference-update path.

This design follows two evidence constraints: stated and revealed preferences can diverge, but observational choice data are confounded by which profiles the system exposed. Consequently, learning remains subordinate to user agency and controlled exploration. A multivariate or neural model is out of scope until it prospectively and equitably improves later relationship-relevant outcomes over this baseline.

### Candidate-set and ordering procedure

1. Resolve mutual identity/intention eligibility and hard boundaries.
2. Exclude blocks, resolved pairs, paused/inactive accounts, and pairs without safe geographic eligibility.
3. Calculate both directed fits from explicit current weights.
4. Combine with the harmonic mean.
5. Apply only the governed bounded exposure uplift.
6. For a five-person batch, reserve one slot (20%) from all eligible candidates using an FNV-1a lottery keyed by the user's internal ID, candidate internal ID, and the public UTC Monday date. Smaller user-selected batches currently reserve no exploration slot rather than making an outsized fraction experimental.
7. Sort non-exploration candidates by score and resolve exact ties with that same lottery.

The exploratory profile's position within the batch is also selected by the same public seed, avoiding a systematic first- or last-position advantage. The entire batch, mode, probability, and seed are then snapshotted so Save, Pass, refresh, or an app restart cannot redraw extra exploratory profiles. Profile, preference, batch-size, or weekly-seed changes intentionally create a fresh snapshot. Its selection probability is `1 / eligibleCandidateCount`; that value is recorded only if the person explicitly chooses Interested or Pass. The lottery changes selection, never eligibility or any score. This 20% allocation is a testable prototype hypothesis, not an evidence-backed optimum, and must be preregistered and compared against other allocations before a pilot.

The public weekly window starts Monday at `00:00 UTC`. The API publishes both the current seed and exact next boundary. Finishing a batch offers no “start over” action: Pass/Interested resolutions remain resolved, and a later window may contain only newly eligible profiles. The development reset endpoint is not exposed by either client and is not a product replenishment mechanism.

No swipe trains a global model of human desirability. Feedback belongs to the person who gave it, can be exported/deleted, and cannot reduce another person’s standing.

## Explanation object

Every result returns:

- algorithm version;
- eligible true/false and exact failed boundaries;
- each person’s directed score;
- reciprocal and final scores;
- every factor name, input compatibility, weight, and contribution;
- exposure adjustment and reason;
- whether the slot was exploratory;
- the exploration selection probability and public weekly seed;
- no hidden factors.

Algorithm transparency is not permission to expose another person's private settings. Candidate factor traces therefore default to private. A person may explicitly opt into sharing their trace; otherwise the explanation still states the public formula, both aggregate directed scores, the reciprocal result, and that private explicit inputs—but no undocumented system factors—were used. Redaction happens only after scoring and cannot change the result. The service never calls undisclosed personal data “public.” Whether even the aggregate candidate-directed score should be coarsened requires user research and privacy review before a real pilot.

## Forbidden inputs

Revenue, payment, session/dwell time, notification response, attractiveness prediction, private-message content, inferred protected characteristics, third-party data, and hidden desirability/popularity scores.

## Change control

Any production change requires a public proposal, executable tests, evidence entry, privacy/fairness impact assessment, plain-language diff, review window, approval under governance rules, version increment, and deployment hash. Emergency safety changes can ship first but require retrospective review and cannot introduce a ranking advantage.
