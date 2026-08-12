import {
  explainMatch,
  proximityCompatibility,
  type Boundary,
  type Contribution,
  type Explanation,
  type Factor,
} from "./index.js";

export type RelationshipIntent =
  | "Long-term relationship"
  | "Long-term, open to short"
  | "Still figuring it out";

export const POLITE_CLOSE_MESSAGE =
  "Thank you for talking with me. I don’t think this is the connection I’m looking for, so I’m going to close this conversation. I wish you well.";

export const conversationStarter = (profile: Pick<Profile, "promptAnswer">) =>
  `You mentioned “${profile.promptAnswer}” — I’d enjoy hearing more about that.`;

export type MessageSafetyFlag = {
  id: "external_link" | "payment_request";
  label: string;
  explanation: string;
};

/**
 * Two deliberately narrow, published rules for contextual friction. They are
 * not a scam classifier and must never affect matching, reporting, or profile
 * visibility. Nothing from this check is stored separately from a sent message.
 */
export function messageSafetyFlags(text: string): MessageSafetyFlag[] {
  const normalized = text.normalize("NFKC").toLowerCase();
  const flags: MessageSafetyFlag[] = [];
  if (
    /(?:https?:\/\/|www\.)\S+/i.test(normalized) ||
    /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|org|net|ch|de|io|app)(?:\b|\/)/i.test(
      normalized,
    )
  )
    flags.push({
      id: "external_link",
      label: "External link",
      explanation:
        "Open links cautiously and keep early conversation inside the app.",
    });
  if (
    /\b(?:send|transfer|wire|pay|buy|purchase)\b.{0,48}\b(?:money|cash|funds|gift\s*cards?|bitcoin|crypto(?:currency)?|usdt|bank\s*transfer|wire\s*transfer)\b/i.test(
      normalized,
    ) ||
    /\b(?:send|transfer|pay)\b.{0,24}(?:[$€£]|\b(?:usd|eur|chf|gbp)\b)/i.test(
      normalized,
    )
  )
    flags.push({
      id: "payment_request",
      label: "Possible payment request",
      explanation:
        "Never send money, gift cards, bank transfers, or cryptocurrency to someone you met here.",
    });
  return flags;
}

export type Profile = {
  id: string;
  name: string;
  age: number;
  city: string;
  distanceKm: number;
  pronouns: string;
  intent: RelationshipIntent;
  readiness: "Ready to meet in person" | "Prefer to chat first";
  bio: string;
  prompt: string;
  promptAnswer: string;
  values: string[];
  lifestyle: {
    smoking: "no" | "sometimes";
    children: "want" | "open" | "do not want";
    schedule: "early" | "flexible" | "late";
  };
  color: string;
};

export type Preferences = {
  ageMin: number;
  ageMax: number;
  idealDistanceKm: number;
  maximumDistanceKm: number;
  intents: RelationshipIntent[];
  smoking: "no" | "any";
  children: "want" | "open" | "do not want" | "any";
  weights: {
    proximity: number;
    values: number;
    lifestyle: number;
    schedule: number;
  };
};

export type PublicProfile = Omit<Profile, "distanceKm"> & {
  distanceBand: string;
};
export type PublicExplanation = Omit<Explanation, "factorsForB"> & {
  factorsForB: Contribution[] | null;
  candidateTrace: "shared" | "private";
  selectionMode: "score" | "exploration";
  selectionProbability: number;
  weeklySeed: string | null;
};
export type Introduction = {
  profile: PublicProfile;
  explanation: PublicExplanation;
  reasons: string[];
};
export type Candidate = {
  profile: Profile;
  preferences: Preferences;
  explanationSharing?: "shared" | "private";
};
export const PRIORITY_LEVELS = [0, 1 / 3, 2 / 3, 1] as const;
export const priorityLabel = (weight: number) =>
  ["Off", "Low", "Medium", "High"][
    PRIORITY_LEVELS.reduce(
      (best, level, index) =>
        Math.abs(level - weight) < Math.abs(PRIORITY_LEVELS[best] - weight)
          ? index
          : best,
      0,
    )
  ];
