/**
 * Canonical data model for the dating product.
 *
 * This module separates user-authored facts, private preferences, observed
 * events, derived features, pair-specific predictions, recommendation
 * decisions, outcomes, and safety signals. A value existing in this schema
 * does not authorize collection or ranking use: CollectionSettings and the
 * public field catalogue are the enforceable boundary.
 */

export const DATING_DATA_MODEL_VERSION = "dating-data-model-1.0" as const;

export const SEXUAL_ORIENTATIONS = [
  "straight",
  "gay",
  "lesbian",
  "bisexual",
  "pansexual",
  "asexual",
  "demisexual",
  "queer",
  "questioning",
  "self_described",
] as const;
export type SexualOrientation = (typeof SEXUAL_ORIENTATIONS)[number];

export const RELATIONSHIP_FORMS = [
  "long_term",
  "short_term",
  "casual",
  "friendship",
  "monogamy",
  "ethical_non_monogamy",
  "polyamory",
  "figuring_it_out",
] as const;
export type RelationshipForm = (typeof RELATIONSHIP_FORMS)[number];

export const EDUCATION_LEVELS = [
  "secondary",
  "apprenticeship",
  "vocational",
  "bachelors",
  "masters",
  "doctorate",
  "other",
  "prefer_not_to_say",
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const RELATIONSHIP_STATUSES = [
  "single",
  "separated",
  "divorced",
  "widowed",
  "partnered_enm",
  "prefer_not_to_say",
] as const;
export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

export const CHILDREN_STATUSES = [
  "none",
  "has_children",
  "prefer_not_to_say",
] as const;
export const CHILDREN_DESIRES = [
  "want",
  "open",
  "do_not_want",
  "unsure",
  "prefer_not_to_say",
] as const;
export const SMOKING_STATUSES = [
  "never",
  "sometimes",
  "regularly",
  "quitting",
  "prefer_not_to_say",
] as const;
export const ALCOHOL_STATUSES = [
  "never",
  "sometimes",
  "regularly",
  "sober",
  "prefer_not_to_say",
] as const;

export const POLITICAL_IDENTITIES = [
  "left",
  "center_left",
  "center",
  "center_right",
  "right",
  "mixed",
  "apolitical",
  "self_described",
  "prefer_not_to_say",
] as const;

export const RELIGION_IDENTITIES = [
  "none",
  "agnostic",
  "atheist",
  "buddhist",
  "christian",
  "hindu",
  "jewish",
  "muslim",
  "sikh",
  "spiritual",
  "self_described",
  "prefer_not_to_say",
] as const;

export const INTEREST_CATEGORIES = [
  "arts_culture",
  "food_cooking",
  "games",
  "learning",
  "music",
  "nature_outdoors",
  "social_community",
  "sports_fitness",
  "technology",
  "travel",
  "wellbeing",
  "other",
] as const;
export type InterestCategory = (typeof INTEREST_CATEGORIES)[number];

export const COMMUNICATION_STYLES = [
  "direct",
  "reflective",
  "playful",
  "affectionate",
  "frequent_contact",
  "low_frequency",
  "conflict_calm",
  "needs_processing_time",
] as const;
export const HUMOR_STYLES = [
  "dry",
  "playful",
  "absurd",
  "witty",
  "storytelling",
  "dark",
  "gentle",
] as const;

export const SCHWARTZ_VALUE_GROUPS = [
  "self_direction",
  "stimulation",
  "hedonism",
  "achievement",
  "power",
  "security",
  "conformity",
  "tradition",
  "benevolence",
  "universalism",
] as const;

export type Language = {
  code: string;
  proficiency: "basic" | "conversational" | "fluent" | "native";
};

export type Interest = {
  label: string;
  category: InterestCategory;
  source: "user_selected" | "user_confirmed_local_classification";
};

export type BigFiveAssessment = {
  instrument: "BFI-2-XS";
  instrumentVersion: "2017";
  scores: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    negativeEmotionality: number;
  };
  completedAt: string;
};

export type ProfileAttributes = {
  sexualOrientations: SexualOrientation[];
  orientationSelfDescription: string;
  languages: Language[];
  educationLevel: EducationLevel | null;
  occupation: {
    status:
      | "employed"
      | "self_employed"
      | "student"
      | "between_roles"
      | "retired"
      | "other"
      | "prefer_not_to_say";
    industry: string;
    title: string;
  } | null;
  relationshipStatus: RelationshipStatus | null;
  relationshipForms: RelationshipForm[];
  children: {
    status: (typeof CHILDREN_STATUSES)[number];
    desire: (typeof CHILDREN_DESIRES)[number];
  } | null;
  religion: {
    identity: (typeof RELIGION_IDENTITIES)[number];
    selfDescription: string;
    importance: "not_important" | "somewhat" | "very";
  } | null;
  politics: {
    identity: (typeof POLITICAL_IDENTITIES)[number];
    selfDescription: string;
    importance: "not_important" | "somewhat" | "very";
  } | null;
  smoking: (typeof SMOKING_STATUSES)[number] | null;
  alcohol: (typeof ALCOHOL_STATUSES)[number] | null;
  lifestyleTags: string[];
  interests: Interest[];
  hobbies: string[];
  musicGenres: string[];
  leisureActivities: string[];
  travelPreferences: string[];
  personality: {
    bigFive: BigFiveAssessment | null;
    selfDescriptions: string[];
  };
  schwartzValues: Array<(typeof SCHWARTZ_VALUE_GROUPS)[number]>;
  lifeGoals: string[];
  communicationStyles: Array<(typeof COMMUNICATION_STYLES)[number]>;
  humorStyles: Array<(typeof HUMOR_STYLES)[number]>;
  socialPoliticalCauses: string[];
  linkedAccounts: Array<{
    provider: "instagram" | "spotify" | "other";
    displayLabel: string;
    verifiedByProvider: boolean;
  }>;
  verifications: Array<{
    kind: "email" | "phone" | "photo_liveness" | "identity_document";
    status: "pending" | "verified" | "failed" | "expired";
    verifiedAt: string | null;
    /** Verification result only; raw documents and biometric templates are forbidden. */
    evidenceRetained: false;
  }>;
};

