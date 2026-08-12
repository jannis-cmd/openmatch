export const ALGORITHM_VERSION = "1.0.0-draft.4";

export type Factor = {
  id: string;
  label: string;
  compatibilityA: number;
  compatibilityB: number;
  weightA: number;
  weightB: number;
};

export type Boundary = {
  id: string;
  label: string;
  satisfiedForA: boolean;
  satisfiedForB: boolean;
};

export type Contribution = {
  id: string;
  label: string;
  compatibility: number;
  weight: number;
  weightedValue: number;
};

export type Explanation = {
  algorithmVersion: string;
  eligible: boolean;
  failedBoundaries: string[];
  directedFitA: number;
  directedFitB: number;
  reciprocalFit: number;
  exposureFactor: number;
  finalScore: number;
  factorsForA: Contribution[];
  factorsForB: Contribution[];
  hiddenFactors: false;
};

export type DistancePreference = {
  /** Great-circle distance between coarse profile regions, never live GPS. */
  kilometers: number;
  /** Distance at or below which proximity receives full credit. */
  idealWithinKm: number;
  /** User-selected maximum. Distances beyond it are ineligible. */
  maximumKm: number;
};

const unit = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1`);
  }
  return value;
};

function directed(factors: Factor[], side: "A" | "B") {
  const contributions = factors.map((factor) => {
    const compatibility = unit(
      side === "A" ? factor.compatibilityA : factor.compatibilityB,
      `${factor.id}.compatibility${side}`,
    );
    const weight = unit(
      side === "A" ? factor.weightA : factor.weightB,
      `${factor.id}.weight${side}`,
    );
    return {
      id: factor.id,
      label: factor.label,
      compatibility,
      weight,
      weightedValue: compatibility * weight,
    };
  });
  const denominator = contributions.reduce(
    (sum, factor) => sum + factor.weight,
    0,
  );
  return {
    score:
      denominator === 0
        ? 1
        : contributions.reduce((sum, factor) => sum + factor.weightedValue, 0) /
          denominator,
    contributions,
  };
}

export function explainMatch(input: {
  boundaries: Boundary[];
  factors: Factor[];
  exposureFactor?: number;
}): Explanation {
  const failedBoundaries = input.boundaries
    .filter((boundary) => !boundary.satisfiedForA || !boundary.satisfiedForB)
    .map((boundary) => boundary.label);
  const a = directed(input.factors, "A");
  const b = directed(input.factors, "B");
  const reciprocalFit =
    a.score + b.score === 0 ? 0 : (2 * a.score * b.score) / (a.score + b.score);
  const exposureFactor = input.exposureFactor ?? 1;
  if (
    !Number.isFinite(exposureFactor) ||
    exposureFactor < 1 ||
    exposureFactor > 1.1
  ) {
    throw new RangeError("exposureFactor must be between 1 and 1.1");
  }
  const eligible = failedBoundaries.length === 0;
  return {
    algorithmVersion: ALGORITHM_VERSION,
    eligible,
    failedBoundaries,
    directedFitA: a.score,
    directedFitB: b.score,
    reciprocalFit,
    exposureFactor,
    finalScore: eligible ? Math.min(1, reciprocalFit * exposureFactor) : 0,
    factorsForA: a.contributions,
    factorsForB: b.contributions,
    hiddenFactors: false,
  };
}

/**
 * An intentionally simple proximity curve. Full credit inside the user's ideal
 * radius, then a visible linear decline to zero at their maximum radius.
 * Distance is opportunity, not evidence of romantic compatibility.
 */
export function proximityCompatibility(preference: DistancePreference): number {
  const { kilometers, idealWithinKm, maximumKm } = preference;
  if (![kilometers, idealWithinKm, maximumKm].every(Number.isFinite)) {
    throw new RangeError("distance values must be finite");
  }
  if (
    kilometers < 0 ||
    idealWithinKm < 0 ||
    maximumKm <= 0 ||
    idealWithinKm > maximumKm
  ) {
    throw new RangeError("distance values are inconsistent");
  }
  if (kilometers <= idealWithinKm) return 1;
  if (kilometers >= maximumKm) return 0;
  return (maximumKm - kilometers) / (maximumKm - idealWithinKm);
}

export type PreferenceObservation = {
  /** True for explicit interest, false for explicit pass. No message behavior is inferred. */
  interested: boolean;
  /** Compatibility values actually shown in that introduction. */
  factors: Record<string, number>;
  /** Exploration propensity recorded when shown; required to expose sampling bias. */
  selectionProbability: number;
};

export type WeightSuggestion = {
  factorId: string;
  currentWeight: number;
  suggestedWeight: number;
  sampleSize: number;
  interestedMean: number;
  passedMean: number;
  estimatedDifference: number;
  confidence: "low" | "moderate";
  caveat: string;
};

/**
 * Produces editable suggestions; it never changes ranking weights itself.
 * This transparent difference-in-means learner is intentionally weaker than a
 * hidden predictive model. Shrinkage reduces large suggestions from small data.
 */
export function suggestPreferenceWeights(input: {
  observations: PreferenceObservation[];
  currentWeights: Record<string, number>;
  minimumObservations?: number;
}): WeightSuggestion[] {
  const minimum = input.minimumObservations ?? 20;
  if (!Number.isInteger(minimum) || minimum < 10)
    throw new RangeError("minimumObservations must be at least 10");
  const factorIds = [
    ...new Set(
      input.observations.flatMap((observation) =>
        Object.keys(observation.factors),
      ),
    ),
  ].sort();

  return factorIds.flatMap((factorId) => {
    const usable = input.observations.filter((observation) => {
      const value = observation.factors[factorId];
      return (
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 1 &&
        Number.isFinite(observation.selectionProbability) &&
        observation.selectionProbability > 0 &&
        observation.selectionProbability <= 1
      );
    });
    const positive = usable.filter((observation) => observation.interested);
    const negative = usable.filter((observation) => !observation.interested);
    if (usable.length < minimum || positive.length < 5 || negative.length < 5)
      return [];

    const weightedMean = (items: PreferenceObservation[]) => {
      const weights = items.map((item) =>
        Math.min(10, 1 / item.selectionProbability),
      );
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      return (
        items.reduce(
          (sum, item, index) => sum + item.factors[factorId] * weights[index],
          0,
        ) / total
      );
    };
    const interestedMean = weightedMean(positive);
    const passedMean = weightedMean(negative);
    const difference = interestedMean - passedMean;
    const shrinkage = usable.length / (usable.length + 40);
    const currentWeight = unit(
      input.currentWeights[factorId] ?? 0,
      `${factorId}.currentWeight`,
    );
    const suggestedWeight = Math.max(
      0,
      Math.min(1, currentWeight + difference * shrinkage * 0.5),
    );

    return [
      {
        factorId,
        currentWeight,
        suggestedWeight,
        sampleSize: usable.length,
        interestedMean,
        passedMean,
        estimatedDifference: difference,
        confidence:
          usable.length >= 100 ? ("moderate" as const) : ("low" as const),
        caveat:
          "Association in your exposed profiles, not a causal preference or compatibility prediction. Nothing changes unless you accept it.",
      },
    ];
  });
}

export * from "./product.js";