export const nearestPriority = (weight: number) =>
  PRIORITY_LEVELS.reduce(
    (best, level) =>
      Math.abs(level - weight) < Math.abs(best - weight) ? level : best,
    PRIORITY_LEVELS[0],
  );

export function toPublicProfile(profile: Profile): PublicProfile {
  const { distanceKm, ...visible } = profile;
  const distanceBand =
    distanceKm <= 5
      ? "Within 5 km"
      : distanceKm <= 15
        ? "5–15 km"
        : distanceKm <= 30
          ? "15–30 km"
          : distanceKm <= 50
            ? "30–50 km"
            : "50+ km";
  return { ...visible, distanceBand };
}

export const demoUser: Profile = {
  id: "me",
  name: "Alex",
  age: 31,
  city: "Zürich",
  distanceKm: 0,
  pronouns: "they/them",
  intent: "Long-term relationship",
  readiness: "Prefer to chat first",
  bio: "Curious, grounded, and happiest near water or a good table.",
  prompt: "A good Sunday looks like",
  promptAnswer: "A long walk, cooking for friends, and nowhere urgent to be.",
  values: ["Kindness", "Curiosity", "Community"],
  lifestyle: { smoking: "no", children: "open", schedule: "early" },
  color: "#A8C3B5",
};

export function validateProfile(value: Profile): Profile {
  if (
    typeof value.name !== "string" ||
    value.name.trim().length < 1 ||
    value.name.trim().length > 50
  )
    throw new RangeError("profile name is invalid");
  if (!Number.isInteger(value.age) || value.age < 18 || value.age > 120)
    throw new RangeError("profile age is invalid");
  if (
    typeof value.city !== "string" ||
    value.city.trim().length < 1 ||
    value.city.trim().length > 80 ||
    typeof value.pronouns !== "string" ||
    value.pronouns.length > 50 ||
    ![
      "Long-term relationship",
      "Long-term, open to short",
      "Still figuring it out",
    ].includes(value.intent)
  )
    throw new RangeError("public profile details are invalid");
  if (
    !["Ready to meet in person", "Prefer to chat first"].includes(
      value.readiness,
    )
  )
    throw new RangeError("profile readiness is invalid");
  if (
    typeof value.bio !== "string" ||
    value.bio.trim().length < 1 ||
    value.bio.length > 500
  )
    throw new RangeError("profile biography is invalid");
  if (!value.lifestyle || !Array.isArray(value.values))
    throw new RangeError("profile details are invalid");
  return value;
}

export const defaultPreferences: Preferences = {
  ageMin: 27,
  ageMax: 38,
  idealDistanceKm: 12,
  maximumDistanceKm: 45,
  intents: ["Long-term relationship", "Long-term, open to short"],
  smoking: "no",
  children: "open",
  weights: { proximity: 2 / 3, values: 1, lifestyle: 2 / 3, schedule: 1 / 3 },
};

export function validatePreferences(value: Preferences): Preferences {
  const allowedIntents: RelationshipIntent[] = [
    "Long-term relationship",
    "Long-term, open to short",
    "Still figuring it out",
  ];
  if (
    !Number.isInteger(value.ageMin) ||
    !Number.isInteger(value.ageMax) ||
    value.ageMin < 18 ||
    value.ageMax > 120 ||
    value.ageMin > value.ageMax
  )
    throw new RangeError("age range is invalid");
  if (
    !Number.isFinite(value.idealDistanceKm) ||
    !Number.isFinite(value.maximumDistanceKm) ||
    value.idealDistanceKm < 0 ||
    value.maximumDistanceKm <= 0 ||
    value.idealDistanceKm > value.maximumDistanceKm
  )
    throw new RangeError("distance range is invalid");
  if (
    !Array.isArray(value.intents) ||
    value.intents.length === 0 ||
    value.intents.some((intent) => !allowedIntents.includes(intent))
  )
    throw new RangeError("relationship intentions are invalid");
  if (
    !["no", "any"].includes(value.smoking) ||
    !["want", "open", "do not want", "any"].includes(value.children)
  )
    throw new RangeError("lifestyle boundaries are invalid");
  for (const [factor, weight] of Object.entries(value.weights))
    if (!Number.isFinite(weight) || weight < 0 || weight > 1)
      throw new RangeError(`${factor} weight must be between 0 and 1`);
  return value;
}