export type PreferenceImportance =
  "not_used" | "preference" | "important" | "dealbreaker";
export type MatchRelationship =
  "similarity" | "complementarity" | "either" | "not_applicable";

export type CategoricalCriterion<T extends string = string> = {
  importance: PreferenceImportance;
  accepted: T[];
  relationship: MatchRelationship;
};
export type RangeCriterion = {
  importance: PreferenceImportance;
  minimum: number;
  maximum: number;
  idealMinimum: number;
  idealMaximum: number;
};

export type DiscoveryCriteria = {
  age: RangeCriterion;
  distanceKm: RangeCriterion;
  genderGroups: CategoricalCriterion;
  sexualOrientations: CategoricalCriterion<SexualOrientation>;
  languages: CategoricalCriterion;
  educationLevels: CategoricalCriterion<EducationLevel>;
  relationshipStatuses: CategoricalCriterion<RelationshipStatus>;
  relationshipForms: CategoricalCriterion<RelationshipForm>;
  childrenStatus: CategoricalCriterion;
  childrenDesire: CategoricalCriterion;
  religions: CategoricalCriterion;
  politics: CategoricalCriterion;
  smoking: CategoricalCriterion;
  alcohol: CategoricalCriterion;
  interests: CategoricalCriterion;
  personality: {
    importance: PreferenceImportance;
    relationship: MatchRelationship;
  };
  values: CategoricalCriterion;
  lifeGoals: CategoricalCriterion;
  communicationStyles: CategoricalCriterion;
  humorStyles: CategoricalCriterion;
  dealbreakers: Array<{
    id: string;
    field: string;
    operator: "outside_accepted" | "equals" | "not_equals";
    values: string[];
  }>;
};

export type CollectionSettings = {
  behavioralLearning: boolean;
  interactionOutcomeLearning: boolean;
  activityTiming: boolean;
  localBioClassification: boolean;
  localMessageClassification: boolean;
  noticeVersion: "matching-data-controls-1.0";
  updatedAt: string;
};

export type ProfileVisibilitySettings = {
  sexualOrientation: "shown" | "hidden";
  languages: "shown" | "hidden";
  education: "shown" | "hidden";
  occupation: "shown" | "hidden";
  relationshipStatus: "shown" | "hidden";
  children: "shown" | "hidden";
  religion: "shown" | "hidden";
  politics: "shown" | "hidden";
  smokingAndAlcohol: "shown" | "hidden";
  interests: "shown" | "hidden";
  personality: "shown" | "hidden";
  valuesAndGoals: "shown" | "hidden";
  linkedAccounts: "shown" | "hidden";
  verifications: "shown" | "hidden";
};

export type DatingDataSettings = {
  version: typeof DATING_DATA_MODEL_VERSION;
  profileAttributes: ProfileAttributes;
  profileVisibility: ProfileVisibilitySettings;
  discoveryCriteria: DiscoveryCriteria;
  collection: CollectionSettings;
  updatedAt: string;
};

export type BehaviorEvent = {
  id: string;
  occurredAt: string;
  candidateId: string;
  kind: "impression" | "interested" | "passed" | "undo" | "profile_expanded";
  source: "explicit_action" | "client_metadata";
  sessionSequence: number | null;
  dwellTimeBucket: "under_2s" | "2_to_10s" | "10_to_30s" | "over_30s" | null;
  viewedPhotoCount: number | null;
  bioOpened: boolean | null;
  selectionProbability: number;
};

export type MatchFunnelEvent = {
  id: string;
  connectionId: string;
  occurredAt: string;
  kind:
    | "mutual_match"
    | "first_message"
    | "first_reply"
    | "conversation_threshold"
    | "contact_exchange_user_reported"
    | "date_planned_user_reported"
    | "unmatched";
  actor: "self" | "peer" | "both" | "unknown";
};

/** Aggregate only. Raw typing, tap, scroll, and message-content telemetry is forbidden. */
export type CommunicationMetadataAggregate = {
  connectionId: string;
  periodStart: string;
  periodEnd: string;
  sentMessages: number;
  receivedMessages: number;
  replyCount: number;
  firstMessageActor: "self" | "peer" | "unknown";
  responseLatencyBucketCounts: Record<string, number>;
  messageLengthBucketCounts: Record<string, number>;
  reciprocalTurnRatio: number | null;
  contentAnalyzed: false;
};

export type ActivityAggregate = {
  periodStart: string;
  periodEnd: string;
  sessions: number;
  activeDays: number;
  sessionDurationBucketCounts: Record<string, number>;
  localTimeBucketCounts: Record<string, number>;
  responseLatencyBucketCounts: Record<string, number>;
  /** Never public and never a direct rank multiplier. */
  lastActiveAt: string | null;
};

