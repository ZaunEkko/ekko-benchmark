import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { renderAgentGuide, renderJson, renderMarkdown, renderTerminal } from "../src/report/render.js";
import { scanWorkspace } from "../src/static/scan.js";
import { renderWorkflow } from "../src/workflow/render.js";
import { scoreWorkflowExperiment } from "../src/workflow/score.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "..", "..");

function workspace(t: TestContext): string {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "ekko-benchmark-render-"));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  fs.mkdirSync(path.join(target, ".git"));
  fs.writeFileSync(path.join(target, "AGENTS.md"), [
    "# Rules",
    "Only modify this repository.",
    "Do not expose passwords or tokens."
  ].join("\n"), "utf8");
  return target;
}

function workflowInput(): unknown {
  return JSON.parse(fs.readFileSync(path.join(root, "examples", "workflow-experiment.example.json"), "utf8")) as unknown;
}

function terminalWidth(value: string): number {
  let width = 0;
  for (const character of value) {
    if (/\p{Mark}/u.test(character) || character === "\u200d") continue;
    const codePoint = character.codePointAt(0) ?? 0;
    const wide = codePoint >= 0x1100 && (
      codePoint <= 0x115f
      || (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
      || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
      || (codePoint >= 0xf900 && codePoint <= 0xfaff)
      || (codePoint >= 0xff00 && codePoint <= 0xff60)
    );
    width += wide ? 2 : 1;
  }
  return width;
}

test("renders static reports as terminal, Markdown, and stable JSON", (t) => {
  const report = scanWorkspace(workspace(t), { profile: "team-shared-repo" });
  const terminal = renderTerminal(report);
  const markdown = renderMarkdown(report);
  const json = renderJson(report);

  assert.match(terminal, /EKKO BENCHMARK · 软件工程 AI 协作体检/);
  assert.match(terminal, /核心诊断/);
  assert.match(terminal, /不影响评分/);
  assert.doesNotMatch(terminal, /clarification-polic\n/);
  assert.match(terminal, /Ekko 直评/);
  assert.match(terminal, /维度总览/);
  assert.match(terminal, /需要处理/);
  assert.match(terminal, /通过摘要/);
  assert.match(terminal, /Agent 接力/);
  assert.match(terminal, /npx @zaunekko\/benchmark agent\n/);
  assert.doesNotMatch(terminal, /npx @zaunekko\/benchmark agent \./);
  const dimensionTable = terminal.slice(terminal.indexOf("┌", terminal.indexOf("维度总览")), terminal.indexOf("需要处理"));
  const dimensionLines = dimensionTable.split("\n").filter((line) => /^[┌├└│]/u.test(line));
  assert.ok(dimensionLines.length > 3);
  assert.equal(new Set(dimensionLines.map(terminalWidth)).size, 1, "Chinese terminal table columns should stay aligned");
  assert.match(markdown, /^# Ekko Benchmark 软件工程 AI 协作报告/m);
  assert.match(markdown, /## 核心链路诊断/);
  assert.match(markdown, /## 逐项结果/);
  assert.deepEqual(JSON.parse(json), report);
});

test("renders an evidence-bound full agent semantic scoring protocol", (t) => {
  const report = scanWorkspace(workspace(t), { profile: "team-shared-repo" });
  const guide = renderAgentGuide(report);

  assert.match(guide, /AGENT ENHANCED SCORE · 语义增强重评分协议/);
  assert.match(guide, new RegExp(`静态基线: ${report.staticReadiness.score.toFixed(1)}\/100`));
  assert.match(guide, /全量重评通过项、部分项和失败项/);
  assert.match(guide, /画像权重/);
  assert.match(guide, /核心软件交付规则/);
  assert.match(guide, /requirements\.artifact-contract/);
  assert.match(guide, /核心状态不封顶、不乘系数/);
  assert.match(guide, /S=95-100、A=90-94\.9/);
  assert.match(guide, /计算唯一协作分/);
  assert.match(guide, /静态扫描未定位|证据:/);
  assert.match(guide, /file:line/);
  assert.match(guide, /discoverability\.root-entrypoint/);
  assert.match(guide, /静态协议分: .*不得改写/);
  assert.match(guide, /Agent 语义分: <score>/);
  assert.doesNotMatch(guide, /调用外部 AI/);
});

test("renders workflow reports as terminal, Markdown, and JSON", () => {
  const report = scoreWorkflowExperiment(workflowInput());
  const terminal = renderWorkflow(report, "terminal");
  const markdown = renderWorkflow(report, "markdown");
  const json = renderWorkflow(report, "json");

  assert.match(terminal, /Ekko Benchmark - 真实工作流效果/);
  assert.match(terminal, /相对基线/);
  assert.match(markdown, /^# Ekko Benchmark 工作流效果报告/m);
  assert.match(markdown, /## 解释边界/);
  assert.deepEqual(JSON.parse(json), report);
});
