import assert from "node:assert/strict";
import test from "node:test";
import {
  createIntroduction,
  createIntroductions,
  conversationStarter,
  defaultPreferences,
  demoCandidates,
  demoUser,
  explainMatch,
  messageSafetyFlags,
  nearestPriority,
  nextWeeklyBatchAt,
  priorityLabel,
  proximityCompatibility,
  publicWeeklySeed,
  suggestPreferenceWeights,
  validatePreferences,
  validateProfile,
  type Profile,
} from "../src/index.ts";

test("a failed boundary makes a pair ineligible", () => {
  const result = explainMatch({
    boundaries: [
      {
        id: "intent",
        label: "Relationship intention",
        satisfiedForA: true,
        satisfiedForB: false,
      },
    ],
    factors: [],
  });
  assert.equal(result.eligible, false);
  assert.equal(result.finalScore, 0);
  assert.deepEqual(result.failedBoundaries, ["Relationship intention"]);
});

test("the harmonic mean represents reciprocal fit", () => {
  const result = explainMatch({
    boundaries: [],
    factors: [
      {
        id: "values",
        label: "Selected values",
        compatibilityA: 0.5,
        compatibilityB: 0.5,
        weightA: 1,
        weightB: 0,
      },
    ],
  });
  assert.equal(result.directedFitA, 0.5);
  assert.equal(result.directedFitB, 1);
  assert.ok(Math.abs(result.reciprocalFit - 2 / 3) < 1e-12);
  assert.equal(result.hiddenFactors, false);
});

test("invalid or excessive exposure adjustment is rejected", () => {
  assert.throws(
    () => explainMatch({ boundaries: [], factors: [], exposureFactor: 1.11 }),
    RangeError,
  );
});

test("proximity is full inside ideal radius and declines to the maximum", () => {
  assert.equal(
    proximityCompatibility({ kilometers: 5, idealWithinKm: 10, maximumKm: 50 }),
    1,
  );
  assert.equal(
    proximityCompatibility({
      kilometers: 30,
      idealWithinKm: 10,
      maximumKm: 50,
    }),
    0.5,
  );
  assert.equal(
    proximityCompatibility({
      kilometers: 50,
      idealWithinKm: 10,
      maximumKm: 50,
    }),
    0,
  );
});

test("preference learning only suggests and requires enough mixed feedback", () => {
  const observations = Array.from({ length: 20 }, (_, index) => ({
    interested: index < 10,
    factors: { outdoors: index < 10 ? 0.9 : 0.2 },
    selectionProbability: 1,
  }));
  const [suggestion] = suggestPreferenceWeights({
    observations,
    currentWeights: { outdoors: 0.5 },
  });
  assert.equal(suggestion.factorId, "outdoors");
  assert.ok(suggestion.suggestedWeight > suggestion.currentWeight);
  assert.equal(suggestion.confidence, "low");
  assert.match(suggestion.caveat, /Nothing changes unless you accept/);
  assert.deepEqual(
    suggestPreferenceWeights({
      observations: observations.slice(0, 10),
      currentWeights: {},
    }),
    [],
  );
});

test("candidate generation excludes hard-boundary failures and orders eligible profiles", () => {
  const introductions = createIntroductions(
    demoUser,
    demoCandidates,
    defaultPreferences,
  );
  assert.deepEqual(
    introductions.map((item) => item.profile.id),
    ["mara", "noah", "lea"],
  );
  assert.ok(introductions.every((item) => item.explanation.eligible));
  assert.ok(
    introductions[0].explanation.finalScore >=
      introductions[1].explanation.finalScore,
  );
  assert.equal(introductions[0].profile.distanceBand, "Within 5 km");
  assert.equal("distanceKm" in introductions[0].profile, false);
});