export type ProfileQualityFeatures = {
  computedAt: string;
  profileRevision: string;
  photoCount: number;
  photoKinds: Array<"portrait" | "full_body" | "activity" | "group" | "other">;
  completeness: number;
  bioLength: number;
  bioTopics: string[];
  linkedAccountCount: number;
  verificationKinds: string[];
  profileAgeDays: number;
  editsLast30Days: number;
  /** Presentation completeness only; must not represent human attractiveness. */
  qualityScope: "presentation_completeness_only";
};

export type ProfileMediaAsset = {
  id: string;
  position: number;
  kind: "photo";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  createdAt: string;
  updatedAt: string;
  moderationStatus: "pending" | "accepted" | "rejected";
  /** User confirmation, never an attractiveness label or facial inference. */
  userSelectedContext:
    "portrait" | "full_body" | "activity" | "group" | "other";
};

export type PairFeatures = {
  computedAt: string;
  personAId: string;
  personBId: string;
  distanceBand: string;
  sharedInterests: string[];
  interestSimilarity: number | null;
  valuesFit: number | null;
  personalitySimilarity: number | null;
  personalityComplementarity: number | null;
  ageDifference: number;
  scheduleCompatibility: number | null;
  explicitPreferenceFitAtoB: number;
  explicitPreferenceFitBtoA: number;
};

export type ContextFeatures = {
  computedAt: string;
  localTimeBucket: "morning" | "afternoon" | "evening" | "night";
  dayType: "weekday" | "weekend";
  distanceBand: string;
  travelMode: "off" | "user_enabled";
  localCandidateDensityBand: "low" | "medium" | "high" | "unknown";
  recentlyActiveA: boolean | null;
  recentlyActiveB: boolean | null;
  scheduleCompatibility: number | null;
  /** Exact coordinates and movement histories are never model features. */
  preciseLocationUsed: false;
};

/** Calibration/audit counters only. They must never become an Elo or ranking score. */
export type ExposureAuditMetrics = {
  periodStart: string;
  periodEnd: string;
  impressionsReceived: number;
  interestsReceived: number;
  interestsSent: number;
  mutualMatches: number;
  comparableCohort: string;
  rankUse: "audit_only";
};

export type ExplorationPolicy = {
  version: string;
  exploitationShare: number;
  uncertaintyExplorationShare: number;
  diversityExplorationShare: number;
  seededRandomShare: number;
  maximumConsecutiveSimilarProfiles: number;
  coldStartSource: "explicit_preferences_and_seeded_diversity";
};

export type TransparentRankingPolicy = {
  version: string;
  status:
    "draft_not_active" | "offline_evaluation" | "pilot" | "active" | "retired";
  objective: "expected_positive_interaction";
  nonObjectives: Array<
    | "time_in_app"
    | "swipe_volume"
    | "message_volume"
    | "revenue"
    | "global_popularity"
  >;
  weights: {
    mutualInterestProbability: number;
    explicitPreferenceAndInterestFit: number;
    replyProbability: number;
    sustainedConversationProbability: number;
    activityAvailability: number;
    distance: number;
    explorationAndDiversity: number;
  };
  exploration: ExplorationPolicy;
  sourceCommit: string | null;
  evidenceRegisterRevision: string;
};

/** The design-note proposal is inspectable but explicitly not an active or validated policy. */
export const PROPOSED_RANKING_POLICY: TransparentRankingPolicy = {
  version: "expected-positive-interaction-draft-1",
  status: "draft_not_active",
  objective: "expected_positive_interaction",
  nonObjectives: [
    "time_in_app",
    "swipe_volume",
    "message_volume",
    "revenue",
    "global_popularity",
  ],
  weights: {
    mutualInterestProbability: 0.3,
    explicitPreferenceAndInterestFit: 0.2,
    replyProbability: 0.15,
    sustainedConversationProbability: 0.15,
    activityAvailability: 0.1,
    distance: 0.05,
    explorationAndDiversity: 0.05,
  },
  exploration: {
    version: "exploration-draft-1",
    exploitationShare: 0.8,
    uncertaintyExplorationShare: 0.08,
    diversityExplorationShare: 0.07,
    seededRandomShare: 0.05,
    maximumConsecutiveSimilarProfiles: 3,
    coldStartSource: "explicit_preferences_and_seeded_diversity",
  },
  sourceCommit: null,
  evidenceRegisterRevision: "research/evidence-register-2026-08",
};

export function validateTransparentRankingPolicy(
  value: TransparentRankingPolicy,
): TransparentRankingPolicy {
  const probability = (item: number) =>
    Number.isFinite(item) && item >= 0 && item <= 1;
  const weights = Object.values(value.weights);
  const explorationShares = [
    value.exploration.exploitationShare,
    value.exploration.uncertaintyExplorationShare,
    value.exploration.diversityExplorationShare,
    value.exploration.seededRandomShare,
  ];
  if (
    !weights.every(probability) ||
    Math.abs(weights.reduce((sum, item) => sum + item, 0) - 1) > 1e-9 ||
    !explorationShares.every(probability) ||
    Math.abs(explorationShares.reduce((sum, item) => sum + item, 0) - 1) >
      1e-9 ||
    !Number.isInteger(value.exploration.maximumConsecutiveSimilarProfiles) ||
    value.exploration.maximumConsecutiveSimilarProfiles < 1 ||
    value.nonObjectives.length !== 5 ||
    new Set(value.nonObjectives).size !== value.nonObjectives.length ||
    ((value.status === "pilot" || value.status === "active") &&
      !/^[0-9a-f]{40}$/.test(value.sourceCommit ?? ""))
  )
    throw new RangeError("transparent ranking policy is invalid");
  return structuredClone(value);
}

