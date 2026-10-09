import type { ReportFormat, WorkflowReport, WorkflowVariantSummary } from "../types.js";
import { InputError } from "../errors.js";

function signed(value: number | null): string {
  if (value === null) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function signedCount(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

function integritySummary(variant: WorkflowVariantSummary): string {
  const { flaggedRuns, flags } = variant.integrity;
  if (flaggedRuns === 0) return "无安全或诚实标记";
  return `${flaggedRuns}/${variant.runs} 次运行被标记（越界 ${flags["boundary-violation"]}，危险命令 ${flags["dangerous-command"]}，结论不实 ${flags["untruthful-conclusion"]}）`;
}

export function renderWorkflowTerminal(report: WorkflowReport): string {
  const lines = [
    "Ekko Benchmark - 真实工作流效果",
    "",
    `实验: ${report.benchmark.title} (${report.benchmark.id})`,
    `基线: ${report.baselineVariant}`,
    "",
    "变体汇总",
    "--------"
  ];
  for (const variant of report.variants) {
    lines.push(`- ${variant.label} (${variant.id}): 质量 ${variant.quality.mean.toFixed(1)} +/- ${variant.quality.standardDeviation.toFixed(1)}，运行 ${variant.runs} 次`);
    lines.push(`  正确 ${variant.scores.correctness?.toFixed(1) ?? "N/A"}，安全 ${variant.scores.safety?.toFixed(1) ?? "N/A"}，验证 ${variant.scores.verification?.toFixed(1) ?? "N/A"}，Token ${variant.cost.totalTokens.toFixed(1)}，耗时 ${variant.cost.wallTimeMs.toFixed(1)} ms`);
    lines.push(`  诊断 ${integritySummary(variant)}`);
  }
  lines.push("", "相对基线", "--------");
  for (const comparison of report.comparisons) {
    lines.push(`- ${comparison.variant}: 标记运行 ${signedCount(comparison.delta.flaggedRuns)}，质量 ${signed(comparison.delta.quality)}，正确率 ${signed(comparison.delta.scores.correctness)}，安全 ${signed(comparison.delta.scores.safety)}，Token ${signed(comparison.delta.cost.totalTokens)}，耗时 ${signed(comparison.delta.cost.wallTimeMs)} ms`);
  }
  lines.push("", ...report.caveats.map((item) => `说明: ${item}`));
  return `${lines.join("\n")}\n`;
}

export function renderWorkflowMarkdown(report: WorkflowReport): string {
  const lines = [
    "# Ekko Benchmark 工作流效果报告",
    "",
    `- 实验：${report.benchmark.title}（\`${report.benchmark.id}\`）`,
    `- 基线：\`${report.baselineVariant}\``,
    "",
    "## 变体汇总",
    "",
    "| 变体 | 运行数 | 标记运行 | 质量均值 | 标准差 | 正确率 | 安全 | 验证 | 平均 Token | 平均耗时 ms |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const variant of report.variants) {
    lines.push(`| ${variant.label} | ${variant.runs} | ${variant.integrity.flaggedRuns} | ${variant.quality.mean} | ${variant.quality.standardDeviation} | ${variant.scores.correctness ?? "N/A"} | ${variant.scores.safety ?? "N/A"} | ${variant.scores.verification ?? "N/A"} | ${variant.cost.totalTokens} | ${variant.cost.wallTimeMs} |`);
  }
  lines.push("", "## 相对基线", "", "| 变体 | 标记运行 | 质量 | 正确率 | 安全 | Token | 耗时 ms |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const comparison of report.comparisons) {
    lines.push(`| ${comparison.variant} | ${signedCount(comparison.delta.flaggedRuns)} | ${signed(comparison.delta.quality)} | ${signed(comparison.delta.scores.correctness)} | ${signed(comparison.delta.scores.safety)} | ${signed(comparison.delta.cost.totalTokens)} | ${signed(comparison.delta.cost.wallTimeMs)} |`);
  }
  lines.push("", "## 解释边界", "", ...report.caveats.map((item) => `- ${item}`));
  return `${lines.join("\n")}\n`;
}

export function renderWorkflow(report: WorkflowReport, format: ReportFormat | string): string {
  if (format === "terminal") return renderWorkflowTerminal(report);
  if (format === "markdown" || format === "md") return renderWorkflowMarkdown(report);
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  throw new InputError(`Unknown format '${format}'. Available: terminal, markdown, json`);
}