test("public-seed exploration reserves a reproducible slot without changing scores", () => {
  const baseline = createIntroductions(
    demoUser,
    demoCandidates,
    defaultPreferences,
  );
  const options = {
    weeklySeed: "2026-08-10",
    explorationSlots: 1,
    limit: 2,
  };
  const first = createIntroductions(
    demoUser,
    demoCandidates,
    defaultPreferences,
    options,
  );
  const repeated = createIntroductions(
    demoUser,
    demoCandidates,
    defaultPreferences,
    options,
  );
  assert.deepEqual(
    first.map(({ profile }) => profile.id),
    repeated.map(({ profile }) => profile.id),
  );
  assert.equal(first.length, 2);
  assert.equal(
    first.filter((item) => item.explanation.selectionMode === "exploration")
      .length,
    1,
  );
  const exploratory = first.find(
    (item) => item.explanation.selectionMode === "exploration",
  );
  assert.ok(exploratory);
  assert.equal(exploratory.explanation.selectionProbability, 1 / 3);
  assert.equal(exploratory.explanation.weeklySeed, "2026-08-10");
  assert.equal(
    exploratory.explanation.finalScore,
    baseline.find((item) => item.profile.id === exploratory.profile.id)
      ?.explanation.finalScore,
  );
});

test("the weekly public seed is the UTC Monday date", () => {
  assert.equal(
    publicWeeklySeed(new Date("2026-08-16T23:59:59.000Z")),
    "2026-08-10",
  );
  assert.equal(
    publicWeeklySeed(new Date("2026-08-17T00:00:00.000Z")),
    "2026-08-17",
  );
  assert.equal(
    nextWeeklyBatchAt(new Date("2026-08-16T23:59:59.000Z")),
    "2026-08-17T00:00:00.000Z",
  );
  assert.equal(
    nextWeeklyBatchAt(new Date("2026-08-17T00:00:00.000Z")),
    "2026-08-24T00:00:00.000Z",
  );
});

test("candidate-side boundaries are real inputs, not assumed true", () => {
  const candidate = structuredClone(demoCandidates[0]);
  candidate.preferences.ageMin = demoUser.age + 1;
  const [introduction] = createIntroductions(
    demoUser,
    [candidate],
    defaultPreferences,
  );
  assert.equal(introduction, undefined);
});

test("gender discovery requires both people's explicit choices", () => {
  const candidate = structuredClone(demoCandidates[0]);
  const viewerPreferences = structuredClone(defaultPreferences);
  viewerPreferences.genderGroups = ["women"];
  candidate.preferences.genderGroups = ["men"];
  const excluded = createIntroduction(demoUser, candidate, viewerPreferences);
  assert.equal(excluded.explanation.eligible, false);
  assert.deepEqual(excluded.explanation.failedBoundaries, [
    "Mutual gender discovery choices",
  ]);

  candidate.preferences.genderGroups = ["nonbinary_people"];
  const reciprocal = createIntroduction(demoUser, candidate, viewerPreferences);
  assert.equal(reciprocal.explanation.eligible, true);
});

test("candidate-side weights change only their directed fit", () => {
  const lowValues = structuredClone(demoCandidates[1]);
  const highValues = structuredClone(demoCandidates[1]);
  lowValues.preferences.weights.values = 0;
  highValues.preferences.weights.values = 1;
  const low = createIntroductions(demoUser, [lowValues], defaultPreferences)[0]
    .explanation;
  const high = createIntroductions(
    demoUser,
    [highValues],
    defaultPreferences,
  )[0].explanation;
  assert.equal(low.directedFitA, high.directedFitA);
  assert.notEqual(low.directedFitB, high.directedFitB);
});

test("candidate trace sharing changes disclosure, never the score", () => {
  const privateCandidate = {
    ...structuredClone(demoCandidates[0]),
    explanationSharing: "private" as const,
  };
  const sharedCandidate = {
    ...structuredClone(demoCandidates[0]),
    explanationSharing: "shared" as const,
  };
  const hidden = createIntroductions(
    demoUser,
    [privateCandidate],
    defaultPreferences,
  )[0].explanation;
  const visible = createIntroductions(
    demoUser,
    [sharedCandidate],
    defaultPreferences,
  )[0].explanation;
  assert.equal(hidden.candidateTrace, "private");
  assert.equal(hidden.factorsForB, null);
  assert.equal(visible.candidateTrace, "shared");
  assert.ok(visible.factorsForB?.length);
  assert.equal(hidden.finalScore, visible.finalScore);
  assert.equal(hidden.directedFitB, visible.directedFitB);
});