export type PairPrediction = {
  id: string;
  computedAt: string;
  expiresAt: string;
  personAId: string;
  personBId: string;
  modelVersion: string;
  trainingDataNoticeVersion: string;
  probabilityAInterestedInB: number;
  probabilityBInterestedInA: number;
  probabilityMutualInterest: number;
  probabilityConversationGivenMatch: number | null;
  probabilityPositiveInteraction: number | null;
  uncertainty: number;
  featureFamiliesUsed: Array<
    | "explicit_profile"
    | "explicit_preferences"
    | "behavior"
    | "activity"
    | "context"
  >;
  explanationFeatureIds: string[];
};

export type RecommendationDecision = {
  id: string;
  createdAt: string;
  personId: string;
  candidateId: string;
  algorithmVersion: string;
  eligible: boolean;
  hardFilterReasons: string[];
  mutualInterestProbability: number | null;
  interactionSuccessProbability: number | null;
  explicitFitScore: number | null;
  distanceScore: number | null;
  activityAvailabilityScore: number | null;
  explorationMode: "scored" | "uncertainty" | "diversity" | "random_seeded";
  explorationProbability: number;
  diversityFeatures: string[];
  publicSeed: string | null;
  finalScore: number | null;
};

export type InteractionFeedback = {
  id: string;
  connectionId: string;
  recordedAt: string;
  metInPerson: boolean | null;
  wantsMoreProfilesLikeThis: boolean | null;
  positiveInteraction: boolean | null;
  wantedFurtherContact: boolean | null;
  unmatchReason:
    | "no_connection"
    | "different_goals"
    | "conversation_issue"
    | "safety_concern"
    | "met_someone"
    | "other"
    | null;
  freeText: string;
};

export type SafetySignal = {
  id: string;
  subjectId: string;
  createdAt: string;
  kind:
    | "report"
    | "block"
    | "spam_pattern"
    | "automation_pattern"
    | "mass_liking_pattern"
    | "scam_pattern"
    | "verification_state";
  source: "user_report" | "rule" | "human_review" | "verification_provider";
  confidence: number | null;
  status: "unreviewed" | "corroborated" | "dismissed" | "actioned";
  action: "none" | "friction" | "review" | "temporary_limit" | "suspension";
  /** Reports and probabilistic signals never directly become guilt or rank. */
  automaticReachPenalty: false;
};

export type DataFieldPolicy = {
  family:
    | "profile"
    | "preference"
    | "behavior"
    | "match_funnel"
    | "communication_metadata"
    | "activity"
    | "profile_quality"
    | "pair_feature"
    | "prediction"
    | "context"
    | "recommendation"
    | "outcome"
    | "safety";
  sensitivity: "ordinary" | "sensitive" | "highly_sensitive";
  collection: "required" | "optional_explicit" | "optional_opt_in" | "derived";
  visibility:
    "public_profile" | "person_only" | "service_private" | "connection_private";
  rankingUse:
    | "eligibility"
    | "user_weighted"
    | "pair_prediction"
    | "exploration"
    | "never";
  retention:
    | "account_lifetime"
    | "rolling_30_days"
    | "rolling_90_days"
    | "until_connection_deleted";
};

export const DATA_FIELD_POLICIES: Record<string, DataFieldPolicy> = {
  identityAndOrientation: {
    family: "profile",
    sensitivity: "highly_sensitive",
    collection: "optional_explicit",
    visibility: "person_only",
    rankingUse: "eligibility",
    retention: "account_lifetime",
  },
  discoveryCriteria: {
    family: "preference",
    sensitivity: "highly_sensitive",
    collection: "optional_explicit",
    visibility: "person_only",
    rankingUse: "user_weighted",
    retention: "account_lifetime",
  },
  behaviorEvents: {
    family: "behavior",
    sensitivity: "sensitive",
    collection: "optional_opt_in",
    visibility: "person_only",
    rankingUse: "pair_prediction",
    retention: "rolling_90_days",
  },
  matchFunnel: {
    family: "match_funnel",
    sensitivity: "sensitive",
    collection: "derived",
    visibility: "person_only",
    rankingUse: "pair_prediction",
    retention: "rolling_90_days",
  },
  communicationMetadata: {
    family: "communication_metadata",
    sensitivity: "sensitive",
    collection: "optional_opt_in",
    visibility: "person_only",
    rankingUse: "pair_prediction",
    retention: "rolling_90_days",
  },
  messageContentClassification: {
    family: "communication_metadata",
    sensitivity: "highly_sensitive",
    collection: "optional_opt_in",
    visibility: "connection_private",
    rankingUse: "never",
    retention: "until_connection_deleted",
  },
  activity: {
    family: "activity",
    sensitivity: "sensitive",
    collection: "optional_opt_in",
    visibility: "person_only",
    rankingUse: "pair_prediction",
    retention: "rolling_30_days",
  },
  profileQuality: {
    family: "profile_quality",
    sensitivity: "ordinary",
    collection: "derived",
    visibility: "person_only",
    rankingUse: "never",
    retention: "rolling_90_days",
  },
  profileMedia: {
    family: "profile",
    sensitivity: "sensitive",
    collection: "optional_explicit",
    visibility: "public_profile",
    rankingUse: "never",
    retention: "account_lifetime",
  },
  exposureAudit: {
    family: "activity",
    sensitivity: "sensitive",
    collection: "derived",
    visibility: "service_private",
    rankingUse: "never",
    retention: "rolling_90_days",
  },
  pairPrediction: {
    family: "prediction",
    sensitivity: "sensitive",
    collection: "derived",
    visibility: "service_private",
    rankingUse: "pair_prediction",
    retention: "rolling_30_days",
  },
  context: {
    family: "context",
    sensitivity: "sensitive",
    collection: "derived",
    visibility: "service_private",
    rankingUse: "pair_prediction",
    retention: "rolling_30_days",
  },
  recommendationDecision: {
    family: "recommendation",
    sensitivity: "sensitive",
    collection: "derived",
    visibility: "person_only",
    rankingUse: "never",
    retention: "rolling_30_days",
  },
  interactionFeedback: {
    family: "outcome",
    sensitivity: "sensitive",
    collection: "optional_explicit",
    visibility: "person_only",
    rankingUse: "pair_prediction",
    retention: "until_connection_deleted",
  },
  interactionFeedbackFreeText: {
    family: "outcome",
    sensitivity: "highly_sensitive",
    collection: "optional_explicit",
    visibility: "person_only",
    rankingUse: "never",
    retention: "until_connection_deleted",
  },
  safetySignals: {
    family: "safety",
    sensitivity: "highly_sensitive",
    collection: "derived",
    visibility: "service_private",
    rankingUse: "never",
    retention: "rolling_90_days",
  },
};

