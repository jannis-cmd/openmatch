import assert from "node:assert/strict";
import test from "node:test";
import {
  DATA_FIELD_POLICIES,
  PROPOSED_RANKING_POLICY,
  defaultDatingDataSettings,
  validateBehaviorEvent,
  validateDatingDataSettings,
  validateInteractionFeedback,
  validatePairPrediction,
  validateTransparentRankingPolicy,
} from "../src/index.ts";

test("the dating data model is private and learning-free by default", () => {
  const model = defaultDatingDataSettings();
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(model.collection).filter(
        ([key]) =>
          key.endsWith("Learning") ||
          key === "activityTiming" ||
          key.startsWith("local") ||
          false,
      ),
    ),
    {
      behavioralLearning: false,
      interactionOutcomeLearning: false,
      activityTiming: false,
      localBioClassification: false,
      localMessageClassification: false,
    },
  );
  assert.equal(model.discoveryCriteria.age.importance, "dealbreaker");
  assert.equal(model.discoveryCriteria.distanceKm.importance, "dealbreaker");
  assert.deepEqual(validateDatingDataSettings(model), model);
  assert.equal(
    validateTransparentRankingPolicy(PROPOSED_RANKING_POLICY).status,
    "draft_not_active",
  );
});

test("every ranking-capable data family has a public field policy", () => {
  assert.equal(
    DATA_FIELD_POLICIES.messageContentClassification.rankingUse,
    "never",
  );
  assert.equal(
    DATA_FIELD_POLICIES.interactionFeedbackFreeText.rankingUse,
    "never",
  );
  assert.equal(DATA_FIELD_POLICIES.safetySignals.rankingUse, "never");
  assert.equal(DATA_FIELD_POLICIES.profileQuality.rankingUse, "never");
  assert.equal(DATA_FIELD_POLICIES.recommendationDecision.rankingUse, "never");
  assert.equal(
    Object.values(DATA_FIELD_POLICIES).some(
      (policy) => policy.rankingUse === "pair_prediction",
    ),
    true,
  );
});

test("structured profile fields and user-selected importance validate", () => {
  const model = defaultDatingDataSettings();
  model.updatedAt = "2026-08-20T12:00:00.000Z";
  model.collection.updatedAt = model.updatedAt;
  model.profileAttributes.sexualOrientations = ["bisexual"];
  model.profileAttributes.languages = [
    { code: "de-CH", proficiency: "native" },
    { code: "en", proficiency: "fluent" },
  ];
  model.profileAttributes.relationshipForms = ["long_term", "monogamy"];
  model.profileAttributes.children = { status: "none", desire: "want" };
  model.discoveryCriteria.childrenDesire = {
    importance: "dealbreaker",
    accepted: ["want", "open"],
    relationship: "similarity",
  };
  model.discoveryCriteria.politics = {
    importance: "important",
    accepted: ["center_left", "left"],
    relationship: "similarity",
  };
  assert.deepEqual(validateDatingDataSettings(model), model);
});

test("invalid psychometrics, events, outcomes, and predictions are rejected", () => {
  const invalidAssessment = defaultDatingDataSettings();
  invalidAssessment.profileAttributes.personality.bigFive = {
    instrument: "BFI-2-XS",
    instrumentVersion: "2017",
    completedAt: "2026-08-20T12:00:00.000Z",
    scores: {
      openness: 1.1,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      negativeEmotionality: 0.5,
    },
  };
  assert.throws(
    () => validateDatingDataSettings(invalidAssessment),
    /Big Five assessment/,
  );

  assert.throws(
    () =>
      validateBehaviorEvent({
        id: "00000000-0000-4000-8000-000000000001",
        occurredAt: "2026-08-20T12:00:00.000Z",
        candidateId: "mara",
        kind: "interested",
        source: "explicit_action",
        sessionSequence: 1,
        dwellTimeBucket: null,
        viewedPhotoCount: null,
        bioOpened: null,
        selectionProbability: 0,
      }),
    /behavior event/,
  );
  assert.throws(
    () =>
      validateInteractionFeedback({
        id: "00000000-0000-4000-8000-000000000002",
        connectionId: "connection",
        recordedAt: "2026-08-20T12:00:00.000Z",
        metInPerson: null,
        wantsMoreProfilesLikeThis: null,
        positiveInteraction: null,
        wantedFurtherContact: null,
        unmatchReason: "not-a-reason" as never,
        freeText: "",
      }),
    /interaction feedback/,
  );
  assert.throws(
    () =>
      validatePairPrediction({
        id: "prediction",
        computedAt: "2026-08-20T12:00:00.000Z",
        expiresAt: "2026-08-21T12:00:00.000Z",
        personAId: "a",
        personBId: "b",
        modelVersion: "model-1",
        trainingDataNoticeVersion: "notice-1",
        probabilityAInterestedInB: 0.9,
        probabilityBInterestedInA: 0.7,
        probabilityMutualInterest: 1.2,
        probabilityConversationGivenMatch: null,
        probabilityPositiveInteraction: null,
        uncertainty: 0.2,
        featureFamiliesUsed: ["explicit_preferences"],
        explanationFeatureIds: ["shared_interests"],
      }),
    /pair prediction/,
  );
});