test("swapping both people preserves reciprocal fit", () => {
  const candidate = demoCandidates[1];
  const forward = createIntroductions(
    demoUser,
    [candidate],
    defaultPreferences,
  )[0].explanation;
  const reverseCandidate = {
    profile: { ...demoUser, distanceKm: candidate.profile.distanceKm },
    preferences: defaultPreferences,
  };
  const reverse = createIntroductions(
    candidate.profile,
    [reverseCandidate],
    candidate.preferences,
  )[0].explanation;
  assert.ok(Math.abs(forward.reciprocalFit - reverse.reciprocalFit) < 1e-12);
});

test("invalid preferences are rejected before scoring or persistence", () => {
  assert.throws(
    () =>
      validatePreferences({ ...defaultPreferences, ageMin: 40, ageMax: 30 }),
    /age range/,
  );
  assert.throws(
    () =>
      validatePreferences({
        ...defaultPreferences,
        idealDistanceKm: 50,
        maximumDistanceKm: 20,
      }),
    /distance range/,
  );
  assert.throws(
    () =>
      validatePreferences({
        ...defaultPreferences,
        weights: { ...defaultPreferences.weights, values: 1.1 },
      }),
    /values weight/,
  );
  assert.throws(
    () =>
      validatePreferences({
        ...defaultPreferences,
        genderGroups: ["everyone" as "women"],
      }),
    /gender discovery/,
  );
});

test("invalid public profile fields are rejected", () => {
  assert.throws(() => validateProfile({ ...demoUser, name: "" }), /name/);
  assert.throws(() => validateProfile({ ...demoUser, age: 17 }), /age/);
  assert.throws(() => validateProfile({ ...demoUser, city: "" }), /details/);
  assert.throws(
    () => validateProfile({ ...demoUser, pronouns: "x".repeat(51) }),
    /details/,
  );
  assert.throws(
    () => validateProfile({ ...demoUser, gender: "x".repeat(51) }),
    /details/,
  );
  assert.throws(
    () =>
      validateProfile({
        ...demoUser,
        genderGroups: ["women", "women"],
      }),
    /details/,
  );
  assert.throws(() => validateProfile({ ...demoUser, bio: "" }), /biography/);
  assert.throws(
    () => validateProfile({ ...demoUser, promptAnswer: "" }),
    /prompt/,
  );
  assert.throws(() => validateProfile({ ...demoUser, values: [] }), /values/);
  assert.throws(
    () =>
      validateProfile({
        ...demoUser,
        values: ["Kindness", "kindness"],
      }),
    /values/,
  );
  assert.throws(
    () =>
      validateProfile({
        ...demoUser,
        lifestyle: { ...demoUser.lifestyle, schedule: "always" as "early" },
      }),
    /lifestyle/,
  );
  assert.throws(
    () =>
      validateProfile({
        ...demoUser,
        readiness: "Maybe" as Profile["readiness"],
      }),
    /readiness/,
  );
});

test("the public priority scale has four understandable levels", () => {
  assert.equal(priorityLabel(0), "Off");
  assert.equal(priorityLabel(0.34), "Low");
  assert.equal(priorityLabel(0.7), "Medium");
  assert.equal(nearestPriority(0.95), 1);
});

test("conversation starters only reuse visible human-written profile text", () => {
  assert.equal(
    conversationStarter(demoCandidates[0].profile),
    `You mentioned “${demoCandidates[0].profile.promptAnswer}” — I’d enjoy hearing more about that.`,
  );
});

test("message safety friction uses narrow published link and payment rules", () => {
  assert.deepEqual(messageSafetyFlags("Would you like coffee on Sunday?"), []);
  assert.deepEqual(
    messageSafetyFlags("See https://example.com/details").map(({ id }) => id),
    ["external_link"],
  );
  assert.deepEqual(
    messageSafetyFlags("Please send money by bank transfer").map(
      ({ id }) => id,
    ),
    ["payment_request"],
  );
  assert.deepEqual(
    messageSafetyFlags("Pay €50 at example.com").map(({ id }) => id),
    ["external_link", "payment_request"],
  );
});