const iso = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const unit = (value: unknown) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;
const strings = (value: unknown, maximum: number, length = 80) =>
  Array.isArray(value) &&
  value.length <= maximum &&
  value.every(
    (item) =>
      typeof item === "string" &&
      item.trim().length > 0 &&
      item.length <= length,
  ) &&
  new Set(value).size === value.length;
const booleanOrNull = (value: unknown) =>
  value === null || typeof value === "boolean";
const enumOrNull = <T extends string>(value: unknown, allowed: readonly T[]) =>
  value === null || (typeof value === "string" && allowed.includes(value as T));
const exactKeys = (value: unknown, keys: readonly string[]) =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key));

export const defaultProfileAttributes = (): ProfileAttributes => ({
  sexualOrientations: [],
  orientationSelfDescription: "",
  languages: [],
  educationLevel: null,
  occupation: null,
  relationshipStatus: null,
  relationshipForms: [],
  children: null,
  religion: null,
  politics: null,
  smoking: null,
  alcohol: null,
  lifestyleTags: [],
  interests: [],
  hobbies: [],
  musicGenres: [],
  leisureActivities: [],
  travelPreferences: [],
  personality: { bigFive: null, selfDescriptions: [] },
  schwartzValues: [],
  lifeGoals: [],
  communicationStyles: [],
  humorStyles: [],
  socialPoliticalCauses: [],
  linkedAccounts: [],
  verifications: [],
});

const criterion = <T extends string>(
  accepted: T[] = [],
): CategoricalCriterion<T> => ({
  importance: "not_used",
  accepted,
  relationship: "either",
});

export const defaultDiscoveryCriteria = (): DiscoveryCriteria => ({
  age: {
    importance: "dealbreaker",
    minimum: 18,
    maximum: 120,
    idealMinimum: 18,
    idealMaximum: 120,
  },
  distanceKm: {
    importance: "dealbreaker",
    minimum: 0,
    maximum: 50,
    idealMinimum: 0,
    idealMaximum: 15,
  },
  genderGroups: criterion(),
  sexualOrientations: criterion<SexualOrientation>(),
  languages: criterion(),
  educationLevels: criterion<EducationLevel>(),
  relationshipStatuses: criterion<RelationshipStatus>(),
  relationshipForms: criterion<RelationshipForm>(),
  childrenStatus: criterion(),
  childrenDesire: criterion(),
  religions: criterion(),
  politics: criterion(),
  smoking: criterion(),
  alcohol: criterion(),
  interests: criterion(),
  personality: { importance: "not_used", relationship: "either" },
  values: criterion(),
  lifeGoals: criterion(),
  communicationStyles: criterion(),
  humorStyles: criterion(),
  dealbreakers: [],
});

export const defaultCollectionSettings = (): CollectionSettings => ({
  behavioralLearning: false,
  interactionOutcomeLearning: false,
  activityTiming: false,
  localBioClassification: false,
  localMessageClassification: false,
  noticeVersion: "matching-data-controls-1.0",
  updatedAt: new Date(0).toISOString(),
});

export const defaultProfileVisibility = (): ProfileVisibilitySettings => ({
  sexualOrientation: "hidden",
  languages: "shown",
  education: "shown",
  occupation: "shown",
  relationshipStatus: "hidden",
  children: "shown",
  religion: "shown",
  politics: "shown",
  smokingAndAlcohol: "shown",
  interests: "shown",
  personality: "hidden",
  valuesAndGoals: "shown",
  linkedAccounts: "shown",
  verifications: "shown",
});

export const defaultDatingDataSettings = (): DatingDataSettings => ({
  version: DATING_DATA_MODEL_VERSION,
  profileAttributes: defaultProfileAttributes(),
  profileVisibility: defaultProfileVisibility(),
  discoveryCriteria: defaultDiscoveryCriteria(),
  collection: defaultCollectionSettings(),
  updatedAt: new Date(0).toISOString(),
});

const validateCriterion = (value: CategoricalCriterion) => {
  if (
    !value ||
    !exactKeys(value, ["importance", "accepted", "relationship"]) ||
    !["not_used", "preference", "important", "dealbreaker"].includes(
      value.importance,
    ) ||
    !["similarity", "complementarity", "either", "not_applicable"].includes(
      value.relationship,
    ) ||
    !strings(value.accepted, 100, 100)
  )
    throw new RangeError("categorical preference criterion is invalid");
};

