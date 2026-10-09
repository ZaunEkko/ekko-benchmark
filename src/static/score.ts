import type { CoreAssessment, DimensionId, DimensionScore, ImprovementKind, ImprovementPlan, RuleResult, StaticScore } from "../types.js";

const FACTORS: Readonly<Record<"pass" | "partial" | "fail", number>> = Object.freeze({ pass: 1, partial: 0.5, fail: 0 });

export const CORE_RULE_IDS = Object.freeze([
  "intake.start-procedure",
  "intake.clarification-policy",
  "context.capability-navigation",
  "requirements.artifact-contract",
  "requirements.plan-traceability",
  "requirements.acceptance-contract",
  "decisions.human-confirmed-persistence",
  "execution.plan-impact",
  "verification.commands",
  "verification.acceptance-loop",
  "synchronization.resume-path",
  "synchronization.resume-context",
  "synchronization.completion-sync",
  "boundaries.documented",
  "authorization.git-remote-release",
  "safety.secrets",
  "safety.destructive-operations"
] as const);

const CORE_RULE_SET = new Set<string>(CORE_RULE_IDS);

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function grade(score: number): StaticScore["grade"] {
  if (score >= 95) return "S";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 55) return "D";
  if (score >= 35) return "E";
  return "F";
}

type ScoredRule = Pick<RuleResult, "id" | "dimension" | "status" | "weight">;
type ScoringProfile = { dimensions: Readonly<Partial<Record<DimensionId, number>>> };

function assessCore(results: ScoredRule[]): CoreAssessment {
  const nonPassingRules = results
    .filter((result) => CORE_RULE_SET.has(result.id) && result.status !== "pass")
    .map(({ id, status }) => ({ id, status }));
  if (nonPassingRules.some((result) => result.status === "fail")) {
    return { status: "blocked", nonPassingRules };
  }
  if (nonPassingRules.length > 0) {
    return { status: "limited", nonPassingRules };
  }
  return { status: "clear", nonPassingRules: [] };
}

// Rules whose failure is an objectively wrong workspace fact rather than a missing convention.
export const DEFECT_RULE_IDS = Object.freeze([
  "accuracy.local-links",
  "accuracy.documented-commands",
  "accuracy.manifest-validity",
  "automation.commands-resolve",
  "safety.tracked-local-files"
] as const);

const DEFECT_RULE_SET = new Set<string>(DEFECT_RULE_IDS);
const KIND_ORDER: Readonly<Record<ImprovementKind, number>> = Object.freeze({ defect: 0, "core-gap": 1, gap: 2 });

/**
 * Ranks partial and failing rules by what fixing them is worth: objective defects first, then core
 * delivery gaps, then other gaps; within a kind, by the score each would add on its own.
 */
export function rankImprovements(results: Array<ScoredRule & Pick<RuleResult, "title">>, profile: ScoringProfile): ImprovementPlan {
  const base = calculateStaticScore(results, profile).score;
  const promote = (ids: ReadonlySet<string>) => results.map((result) => ids.has(result.id) ? { ...result, status: "pass" as const } : result);
  const open = results.filter((result) => result.status === "partial" || result.status === "fail");
  const items = open
    .map((result, index) => ({
      index,
      item: {
        id: result.id,
        title: result.title,
        status: result.status,
        kind: (DEFECT_RULE_SET.has(result.id) ? "defect" : CORE_RULE_SET.has(result.id) ? "core-gap" : "gap") as ImprovementKind,
        gain: round(calculateStaticScore(promote(new Set([result.id])), profile).score - base)
      }
    }))
    .sort((left, right) => KIND_ORDER[left.item.kind] - KIND_ORDER[right.item.kind] || right.item.gain - left.item.gain || left.index - right.index)
    .map(({ item }) => item);
  return {
    potentialScore: calculateStaticScore(promote(new Set(open.map((result) => result.id))), profile).score,
    items
  };
}

export function calculateStaticScore(results: ScoredRule[], profile: ScoringProfile): StaticScore {
  const dimensions = {} as Record<DimensionId, DimensionScore>;
  for (const [dimension, profileWeight] of Object.entries(profile.dimensions) as [DimensionId, number][]) {
    const applicable = results.filter((result) => result.dimension === dimension && Object.hasOwn(FACTORS, result.status));
    const denominator = applicable.reduce((sum, result) => sum + result.weight, 0);
    const numerator = applicable.reduce((sum, result) => sum + result.weight * FACTORS[result.status as keyof typeof FACTORS], 0);
    dimensions[dimension] = {
      weight: profileWeight,
      score: denominator > 0 ? round((numerator / denominator) * 100) : null,
      applicableRules: applicable.length,
      totalRules: results.filter((result) => result.dimension === dimension).length
    };
  }

  const scoredDimensions = Object.values(dimensions).filter(
    (dimension): dimension is DimensionScore & { score: number } => dimension.score !== null
  );
  const dimensionWeight = scoredDimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  const score = dimensionWeight > 0
    ? round(scoredDimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) / dimensionWeight)
    : 0;
  const deterministic = results.filter((result) => Object.hasOwn(FACTORS, result.status) || result.status === "waived").length;
  const unknown = results.filter((result) => result.status === "unknown").length;

  return {
    score,
    grade: grade(score),
    core: assessCore(results),
    dimensions,
    deterministicCoverage: deterministic + unknown > 0 ? round((deterministic / (deterministic + unknown)) * 100) : 100
  };
}