const candidatePreferences = (patch: Partial<Preferences>): Preferences => ({
  ...defaultPreferences,
  ...patch,
  weights: { ...defaultPreferences.weights, ...patch.weights },
});

export const demoCandidates: Candidate[] = [
  {
    profile: {
      id: "mara",
      name: "Mara",
      age: 30,
      city: "Zürich",
      distanceKm: 4,
      pronouns: "she/her",
      intent: "Long-term relationship",
      readiness: "Ready to meet in person",
      bio: "Architect, amateur ceramicist, and reliable maker of breakfast.",
      prompt: "Something I care about",
      promptAnswer: "Building a life that has room for people, not only work.",
      values: ["Kindness", "Community", "Creativity"],
      lifestyle: { smoking: "no", children: "open", schedule: "early" },
      color: "#CBAF9C",
    },
    preferences: candidatePreferences({
      ageMin: 28,
      ageMax: 36,
      idealDistanceKm: 8,
      maximumDistanceKm: 30,
      weights: {
        proximity: 1 / 3,
        values: 1,
        lifestyle: 2 / 3,
        schedule: 1 / 3,
      },
    }),
  },
  {
    profile: {
      id: "noah",
      name: "Noah",
      age: 34,
      city: "Winterthur",
      distanceKm: 24,
      pronouns: "he/him",
      intent: "Long-term relationship",
      readiness: "Prefer to chat first",
      bio: "Teacher, climber, slow reader. I prefer a few close people to a crowded room.",
      prompt: "I feel most myself when",
      promptAnswer: "I’m outside long enough to forget what time it is.",
      values: ["Curiosity", "Kindness", "Nature"],
      lifestyle: { smoking: "no", children: "want", schedule: "early" },
      color: "#A7B5C7",
    },
    preferences: candidatePreferences({
      ageMin: 29,
      ageMax: 39,
      idealDistanceKm: 15,
      maximumDistanceKm: 50,
      children: "open",
      weights: { proximity: 1 / 3, values: 1, lifestyle: 1, schedule: 1 / 3 },
    }),
  },
  {
    profile: {
      id: "lea",
      name: "Lea",
      age: 29,
      city: "Baden",
      distanceKm: 22,
      pronouns: "she/her",
      intent: "Long-term, open to short",
      readiness: "Ready to meet in person",
      bio: "Museum person, public-transport optimist, and enthusiastic host.",
      prompt: "A small thing that matters",
      promptAnswer: "Remembering what someone takes in their coffee.",
      values: ["Community", "Creativity", "Curiosity"],
      lifestyle: { smoking: "no", children: "open", schedule: "late" },
      color: "#D2C59D",
    },
    preferences: candidatePreferences({
      ageMin: 27,
      ageMax: 35,
      idealDistanceKm: 20,
      maximumDistanceKm: 45,
      weights: {
        proximity: 2 / 3,
        values: 2 / 3,
        lifestyle: 2 / 3,
        schedule: 1 / 3,
      },
    }),
  },
  {
    profile: {
      id: "sam",
      name: "Sam",
      age: 37,
      city: "Luzern",
      distanceKm: 52,
      pronouns: "they/them",
      intent: "Long-term relationship",
      readiness: "Prefer to chat first",
      bio: "Sound designer. Quiet until there is a subject worth getting animated about.",
      prompt: "My ideal first meeting",
      promptAnswer:
        "Coffee and a walk, with permission to keep it short or let it run long.",
      values: ["Kindness", "Curiosity", "Independence"],
      lifestyle: { smoking: "no", children: "do not want", schedule: "late" },
      color: "#B5A8BF",
    },
    preferences: candidatePreferences({
      ageMin: 30,
      ageMax: 41,
      idealDistanceKm: 25,
      maximumDistanceKm: 60,
      children: "do not want",
      weights: {
        proximity: 1 / 3,
        values: 2 / 3,
        lifestyle: 1,
        schedule: 2 / 3,
      },
    }),
  },
];