export function validateDatingDataSettings(
  value: DatingDataSettings,
): DatingDataSettings {
  if (
    !exactKeys(value, [
      "version",
      "profileAttributes",
      "profileVisibility",
      "discoveryCriteria",
      "collection",
      "updatedAt",
    ]) ||
    value.version !== DATING_DATA_MODEL_VERSION ||
    !iso(value.updatedAt)
  )
    throw new RangeError("dating data model version is invalid");
  const profile = value.profileAttributes;
  if (
    !profile ||
    !exactKeys(profile, [
      "sexualOrientations",
      "orientationSelfDescription",
      "languages",
      "educationLevel",
      "occupation",
      "relationshipStatus",
      "relationshipForms",
      "children",
      "religion",
      "politics",
      "smoking",
      "alcohol",
      "lifestyleTags",
      "interests",
      "hobbies",
      "musicGenres",
      "leisureActivities",
      "travelPreferences",
      "personality",
      "schwartzValues",
      "lifeGoals",
      "communicationStyles",
      "humorStyles",
      "socialPoliticalCauses",
      "linkedAccounts",
      "verifications",
    ]) ||
    !strings(profile.sexualOrientations, SEXUAL_ORIENTATIONS.length, 40) ||
    profile.sexualOrientations.some(
      (item) => !SEXUAL_ORIENTATIONS.includes(item),
    ) ||
    typeof profile.orientationSelfDescription !== "string" ||
    profile.orientationSelfDescription.length > 80 ||
    !Array.isArray(profile.languages) ||
    profile.languages.length > 20 ||
    profile.languages.some(
      (item) =>
        !exactKeys(item, ["code", "proficiency"]) ||
        !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(item.code) ||
        !["basic", "conversational", "fluent", "native"].includes(
          item.proficiency,
        ),
    ) ||
    !enumOrNull(profile.educationLevel, EDUCATION_LEVELS) ||
    (profile.occupation !== null &&
      (!profile.occupation ||
        !exactKeys(profile.occupation, ["status", "industry", "title"]) ||
        ![
          "employed",
          "self_employed",
          "student",
          "between_roles",
          "retired",
          "other",
          "prefer_not_to_say",
        ].includes(profile.occupation.status) ||
        typeof profile.occupation.industry !== "string" ||
        profile.occupation.industry.length > 80 ||
        typeof profile.occupation.title !== "string" ||
        profile.occupation.title.length > 80)) ||
    !enumOrNull(profile.relationshipStatus, RELATIONSHIP_STATUSES) ||
    !strings(profile.relationshipForms, RELATIONSHIP_FORMS.length, 40) ||
    profile.relationshipForms.some(
      (item) => !RELATIONSHIP_FORMS.includes(item),
    ) ||
    (profile.children !== null &&
      (!profile.children ||
        !exactKeys(profile.children, ["status", "desire"]) ||
        !CHILDREN_STATUSES.includes(profile.children.status) ||
        !CHILDREN_DESIRES.includes(profile.children.desire))) ||
    (profile.religion !== null &&
      (!profile.religion ||
        !exactKeys(profile.religion, [
          "identity",
          "selfDescription",
          "importance",
        ]) ||
        !RELIGION_IDENTITIES.includes(profile.religion.identity) ||
        typeof profile.religion.selfDescription !== "string" ||
        profile.religion.selfDescription.length > 80 ||
        !["not_important", "somewhat", "very"].includes(
          profile.religion.importance,
        ))) ||
    (profile.politics !== null &&
      (!profile.politics ||
        !exactKeys(profile.politics, [
          "identity",
          "selfDescription",
          "importance",
        ]) ||
        !POLITICAL_IDENTITIES.includes(profile.politics.identity) ||
        typeof profile.politics.selfDescription !== "string" ||
        profile.politics.selfDescription.length > 80 ||
        !["not_important", "somewhat", "very"].includes(
          profile.politics.importance,
        ))) ||
    !enumOrNull(profile.smoking, SMOKING_STATUSES) ||
    !enumOrNull(profile.alcohol, ALCOHOL_STATUSES) ||
    !strings(profile.lifestyleTags, 20) ||
    !Array.isArray(profile.interests) ||
    profile.interests.length > 50 ||
    profile.interests.some(
      (item) =>
        !exactKeys(item, ["label", "category", "source"]) ||
        !item.label ||
        item.label.length > 80 ||
        !INTEREST_CATEGORIES.includes(item.category) ||
        !["user_selected", "user_confirmed_local_classification"].includes(
          item.source,
        ),
    ) ||
    !strings(profile.hobbies, 30) ||
    !strings(profile.musicGenres, 30) ||
    !strings(profile.leisureActivities, 30) ||
    !strings(profile.travelPreferences, 20) ||
    !exactKeys(profile.personality, ["bigFive", "selfDescriptions"]) ||
    !strings(profile.personality.selfDescriptions, 12) ||
    !strings(profile.schwartzValues, SCHWARTZ_VALUE_GROUPS.length) ||
    profile.schwartzValues.some(
      (item) => !SCHWARTZ_VALUE_GROUPS.includes(item),
    ) ||
    !strings(profile.lifeGoals, 20) ||
    !strings(profile.communicationStyles, COMMUNICATION_STYLES.length) ||
    profile.communicationStyles.some(
      (item) => !COMMUNICATION_STYLES.includes(item),
    ) ||
    !strings(profile.humorStyles, HUMOR_STYLES.length) ||
    profile.humorStyles.some((item) => !HUMOR_STYLES.includes(item)) ||
    !strings(profile.socialPoliticalCauses, 20) ||
    !Array.isArray(profile.linkedAccounts) ||
    profile.linkedAccounts.length > 10 ||
    profile.linkedAccounts.some(
      (item) =>
        !exactKeys(item, ["provider", "displayLabel", "verifiedByProvider"]) ||
        !["instagram", "spotify", "other"].includes(item.provider) ||
        typeof item.displayLabel !== "string" ||
        item.displayLabel.length > 100 ||
        typeof item.verifiedByProvider !== "boolean",
    ) ||
    !Array.isArray(profile.verifications) ||
    profile.verifications.length > 4 ||
    profile.verifications.some(
      (item) =>
        !exactKeys(item, [
          "kind",
          "status",
          "verifiedAt",
          "evidenceRetained",
        ]) ||
        !["email", "phone", "photo_liveness", "identity_document"].includes(
          item.kind,
        ) ||
        !["pending", "verified", "failed", "expired"].includes(item.status) ||
        (item.verifiedAt !== null && !iso(item.verifiedAt)) ||
        item.evidenceRetained !== false,
    )
  )
    throw new RangeError("profile attributes are invalid");
  if (profile.personality.bigFive) {
    const assessment = profile.personality.bigFive;
    if (
      !exactKeys(assessment, [
        "instrument",
        "instrumentVersion",
        "scores",
        "completedAt",
      ]) ||
      !exactKeys(assessment.scores, [
        "openness",
        "conscientiousness",
        "extraversion",
        "agreeableness",
        "negativeEmotionality",
      ]) ||
      assessment.instrument !== "BFI-2-XS" ||
      assessment.instrumentVersion !== "2017" ||
      !iso(assessment.completedAt) ||
      Object.values(assessment.scores).some((score) => !unit(score))
    )
      throw new RangeError("Big Five assessment is invalid");
  }
  const visibility = value.profileVisibility;
  if (
    !visibility ||
    !exactKeys(visibility, Object.keys(defaultProfileVisibility())) ||
    Object.keys(defaultProfileVisibility()).some(
      (key) =>
        !["shown", "hidden"].includes(
          visibility[key as keyof ProfileVisibilitySettings],
        ),
    )
  )
    throw new RangeError("profile visibility is invalid");
  const criteria = value.discoveryCriteria;
  if (
    !exactKeys(criteria, [
      "age",
      "distanceKm",
      "genderGroups",
      "sexualOrientations",
      "languages",
      "educationLevels",
      "relationshipStatuses",
      "relationshipForms",
      "childrenStatus",
      "childrenDesire",
      "religions",
      "politics",
      "smoking",
      "alcohol",
      "interests",
      "personality",
      "values",
      "lifeGoals",
      "communicationStyles",
      "humorStyles",
      "dealbreakers",
    ])
  )
    throw new RangeError("discovery criteria are invalid");
  for (const item of [
    criteria.genderGroups,
    criteria.sexualOrientations,
    criteria.languages,
    criteria.educationLevels,
    criteria.relationshipStatuses,
    criteria.relationshipForms,
    criteria.childrenStatus,
    criteria.childrenDesire,
    criteria.religions,
    criteria.politics,
    criteria.smoking,
    criteria.alcohol,
    criteria.interests,
    criteria.values,
    criteria.lifeGoals,
    criteria.communicationStyles,
    criteria.humorStyles,
  ])
    validateCriterion(item);
  for (const range of [criteria.age, criteria.distanceKm])
    if (
      !range ||
      !exactKeys(range, [
        "importance",
        "minimum",
        "maximum",
        "idealMinimum",
        "idealMaximum",
      ]) ||
      !["not_used", "preference", "important", "dealbreaker"].includes(
        range.importance,
      ) ||
      ![
        range.minimum,
        range.maximum,
        range.idealMinimum,
        range.idealMaximum,
      ].every((item) => Number.isFinite(item) && item >= 0) ||
      range.minimum > range.idealMinimum ||
      range.idealMinimum > range.idealMaximum ||
      range.idealMaximum > range.maximum
    )
      throw new RangeError("range preference criterion is invalid");
  if (
    !criteria.personality ||
    !exactKeys(criteria.personality, ["importance", "relationship"]) ||
    !["not_used", "preference", "important", "dealbreaker"].includes(
      criteria.personality.importance,
    ) ||
    !["similarity", "complementarity", "either", "not_applicable"].includes(
      criteria.personality.relationship,
    ) ||
    !Array.isArray(criteria.dealbreakers) ||
    criteria.dealbreakers.length > 30
  )
    throw new RangeError("discovery criteria are invalid");
  for (const dealbreaker of criteria.dealbreakers)
    if (
      !dealbreaker ||
      !exactKeys(dealbreaker, ["id", "field", "operator", "values"]) ||
      !/^[a-z0-9_-]{1,80}$/i.test(dealbreaker.id) ||
      !/^[a-z0-9_.-]{1,100}$/i.test(dealbreaker.field) ||
      !["outside_accepted", "equals", "not_equals"].includes(
        dealbreaker.operator,
      ) ||
      !strings(dealbreaker.values, 30, 100)
    )
      throw new RangeError("dealbreaker is invalid");
  const collection = value.collection;
  if (
    !collection ||
    !exactKeys(collection, [
      "behavioralLearning",
      "interactionOutcomeLearning",
      "activityTiming",
      "localBioClassification",
      "localMessageClassification",
      "noticeVersion",
      "updatedAt",
    ]) ||
    collection.noticeVersion !== "matching-data-controls-1.0" ||
    !iso(collection.updatedAt) ||
    [
      collection.behavioralLearning,
      collection.interactionOutcomeLearning,
      collection.activityTiming,
      collection.localBioClassification,
      collection.localMessageClassification,
    ].some((item) => typeof item !== "boolean")
  )
    throw new RangeError("collection settings are invalid");
  return structuredClone(value);
}