test("public meeting readiness is disclosure, never a matching input", () => {
  const candidate = structuredClone(demoCandidates[0]);
  const before = createIntroductions(
    demoUser,
    [candidate],
    defaultPreferences,
  )[0];
  candidate.profile.readiness =
    candidate.profile.readiness === "Ready to meet in person"
      ? "Prefer to chat first"
      : "Ready to meet in person";
  const after = createIntroductions(
    demoUser,
    [candidate],
    defaultPreferences,
  )[0];
  assert.equal(before.explanation.finalScore, after.explanation.finalScore);
  assert.deepEqual(
    before.explanation.factorsForA,
    after.explanation.factorsForA,
  );
  assert.notEqual(before.profile.readiness, after.profile.readiness);
});

test("generated adversarial cases preserve matching invariants", () => {
  let state = 0x4f50454e;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  for (let index = 0; index < 2000; index += 1) {
    const factors = Array.from(
      { length: 1 + (index % 5) },
      (_, factorIndex) => ({
        id: `factor-${factorIndex}`,
        label: `Factor ${factorIndex}`,
        compatibilityA: random(),
        compatibilityB: random(),
        weightA: random(),
        weightB: random(),
      }),
    );
    const exposureFactor = 1 + random() * 0.1;
    const baseline = explainMatch({ boundaries: [], factors, exposureFactor });
    assert.ok(baseline.directedFitA >= 0 && baseline.directedFitA <= 1);
    assert.ok(baseline.directedFitB >= 0 && baseline.directedFitB <= 1);
    assert.ok(baseline.reciprocalFit >= 0 && baseline.reciprocalFit <= 1);
    assert.ok(baseline.finalScore >= 0 && baseline.finalScore <= 1);

    const swapped = explainMatch({
      boundaries: [],
      exposureFactor,
      factors: factors.map((factor) => ({
        ...factor,
        compatibilityA: factor.compatibilityB,
        compatibilityB: factor.compatibilityA,
        weightA: factor.weightB,
        weightB: factor.weightA,
      })),
    });
    assert.ok(Math.abs(baseline.reciprocalFit - swapped.reciprocalFit) < 1e-12);
    assert.ok(Math.abs(baseline.finalScore - swapped.finalScore) < 1e-12);

    const improvedFactors = structuredClone(factors);
    improvedFactors[0].compatibilityA = Math.min(
      1,
      improvedFactors[0].compatibilityA + 0.1,
    );
    const improved = explainMatch({
      boundaries: [],
      factors: improvedFactors,
      exposureFactor,
    });
    assert.ok(improved.directedFitA + 1e-12 >= baseline.directedFitA);
    assert.ok(improved.reciprocalFit + 1e-12 >= baseline.reciprocalFit);
    assert.ok(improved.finalScore + 1e-12 >= baseline.finalScore);

    for (const [satisfiedForA, satisfiedForB] of [
      [false, false],
      [false, true],
      [true, false],
    ] as const) {
      const rejected = explainMatch({
        factors,
        exposureFactor,
        boundaries: [
          {
            id: "adversarial-boundary",
            label: "Adversarial boundary",
            satisfiedForA,
            satisfiedForB,
          },
        ],
      });
      assert.equal(rejected.eligible, false);
      assert.equal(rejected.finalScore, 0);
      assert.deepEqual(rejected.failedBoundaries, ["Adversarial boundary"]);
    }
  }

  const noPriorities = explainMatch({
    boundaries: [],
    factors: [
      {
        id: "off",
        label: "Turned off",
        compatibilityA: 0,
        compatibilityB: 0,
        weightA: 0,
        weightB: 0,
      },
    ],
  });
  assert.equal(noPriorities.directedFitA, 1);
  assert.equal(noPriorities.directedFitB, 1);
  assert.equal(noPriorities.finalScore, 1);
});