const overlap = (left: string[], right: string[]) => {
  const union = new Set([...left, ...right]);
  return union.size === 0
    ? 1
    : left.filter((value) => right.includes(value)).length / union.size;
};

export function createIntroduction(
  user: Profile,
  candidate: Candidate,
  preferences: Preferences,
): Introduction {
  validateProfile(user);
  validatePreferences(preferences);
  const other = validateProfile(candidate.profile);
  const otherPreferences = validatePreferences(candidate.preferences);
  const boundaries: Boundary[] = [
    {
      id: "age",
      label: "Mutual age ranges",
      satisfiedForA:
        other.age >= preferences.ageMin && other.age <= preferences.ageMax,
      satisfiedForB:
        user.age >= otherPreferences.ageMin &&
        user.age <= otherPreferences.ageMax,
    },
    {
      id: "distance",
      label: "Mutual maximum distance",
      satisfiedForA: other.distanceKm <= preferences.maximumDistanceKm,
      satisfiedForB: other.distanceKm <= otherPreferences.maximumDistanceKm,
    },
    {
      id: "intent",
      label: "Mutual relationship intentions",
      satisfiedForA: preferences.intents.includes(other.intent),
      satisfiedForB: otherPreferences.intents.includes(user.intent),
    },
    {
      id: "smoking",
      label: "Mutual smoking boundaries",
      satisfiedForA:
        preferences.smoking === "any" || other.lifestyle.smoking === "no",
      satisfiedForB:
        otherPreferences.smoking === "any" || user.lifestyle.smoking === "no",
    },
    {
      id: "children",
      label: "Mutual family-plan boundaries",
      satisfiedForA:
        preferences.children === "any" ||
        preferences.children === "open" ||
        other.lifestyle.children === "open" ||
        preferences.children === other.lifestyle.children,
      satisfiedForB:
        otherPreferences.children === "any" ||
        otherPreferences.children === "open" ||
        user.lifestyle.children === "open" ||
        otherPreferences.children === user.lifestyle.children,
    },
  ];
  const proximityA = proximityCompatibility({
    kilometers: other.distanceKm,
    idealWithinKm: preferences.idealDistanceKm,
    maximumKm: preferences.maximumDistanceKm,
  });
  const proximityB = proximityCompatibility({
    kilometers: other.distanceKm,
    idealWithinKm: otherPreferences.idealDistanceKm,
    maximumKm: otherPreferences.maximumDistanceKm,
  });
  const values = overlap(user.values, other.values);
  const lifestyle =
    user.lifestyle.children === other.lifestyle.children ||
    user.lifestyle.children === "open" ||
    other.lifestyle.children === "open"
      ? 1
      : 0;
  const schedule =
    user.lifestyle.schedule === other.lifestyle.schedule ||
    user.lifestyle.schedule === "flexible" ||
    other.lifestyle.schedule === "flexible"
      ? 1
      : 0.35;
  const factors: Factor[] = [
    {
      id: "proximity",
      label: "Practical distance",
      compatibilityA: proximityA,
      compatibilityB: proximityB,
      weightA: preferences.weights.proximity,
      weightB: otherPreferences.weights.proximity,
    },
    {
      id: "values",
      label: "Selected values",
      compatibilityA: values,
      compatibilityB: values,
      weightA: preferences.weights.values,
      weightB: otherPreferences.weights.values,
    },
    {
      id: "lifestyle",
      label: "Family plans",
      compatibilityA: lifestyle,
      compatibilityB: lifestyle,
      weightA: preferences.weights.lifestyle,
      weightB: otherPreferences.weights.lifestyle,
    },
    {
      id: "schedule",
      label: "Typical schedule",
      compatibilityA: schedule,
      compatibilityB: schedule,
      weightA: preferences.weights.schedule,
      weightB: otherPreferences.weights.schedule,
    },
  ];
  const completeExplanation = explainMatch({ boundaries, factors });
  const candidateTrace =
    candidate.explanationSharing === "shared" ? "shared" : "private";
  const explanation: PublicExplanation = {
    ...completeExplanation,
    factorsForB:
      candidateTrace === "shared" ? completeExplanation.factorsForB : null,
    candidateTrace,
    selectionMode: "score",
    selectionProbability: 1,
    weeklySeed: null,
  };
  const reasons = factors
    .filter(
      (factor) =>
        Math.min(factor.compatibilityA, factor.compatibilityB) >= 0.65,
    )
    .sort(
      (a, b) =>
        Math.min(b.compatibilityA, b.compatibilityB) -
        Math.min(a.compatibilityA, a.compatibilityB),
    )
    .slice(0, 3)
    .map((factor) => factor.label);
  return { profile: toPublicProfile(other), explanation, reasons };
}