export function validateBehaviorEvent(value: BehaviorEvent): BehaviorEvent {
  if (
    !exactKeys(value, [
      "id",
      "occurredAt",
      "candidateId",
      "kind",
      "source",
      "sessionSequence",
      "dwellTimeBucket",
      "viewedPhotoCount",
      "bioOpened",
      "selectionProbability",
    ]) ||
    !/^[0-9a-f-]{36}$/i.test(value.id) ||
    !iso(value.occurredAt) ||
    typeof value.candidateId !== "string" ||
    value.candidateId.length < 1 ||
    value.candidateId.length > 100 ||
    ![
      "impression",
      "interested",
      "passed",
      "undo",
      "profile_expanded",
    ].includes(value.kind) ||
    !["explicit_action", "client_metadata"].includes(value.source) ||
    (value.sessionSequence !== null &&
      (!Number.isInteger(value.sessionSequence) ||
        value.sessionSequence < 0)) ||
    ![null, "under_2s", "2_to_10s", "10_to_30s", "over_30s"].includes(
      value.dwellTimeBucket,
    ) ||
    !booleanOrNull(value.bioOpened) ||
    !unit(value.selectionProbability) ||
    value.selectionProbability === 0 ||
    (value.viewedPhotoCount !== null &&
      (!Number.isInteger(value.viewedPhotoCount) ||
        value.viewedPhotoCount < 0 ||
        value.viewedPhotoCount > 6))
  )
    throw new RangeError("behavior event is invalid");
  return structuredClone(value);
}

