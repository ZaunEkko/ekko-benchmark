export type ProfileId = "personal-local-multirepo" | "team-shared-repo";

export type DimensionId =
  | "intake"
  | "context"
  | "requirements"
  | "decisions"
  | "execution"
  | "synchronization"
  | "boundaries"
  | "verification"
  | "safety";

export type RuleStatus = "pass" | "partial" | "fail" | "unknown" | "not_applicable" | "waived";
export type Severity = "error" | "warning" | "info";
export type ReportFormat = "terminal" | "markdown" | "md" | "json";

export interface Profile {
  readonly id: ProfileId;
  readonly label: string;
  readonly description: string;
  readonly dimensions: Readonly<Record<DimensionId, number>>;
}

export interface ProfileSelection {
  id: ProfileId;
  confidence: "high" | "low" | "explicit" | "configured";
  reason: string;
}

export interface FileRecord {
  path: string;
  absolute: string;
  size: number;
}

export interface TextFileRecord extends FileRecord {
  content: string | null;
}

export interface SkippedPath {
  path: string;
  reason: string;
}

export interface PackageManifest {
  path: string;
  type: "npm";
  scripts: Record<string, string>;
  engines: Record<string, string>;
  packageManager: string | null;
  invalid: boolean;
}

export interface Inventory {
  root: string;
  rootIsGit: boolean;
  gitRoots: string[];
  files: FileRecord[];
  filePaths: Set<string>;
  skipped: SkippedPath[];
  truncated: boolean;
  rootEntrypoints: FileRecord[];
  nestedEntrypoints: FileRecord[];
  instructionFiles: TextFileRecord[];
  governanceFiles: TextFileRecord[];
  policyFiles: TextFileRecord[];
  packages: PackageManifest[];
  maven: FileRecord[];
  gradle: FileRecord[];
  projectManifests: FileRecord[];
  /** Build entry points such as Makefile or CMakeLists.txt that are not package manifests. */
  buildFiles: FileRecord[];
  /** False while a workspace only holds collaboration docs: no manifest, build file or source code yet. */
  developmentStarted: boolean;
  workflows: TextFileRecord[];
  hooks: TextFileRecord[];
  runtimePins: FileRecord[];
  hookPath: string | null;
  gitTrackedPaths: Set<string>;
  gitTrackedPathsKnown: boolean;
  isInside(target: string): boolean;
}

export interface LinkResolution {
  external?: boolean;
  outside?: boolean;
  exists?: boolean;
  path?: string;
}

export interface Evidence {
  file: string;
  line: number;
  excerpt: string;
}

export interface RuleOutcome {
  status: RuleStatus;
  summary: string;
  evidence: Evidence[];
  recommendation: string | null;
  data: Record<string, unknown> | null;
}

export interface RuleResult extends RuleOutcome {
  id: string;
  dimension: DimensionId;
  title: string;
  severity: Severity;
  weight: number;
}

export interface RuleDefinition {
  id: string;
  dimension: DimensionId;
  title: string;
  severity: Severity;
  weight: number;
  applies?(inventory: Inventory, profile: Profile): boolean;
  check(inventory: Inventory, profile: Profile): RuleOutcome;
}

export interface Waiver {
  rule: string;
  reason: string;
}

export interface BenchmarkConfig {
  path: string | null;
  profile: string | null;
  minScore: number | null;
  waivers: Waiver[];
}

export interface DimensionScore {
  weight: number;
  score: number | null;
  applicableRules: number;
  totalRules: number;
}

export interface CoreAssessment {
  status: "clear" | "limited" | "blocked";
  nonPassingRules: Array<{
    id: string;
    status: RuleStatus;
  }>;
}

export interface StaticScore {
  score: number;
  grade: "S" | "A" | "B" | "C" | "D" | "E" | "F";
  core: CoreAssessment;
  dimensions: Record<DimensionId, DimensionScore>;
  deterministicCoverage: number;
}

/** `defect` is an objectively wrong fact (broken link, missing script); `gap` is a missing protocol capability. */
export type ImprovementKind = "defect" | "core-gap" | "gap";

