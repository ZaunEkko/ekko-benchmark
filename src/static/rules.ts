import type { RuleDefinition } from "../types.js";
import { CORE_RULE_IDS } from "./score.js";
import { INTAKE_RULES } from "./rules/intake.js";
import { CONTEXT_RULES } from "./rules/context.js";
import { EXECUTION_RULES } from "./rules/execution.js";
import { VERIFICATION_RULES } from "./rules/verification.js";
import { REQUIREMENTS_RULES } from "./rules/requirements.js";
import { DECISIONS_RULES } from "./rules/decisions.js";
import { BOUNDARIES_RULES } from "./rules/boundaries.js";
import { SAFETY_RULES } from "./rules/safety.js";
import { SYNCHRONIZATION_RULES } from "./rules/synchronization.js";

const CORE_RULE_SET = new Set<string>(CORE_RULE_IDS);

// Report order is part of the output contract; rule files are grouped by dimension.
const RULE_ORDER = [
  "discoverability.root-entrypoint",
  "discoverability.entrypoint-content",
  "intake.start-procedure",
  "intake.clarification-policy",
  "discoverability.entrypoint-versioned",
  "discoverability.multi-tool-consistency",
  "scoping.module-guidance",
  "scoping.layered-loading",
  "context.capability-navigation",
  "context.task-aware-loading",
  "accuracy.local-links",
  "accuracy.documented-commands",
  "accuracy.manifest-validity",
  "accuracy.runtime-version",
  "requirements.artifact-contract",
  "requirements.plan-traceability",
  "requirements.acceptance-contract",
  "decisions.role-separation",
  "decisions.human-confirmed-persistence",
  "decisions.evolution-history",
  "execution.child-instructions",
  "execution.plan-impact",
  "boundaries.repository-shape",
  "boundaries.documented",
  "authorization.git-remote-release",
  "authorization.data-side-effects",
  "verification.commands",
  "verification.module-coverage",
  "verification.acceptance-loop",
  "synchronization.status-source",
  "synchronization.resume-path",
  "synchronization.resume-context",
  "synchronization.completion-sync",
  "safety.tracked-local-files",
  "safety.secrets",
  "safety.destructive-operations",
  "automation.commands-resolve",
  "context.instruction-size",
  "context.duplicate-entrypoints"
] as const;

const BY_ID = new Map(
  [INTAKE_RULES, CONTEXT_RULES, EXECUTION_RULES, VERIFICATION_RULES, REQUIREMENTS_RULES, DECISIONS_RULES, BOUNDARIES_RULES, SAFETY_RULES, SYNCHRONIZATION_RULES].flat().map((rule) => [rule.id, rule] as const)
);

export const RULES: readonly RuleDefinition[] = Object.freeze(RULE_ORDER.map((id) => {
  const rule = BY_ID.get(id);
  if (!rule) throw new Error(`Rule '${id}' is not registered.`);
  return rule;
}));

if (BY_ID.size !== RULES.length) throw new Error("Every registered rule must appear in RULE_ORDER.");

export function listRuleMetadata() {
  return RULES.map(({ id, dimension, title, severity, weight }) => ({
    id,
    dimension,
    title,
    severity,
    weight,
    core: CORE_RULE_SET.has(id)
  }));
}