export function createIntroductions(
  user = demoUser,
  candidates = demoCandidates,
  preferences = defaultPreferences,
  options: {
    weeklySeed?: string;
    explorationSlots?: number;
    limit?: number;
  } = {},
) {
  const eligible = candidates
    .map((candidate) => createIntroduction(user, candidate, preferences))
    .filter((item) => item.explanation.eligible)
    .sort((a, b) => b.explanation.finalScore - a.explanation.finalScore);
  const limit = Math.min(
    eligible.length,
    Math.max(0, Math.trunc(options.limit ?? eligible.length)),
  );
  const explorationSlots = Math.min(
    limit,
    Math.max(0, Math.trunc(options.explorationSlots ?? 0)),
  );
  if (!options.weeklySeed || explorationSlots === 0 || eligible.length < 2)
    return eligible.slice(0, limit);

  const lotteryValue = (profileId: string) => {
    const value = `${options.weeklySeed}:${user.id}:${profileId}`;
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  eligible.sort(
    (left, right) =>
      right.explanation.finalScore - left.explanation.finalScore ||
      lotteryValue(left.profile.id) - lotteryValue(right.profile.id) ||
      left.profile.id.localeCompare(right.profile.id),
  );
  const exploratoryIds = new Set(
    [...eligible]
      .sort(
        (left, right) =>
          lotteryValue(left.profile.id) - lotteryValue(right.profile.id) ||
          left.profile.id.localeCompare(right.profile.id),
      )
      .slice(0, explorationSlots)
      .map((item) => item.profile.id),
  );
  const probability = explorationSlots / eligible.length;
  const annotate = (
    item: Introduction,
    selectionMode: "score" | "exploration",
  ): Introduction => ({
    ...item,
    explanation: {
      ...item.explanation,
      selectionMode,
      selectionProbability: selectionMode === "exploration" ? probability : 1,
      weeklySeed: options.weeklySeed ?? null,
    },
  });
  const result = eligible
    .filter((item) => !exploratoryIds.has(item.profile.id))
    .slice(0, limit - explorationSlots)
    .map((item) => annotate(item, "score"));
  const exploratory = eligible
    .filter((item) => exploratoryIds.has(item.profile.id))
    .sort(
      (left, right) =>
        lotteryValue(left.profile.id) - lotteryValue(right.profile.id),
    )
    .map((item) => annotate(item, "exploration"));
  const position = lotteryValue("exploration-slot") % (result.length + 1);
  result.splice(position, 0, ...exploratory);
  return result;
}

/** A public Monday date makes each UTC week's lottery reproducible. */
export function publicWeeklySeed(date = new Date()): string {
  if (Number.isNaN(date.getTime())) throw new RangeError("date must be valid");
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const daysSinceMonday = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  return monday.toISOString().slice(0, 10);
}