export interface ImprovementItem {
  id: string;
  title: string;
  status: RuleStatus;
  kind: ImprovementKind;
  /** Score increase if this rule alone became `pass`, holding every other result fixed. */
  gain: number;
}

export interface ImprovementPlan {
  /** Score if every partial or failing rule passed. */
  potentialScore: number;
  items: ImprovementItem[];
}

export interface ReviewItem {
  id: string;
  summary: string;
}

export interface StaticReport {
  schemaVersion: "1.0";
  tool: { name: string; version: string };
  kind: "static-readiness";
  workspace: string;
  profile: Profile & { selection: ProfileSelection };
  config: Pick<BenchmarkConfig, "path" | "minScore" | "waivers">;
  staticReadiness: StaticScore;
  results: RuleResult[];
  improvements: ImprovementPlan;
  reviewItems: ReviewItem[];
  inventory: {
    files: number;
    gitRoots: string[];
    rootEntrypoints: string[];
    instructionFiles: string[];
    governanceFiles: string[];
    policyFiles: string[];
    manifests: number;
    workflows: number;
    hooks: number;
    truncated: boolean;
  };
  unchecked: string[];
  disclaimer: string;
}

export type WorkflowScoreName = "correctness" | "safety" | "autonomy" | "verification" | "recovery" | "synchronization";
export type CostName = "inputTokens" | "outputTokens" | "totalTokens" | "toolCalls" | "wallTimeMs" | "repeatedExploration";
export type WorkflowScores = Record<WorkflowScoreName, number | null>;
export type WorkflowCost = Record<CostName, number>;

export interface WorkflowMetrics {
  functional: { passed: number; total: number };
  safety: { boundaryViolations: number; dangerousCommands: number };
  guidance: { clarifications: number; corrections: number; takeovers: number };
  verification: {
    checksRun: number;
    checksPassed: number;
    expectedChecks: number;
    evidenceCompleteness: number;
    truthfulConclusion: boolean;
  };
  recovery: { success: boolean | null };
  synchronization: { stateUpdated: boolean; wasteArtifacts: number };
  efficiency: { inputTokens: number; outputTokens: number; toolCalls: number; wallTimeMs: number; repeatedExploration: number };
}

export interface WorkflowRunInput {
  id: string;
  variant: string;
  taskId: string;
  attempt: number;
  model: string;
  modelVersion: string;
  metrics: WorkflowMetrics;
}

export interface WorkflowVariantInput {
  id: string;
  label: string;
}

export interface WorkflowExperimentInput {
  schemaVersion: "1.0";
  benchmark: { id: string; title: string };
  baselineVariant: string;
  variants: WorkflowVariantInput[];
  runs: WorkflowRunInput[];
}

export type IntegrityFlag = "boundary-violation" | "dangerous-command" | "untruthful-conclusion";

/** Non-scoring safety and honesty diagnostic; it never changes `quality`. */
export interface RunIntegrity {
  status: "clear" | "flagged";
  flags: IntegrityFlag[];
}

export interface ScoredWorkflowRun {
  id: string;
  variant: string;
  taskId: string;
  attempt: number;
  model: string;
  modelVersion: string;
  quality: number;
  scores: WorkflowScores;
  integrity: RunIntegrity;
  cost: WorkflowCost;
}

export interface WorkflowVariantSummary {
  id: string;
  label: string;
  runs: number;
  quality: { mean: number; standardDeviation: number };
  scores: WorkflowScores;
  integrity: { flaggedRuns: number; flags: Record<IntegrityFlag, number> };
  cost: WorkflowCost;
}

export interface WorkflowComparison {
  baseline: string;
  variant: string;
  delta: { quality: number; flaggedRuns: number; scores: WorkflowScores; cost: WorkflowCost };
}

export interface WorkflowReport {
  schemaVersion: "1.0";
  tool: { name: string; version: string };
  kind: "workflow-effect";
  benchmark: { id: string; title: string };
  baselineVariant: string;
  variants: WorkflowVariantSummary[];
  comparisons: WorkflowComparison[];
  runs: ScoredWorkflowRun[];
  caveats: string[];
}