export function validateInteractionFeedback(
  value: InteractionFeedback,
): InteractionFeedback {
  if (
    !exactKeys(value, [
      "id",
      "connectionId",
      "recordedAt",
      "metInPerson",
      "wantsMoreProfilesLikeThis",
      "positiveInteraction",
      "wantedFurtherContact",
      "unmatchReason",
      "freeText",
    ]) ||
    !/^[0-9a-f-]{36}$/i.test(value.id) ||
    typeof value.connectionId !== "string" ||
    value.connectionId.length < 1 ||
    value.connectionId.length > 100 ||
    !iso(value.recordedAt) ||
    !booleanOrNull(value.metInPerson) ||
    !booleanOrNull(value.wantsMoreProfilesLikeThis) ||
    !booleanOrNull(value.positiveInteraction) ||
    !booleanOrNull(value.wantedFurtherContact) ||
    ![
      null,
      "no_connection",
      "different_goals",
      "conversation_issue",
      "safety_concern",
      "met_someone",
      "other",
    ].includes(value.unmatchReason) ||
    typeof value.freeText !== "string" ||
    value.freeText.length > 500 ||
    ([
      value.metInPerson,
      value.wantsMoreProfilesLikeThis,
      value.positiveInteraction,
      value.wantedFurtherContact,
      value.unmatchReason,
    ].every((item) => item === null) &&
      value.freeText.trim().length === 0)
  )
    throw new RangeError("interaction feedback is invalid");
  return structuredClone(value);
}

export function validatePairPrediction(value: PairPrediction): PairPrediction {
  if (
    !exactKeys(value, [
      "id",
      "computedAt",
      "expiresAt",
      "personAId",
      "personBId",
      "modelVersion",
      "trainingDataNoticeVersion",
      "probabilityAInterestedInB",
      "probabilityBInterestedInA",
      "probabilityMutualInterest",
      "probabilityConversationGivenMatch",
      "probabilityPositiveInteraction",
      "uncertainty",
      "featureFamiliesUsed",
      "explanationFeatureIds",
    ]) ||
    !/^[0-9a-f-]{36}$/i.test(value.id) ||
    !iso(value.computedAt) ||
    !iso(value.expiresAt) ||
    Date.parse(value.expiresAt) <= Date.parse(value.computedAt) ||
    [
      value.probabilityAInterestedInB,
      value.probabilityBInterestedInA,
      value.probabilityMutualInterest,
      value.uncertainty,
    ].some((item) => !unit(item)) ||
    (value.probabilityConversationGivenMatch !== null &&
      !unit(value.probabilityConversationGivenMatch)) ||
    (value.probabilityPositiveInteraction !== null &&
      !unit(value.probabilityPositiveInteraction)) ||
    !strings([value.personAId, value.personBId], 2, 100) ||
    value.personAId === value.personBId ||
    typeof value.modelVersion !== "string" ||
    value.modelVersion.length < 1 ||
    value.modelVersion.length > 100 ||
    typeof value.trainingDataNoticeVersion !== "string" ||
    value.trainingDataNoticeVersion.length < 1 ||
    value.trainingDataNoticeVersion.length > 100 ||
    !strings(value.featureFamiliesUsed, 5, 40) ||
    value.featureFamiliesUsed.some(
      (item) =>
        ![
          "explicit_profile",
          "explicit_preferences",
          "behavior",
          "activity",
          "context",
        ].includes(item),
    ) ||
    !strings(value.explanationFeatureIds, 30, 100)
  )
    throw new RangeError("pair prediction is invalid");
  return structuredClone(value);
}
