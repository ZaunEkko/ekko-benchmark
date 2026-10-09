import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scoreWorkflowExperiment } from "../src/workflow/score.js";

const directory = path.dirname(fileURLToPath(import.meta.url));

function example() {
  return JSON.parse(fs.readFileSync(path.join(directory, "..", "..", "examples", "workflow-experiment.example.json"), "utf8"));
}

test("scores workflow quality separately from cost", () => {
  const report = scoreWorkflowExperiment(example());
  const comparison = report.comparisons[0];

  assert.equal(report.kind, "workflow-effect");
  assert.ok(comparison.delta.quality > 0);
  assert.ok(comparison.delta.cost.totalTokens > 0);
  assert.ok(comparison.delta.cost.wallTimeMs < 0);
  assert.equal(Object.hasOwn(report.variants[0].quality, "costAdjusted"), false);
});

test("rejects missing required measurements instead of assuming ideal values", () => {
  const input = example();
  delete input.runs[0].metrics.verification.truthfulConclusion;

  assert.throws(() => scoreWorkflowExperiment(input), /truthfulConclusion must be a boolean/);
});

test("rejects unsupported workflow schema versions", () => {
  const input = example();
  input.schemaVersion = "2.0";

  assert.throws(() => scoreWorkflowExperiment(input), /schemaVersion must be '1\.0'/);
});

test("rejects malformed run objects as input errors", () => {
  const input = example();
  input.runs[0] = null;

  assert.throws(() => scoreWorkflowExperiment(input), /runs\[0\] must be a JSON object/);
});

test("requires every workflow variant to use the same task and attempt pairs", () => {
  const input = example();
  input.runs.find((run: { id: string }) => run.id === "guided-2").taskId = "different-task";

  assert.throws(() => scoreWorkflowExperiment(input), /same taskId\/attempt pairs/);
});

test("requires paired workflow runs to use the same model version", () => {
  const input = example();
  input.runs.find((run: { id: string }) => run.id === "guided-1").modelVersion = "different-version";

  assert.throws(() => scoreWorkflowExperiment(input), /same model and modelVersion/);
});

test("rejects duplicate run identifiers", () => {
  const input = example();
  input.runs[1].id = input.runs[0].id;

  assert.throws(() => scoreWorkflowExperiment(input), /Duplicate run id/);
});

test("excludes recovery only when a run explicitly records null", () => {
  const input = example();
  for (const run of input.runs) run.metrics.recovery.success = null;
  const report = scoreWorkflowExperiment(input);

  assert.equal(report.variants[0].scores.recovery, null);
  assert.equal(report.runs[0].scores.recovery, null);
});

test("flags unsafe or untruthful runs without changing the quality score", () => {
  const input = example();
  const clean = scoreWorkflowExperiment(input);
  const target = input.runs.find((run: { id: string }) => run.id === "guided-1");
  const before = clean.runs.find((run) => run.id === "guided-1");
  assert.ok(before);
  assert.equal(before.integrity.status, "clear");

  target.metrics.verification.truthfulConclusion = false;
  const report = scoreWorkflowExperiment(input);
  const flagged = report.runs.find((run) => run.id === "guided-1");
  assert.ok(flagged);

  assert.equal(flagged.integrity.status, "flagged");
  assert.deepEqual(flagged.integrity.flags, ["untruthful-conclusion"]);
  assert.equal(flagged.scores.correctness, before.scores.correctness);
  const guided = report.variants.find((variant) => variant.id === "with-guidance");
  assert.ok(guided);
  assert.equal(guided.integrity.flags["untruthful-conclusion"], 1);
});

test("compares flagged run counts between variants", () => {
  const report = scoreWorkflowExperiment(example());
  const baseline = report.variants.find((variant) => variant.id === report.baselineVariant);
  const guided = report.variants.find((variant) => variant.id !== report.baselineVariant);
  assert.ok(baseline && guided);

  assert.equal(report.comparisons[0].delta.flaggedRuns, guided.integrity.flaggedRuns - baseline.integrity.flaggedRuns);
  assert.ok(baseline.integrity.flaggedRuns > 0);
});
