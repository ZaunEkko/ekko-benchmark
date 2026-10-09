import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { evidence } from "../src/core/evidence.js";
import { scanWorkspace } from "../src/static/scan.js";
import { calculateStaticScore, grade, rankImprovements } from "../src/static/score.js";
import { spawnSync } from "node:child_process";
import type { RuleResult, StaticReport } from "../src/types.js";

function workspace(t: TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ekko-benchmark-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root: string, relative: string, content = ""): void {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function rule(report: StaticReport, id: string): RuleResult {
  const result = report.results.find((item) => item.id === id);
  assert.ok(result, `Missing rule result: ${id}`);
  return result;
}

const COLLABORATION_CAPABILITY_RULES = [
  "context.capability-navigation",
  "context.task-aware-loading",
  "requirements.artifact-contract",
  "requirements.plan-traceability",
  "requirements.acceptance-contract",
  "decisions.role-separation",
  "decisions.human-confirmed-persistence",
  "decisions.evolution-history",
  "execution.plan-impact",
  "verification.acceptance-loop",
  "synchronization.status-source",
  "synchronization.resume-path",
  "synchronization.resume-context",
  "synchronization.completion-sync"
] as const;

function assertCapabilityProtocol(report: StaticReport): void {
  for (const id of COLLABORATION_CAPABILITY_RULES) {
    assert.equal(rule(report, id).status, "pass", id);
  }
}

test("scores a Spec/Design/ADR/HANDOFF-style requirement protocol without running a task", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, "backend", ".git"), { recursive: true });
  fs.mkdirSync(path.join(root, "frontend", ".git"), { recursive: true });
  write(root, "CLAUDE.md", [
    "# AI 协作入口",
    "当前目录包含 backend 和 frontend 两个独立 Git 仓库，只能在目标仓库执行写入。",
    "开始实质任务前按以下顺序建立上下文：",
    "1. [HANDOFF](HANDOFF.md)：当前状态、阻塞和下一步。",
    "2. [Rules](docs/rules/README.md)：任务适用的长期规则。",
    "3. [Spec](docs/spec/README.md)：与当前需求同名的事实规格。",
    "4. [ADR](docs/adr/README.md)：用户已确认的关键决策。",
    "5. [Design](docs/design/README.md)：同名方案与待确认项。",
    "需求存在不确定项时必须询问用户，未获确认前保持 Draft，不得把猜测写成事实。",
    "进入子仓库工作前必须读取并遵守该仓库自己的 AGENTS.md。",
    "实现或验证发生变化时，同步更新对应 Spec、Design、ADR 和 HANDOFF。",
    "未经许可不得 commit；未经许可不得 push、merge、tag 或发布。",
    "数据库迁移或覆盖文件必须先确认并获得授权。",
    "禁止输出密码、Token、Cookie 或其他敏感信息。",
    "删除或清理文件前必须确认精确范围和恢复方式。",
    "在 frontend 运行 npm test 完成验证，并把验证结果记录到 HANDOFF。"
  ].join("\n"));
  write(root, "HANDOFF.md", [
    "# 当前任务状态",
    "当前进度：准备接收下一项需求。",
    "阻塞与待确认：无。",
    "验证结果：上一个需求的窄测试已通过。",
    "推荐接续顺序：读取规则后继续。"
  ].join("\n"));
  write(root, "docs/rules/README.md", [
    "# Rules",
    "Rules 只记录跨需求长期有效的强约束。",
    "需求当前如何工作写入同名 Spec；本次方案写入同名 Design；确认决策写入 ADR；进度写入 HANDOFF。"
  ].join("\n"));
  write(root, "docs/spec/README.md", [
    "# Spec",
    "收到新需求时创建对应 Spec。",
    "本目录按需求记录当前代码可验证的实现事实，每个 Spec 与 Design 使用同名文件一一对应。",
    "实现完成后同步更新对应 Spec，使其重新描述当前实现。"
  ].join("\n"));
  write(root, "docs/spec/example.md", "# 当前实现\n");
  write(root, "docs/design/README.md", [
    "# Design",
    "Design 与 Spec 使用同名文件，记录目标方案、待确认项、影响文件和验收用例。",
    "状态使用 Draft、Approved、Implemented；实施完成并验证后更新状态并同步 Spec。"
  ].join("\n"));
  write(root, "docs/design/example.md", "# 目标方案\n");
  write(root, "docs/adr/README.md", [
    "# ADR",
    "只有用户或项目负责人确认的关键取舍才记录为 Accepted ADR。",
    "状态使用 Proposed、Accepted、Superseded；决策变化时新建 ADR 并保留历史，不得静默改写原结论。"
  ].join("\n"));
  write(root, "backend/AGENTS.md", "# Backend rules\nRun checks before completion.\n");
  write(root, "frontend/AGENTS.md", "# Frontend rules\nRun npm test before completion.\n");
  write(root, "frontend/package.json", JSON.stringify({
    scripts: { test: "node --test" },
    engines: { node: ">=20" }
  }));

  const report = scanWorkspace(root);

  assert.equal(report.profile.id, "personal-local-multirepo");
  assert.ok(report.staticReadiness.score >= 90, `expected Spec/Design/ADR/HANDOFF-style protocol to score highly, got ${report.staticReadiness.score}`);
  for (const id of [
    "intake.start-procedure",
    "intake.clarification-policy",
    ...COLLABORATION_CAPABILITY_RULES,
    "execution.child-instructions",
  ]) {
    assert.equal(rule(report, id).status, "pass", id);
  }
  assert.equal(rule(report, "discoverability.entrypoint-versioned").status, "not_applicable");
  const clarification = rule(report, "intake.clarification-policy");
  assert.equal(clarification.evidence.length, 1);
  assert.equal(clarification.evidence[0].file, "CLAUDE.md");
  assert.match(clarification.evidence[0].excerpt, /不确定.*询问用户/);
  const handoff = rule(report, "synchronization.resume-context");
  assert.ok(handoff.evidence.length >= 3);
  assert.ok(handoff.evidence.every((item) => ["CLAUDE.md", "HANDOFF.md"].includes(item.file) && item.line >= 1));
  assert.ok(handoff.evidence.some((item) => item.line > 1));
  assert.equal(report.results.some((result) => result.id === "automation.gate-present"), false);
});

test("recognizes the same capabilities in an OpenSpec-style workflow", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", [
    "# Agent workflow",
    "接到任务后，按任务类型读取 [OpenSpec index](openspec/README.md)。",
    "开始工作前读取当前任务状态，并加载长期规范、需求目标与范围、实施设计、已确认设计约束和验证要求。",
    "存在不确定项时必须询问用户；未经确认保持 pending，不得猜测。",
    "未经许可不得 commit、push、merge、tag 或发布。",
    "删除、覆盖或数据库写入必须先确认范围、恢复方式并获得授权。",
    "禁止输出密码、Token、Cookie 或其他敏感信息。",
    "运行 npm test 验证。"
  ].join("\n"));
  write(root, "openspec/README.md", [
    "# OpenSpec workflow",
    "本页是当前任务状态的唯一入口，文档职责分别记录当前变更、长期规范、需求、计划和确认决策。",
    "[changes/current.md](changes/current.md) 记录当前工作进度；[specs/general.md](specs/general.md) 保存跨需求长期规范。",
    "新任务到来时创建同一变更目录，包含 proposal 需求目标与范围、design 实施方案和 tasks 任务清单。",
    "proposal 记录需求来源、目标、范围和当前行为；design 固定验收标准与验收用例。",
    "负责人确认关键取舍后，记录到 accepted constraints 决策区。",
    "决策状态使用 Proposed、Accepted、Superseded；决策变化时新建记录并保留历史。",
    "design 实施方案记录技术步骤、影响模块和 affected files。",
    "实现完成后执行 npm test；测试、构建和人工验证结果必须记录。",
    "需求或 scope 发生变更时更新 proposal、design 和 tasks；完成并验证后归档任务状态。"
  ].join("\n"));
  write(root, "openspec/changes/current.md", [
    "# 当前任务状态",
    "当前工作进度：实现中。",
    "阻塞与 pending：等待接口确认。",
    "验证结果：窄测试已通过。",
    "下一步：完成集成检查。"
  ].join("\n"));
  write(root, "openspec/specs/general.md", "# Long-lived constraints\n跨需求长期规范记录稳定约束。\n");
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" }, engines: { node: ">=20" } }));

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assertCapabilityProtocol(report);
});

test("recognizes a custom workflow without Spec/Design/ADR or OpenSpec artifact names", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  const files: Array<[string, string]> = [
    ["AGENTS.md", [
      "# 协作入口",
      "收到自然语言需求时，按任务类型从 [协作索引](playbook/index.md) 加载当前工作、长期约束、需求目标与范围、实施方案、已确认选择和验证要求。",
      "开始工作前读取 [当前工作](work/now.md) 的当前任务状态、阻塞和下一步。",
      "有不确定项必须询问负责人，确认前保持 pending，不得猜测。",
      "未经许可不得 commit、push、merge、tag 或发布。",
      "删除、覆盖或数据库写入必须先确认范围、恢复方式并获得授权。",
      "禁止输出密码、Token、Cookie 或其他敏感信息。",
      "运行 npm test 验证。"
    ].join("\n")],
    ["playbook/index.md", [
      "# 协作索引",
      "文档职责分别记录：[长期约束](knowledge/guardrails.md)、[需求简报](../work/brief.md)、[实施方法](../work/approach.md)、[选择记录](../choices/log.md)和[当前工作](../work/now.md)。",
      "收到新需求时创建 brief 需求记录和 approach 实施记录。",
      "brief 记录需求来源、目标、范围和当前行为。",
      "同一工作项中，brief 需求记录与 approach 实施计划通过工作项 ID 关联。",
      "approach 中的实施方案记录技术步骤、影响模块、affected files 和验收标准。",
      "负责人确认关键取舍后追加写入 choices log，确认前不沉淀为既定选择。",
      "选择状态使用 Draft、Confirmed、Superseded；关键选择变化时追加新记录并保留历史，不得覆盖旧记录。",
      "实现完成后必须运行 npm test，并记录测试结果和未检查范围到当前工作。",
      "实现或需求范围发生变化时同步更新 brief、approach、choices log 和当前工作记录。"
    ].join("\n")],
    ["playbook/knowledge/guardrails.md", "# 长期约束\n这里只记录跨需求长期有效的规则和约束。\n"],
    ["work/brief.md", "# 需求简报\n目标、范围与当前行为。\n"],
    ["work/approach.md", "# 实施方法\n技术步骤与影响模块。\n"],
    ["choices/log.md", "# 选择记录\nConfirmed choices remain traceable.\n"],
    ["work/now.md", [
      "# 当前工作",
      "当前工作进度：正在实现。",
      "阻塞与 pending：无。",
      "验证结果：局部检查已通过。",
      "下一步：运行完整测试。"
    ].join("\n")]
  ];
  for (const [relative, content] of files) write(root, relative, content);
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" }, engines: { node: ">=20" } }));

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.doesNotMatch(files.map(([, content]) => content).join("\n"), /\b(?:Spec|Design|ADR|HANDOFF|OpenSpec)\b/i);
  assertCapabilityProtocol(report);
});

test("does not confuse familiar artifact names with collaboration capabilities", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", [
    "# Agent",
    "Read [Rules](docs/rules/README.md), [Spec](docs/spec/README.md), [Design](docs/design/README.md), and [ADR](docs/adr/README.md).",
    "冲突时选择更新、更靠近当前任务目录的规范。"
  ].join("\n"));
  write(root, "docs/rules/README.md", "# Rules\n");
  write(root, "docs/spec/README.md", "# Spec\n每个需求可以使用同名 Spec。\n");
  write(root, "docs/design/README.md", "# Design\n");
  write(root, "docs/adr/README.md", "# ADR\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(rule(report, "context.capability-navigation").status, "fail");
  assert.equal(rule(report, "requirements.artifact-contract").status, "fail");
  assert.notEqual(rule(report, "requirements.plan-traceability").status, "pass");
  assert.equal(rule(report, "requirements.acceptance-contract").status, "fail");
  assert.notEqual(rule(report, "decisions.role-separation").status, "pass");
  assert.ok(report.staticReadiness.score < 70);
});

test("does not infer requirement lifecycle from business change identifiers or adjacent artifact names", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", [
    "新增 ACCOUNT_LEVEL_CHANGED 事件记录。",
    "修改前读取 `docs/frontend-spec.md` 和 `docs/design.md`。"
  ].join("\n"));
  write(root, "docs/frontend-spec.md", "# Frontend spec\n");
  write(root, "docs/design.md", "# Design\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(rule(report, "requirements.artifact-contract").status, "fail");
  assert.notEqual(rule(report, "requirements.plan-traceability").status, "pass");
});

test("does not infer active clarification from separate pending and confirmed-decision statements", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", [
    "# Agent workflow",
    "Design 记录目标方案和待确认项。",
    "只有用户确认的关键取舍才写入 ADR。"
  ].join("\n"));

  const result = rule(scanWorkspace(root, { profile: "team-shared-repo" }), "intake.clarification-policy");

  assert.equal(result.status, "partial");
  assert.match(result.summary, /没有直接建立/);
});

test("recognizes a numbered startup procedure and constrained ambiguity confirmation", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", [
    "# 开工顺序",
    "1. 读取 `HANDOFF.md` 恢复当前状态。",
    "2. 确认任务涉及的模块并加载局部规则。",
    "只在真正关键业务歧义前确认。"
  ].join("\n"));
  write(root, "HANDOFF.md", "# 当前任务状态\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(rule(report, "intake.start-procedure").status, "pass");
  assert.equal(rule(report, "intake.clarification-policy").status, "pass");
});

test("requires all lifecycle fact types for full context navigation credit", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "开始任务前按以下顺序读取当前任务状态、长期规则、需求规格和实施计划。\n");

  const result = rule(scanWorkspace(root, { profile: "team-shared-repo" }), "context.capability-navigation");

  assert.equal(result.status, "partial");
  assert.deepEqual(result.data?.roles, ["guidance", "requirement", "plan", "status"]);
});

test("does not use a historical validation result as the repository verification contract", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", [
    "# Agent workflow",
    "实现完成后必须运行 npm test 完成验证。",
    "查看 [历史设计](docs/design/example.md)。"
  ].join("\n"));
  write(root, "docs/design/example.md", "# 历史设计\n验证结果：上一项任务已经通过。\n");
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));

  const result = rule(scanWorkspace(root, { profile: "team-shared-repo" }), "verification.acceptance-loop");

  assert.equal(result.status, "partial");
});

test("requires acceptance criteria to have a requirement or implementation artifact home", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "实现完成后按照验收标准验证。\n");

  const generic = rule(scanWorkspace(root, { profile: "team-shared-repo" }), "requirements.acceptance-contract");
  assert.equal(generic.status, "partial");

  write(root, "AGENTS.md", "每个需求记录必须包含验收标准。\n");
  const explicit = rule(scanWorkspace(root, { profile: "team-shared-repo" }), "requirements.acceptance-contract");
  assert.equal(explicit.status, "pass");
});

test("accepts append-only decision supersession without prescribed status names", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "关键决策变化时新建 ADR，标注取代关系并保留旧记录，不得改写历史结论。\n");

  const result = rule(scanWorkspace(root, { profile: "team-shared-repo" }), "decisions.evolution-history");

  assert.equal(result.status, "pass");
});

test("recognizes target-repository discovery followed by local instruction loading", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "确认任务涉及哪些仓库，再读取每个目标仓库内最近的 AGENTS.md。\n");
  write(root, "backend/AGENTS.md", "# Backend rules\n");

  const result = rule(scanWorkspace(root, { profile: "team-shared-repo" }), "execution.child-instructions");

  assert.equal(result.status, "pass");
});

test("scores resume context from the linked state artifact instead of nearby root-entry text", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", [
    "# Agent workflow",
    "开始任务前读取 [当前状态](HANDOFF.md)。",
    "根入口附近同时写着进度、阻塞、验证结果和下一步，但这些不是状态记录。"
  ].join("\n"));
  write(root, "HANDOFF.md", [
    "# 当前任务交接",
    "当前进度：正在实现。",
    "待验收：登录态检查。",
    "下一步：继续修改。"
  ].join("\n"));

  const result = rule(scanWorkspace(root, { profile: "team-shared-repo" }), "synchronization.resume-context");

  assert.equal(result.status, "partial");
  assert.equal(result.data?.signals, 3);
  assert.ok(result.evidence.every((item) => item.file === "HANDOFF.md"));
});

test("accepts an explicitly empty current-work index as a resumable idle state", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", [
    "# Agent workflow",
    "开始任务前读取 [工作索引](workflow/ledger.md)。"
  ].join("\n"));
  write(root, "workflow/ledger.md", [
    "# 状态索引",
    "任务状态以本文件为准。",
    "## 5. 当前进行中任务",
    "| 任务 | 状态 |",
    "| --- | --- |",
    "## 已完成任务",
    "| 任务 | 状态 |",
    "| --- | --- |",
    "| setup | done |"
  ].join("\n"));

  const result = rule(scanWorkspace(root, { profile: "team-shared-repo" }), "synchronization.resume-context");

  assert.equal(result.status, "pass");
  assert.equal(result.data?.idle, true);
  assert.equal(result.evidence[0].file, "workflow/ledger.md");
});

test("accepts an explicit idle marker inside the current-work table", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "开工时读取 `HANDOFF.md`。\n");
  write(root, "HANDOFF.md", [
    "# 当前任务交接",
    "| 任务 | 状态 | 阻塞 | 说明 | 下一步 |",
    "| --- | --- | --- | --- | --- |",
    "| - | - | - | 当前无活动变更 | - |"
  ].join("\n"));

  const result = rule(scanWorkspace(root, { profile: "team-shared-repo" }), "synchronization.resume-context");

  assert.equal(result.status, "pass");
  assert.equal(result.data?.idle, true);
});

test("does not let a historical idle note hide an incomplete active handoff", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "开始任务前读取 [当前状态](HANDOFF.md)。\n");
  write(root, "HANDOFF.md", [
    "# 当前任务交接",
    "当前进度：正在实现登录校验。",
    "历史备注：此前无进行中任务。"
  ].join("\n"));

  const result = rule(scanWorkspace(root, { profile: "team-shared-repo" }), "synchronization.resume-context");

  assert.equal(result.status, "partial");
  assert.notEqual(result.data?.idle, true);
});

test("auto-detects a non-git coordination root with nested repositories", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, "backend", ".git"), { recursive: true });
  fs.mkdirSync(path.join(root, "frontend", ".git"), { recursive: true });
  write(root, "CLAUDE.md", [
    "# 协作规则",
    "当前目录包含 backend 和 frontend 两个独立 Git 仓库。",
    "未经许可，不得 commit、push、merge、tag 或发布。",
    "数据库迁移和覆盖文件必须先获得授权。",
    "禁止输出密码、Token、Cookie 和其他敏感凭据。",
    "删除前说明范围并确认。",
    "运行 npm test 验证。"
  ].join("\n"));
  write(root, "frontend/package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  write(root, "HANDOFF.md", "# 当前任务\n");
  write(root, "docs/spec/README.md", "# 当前实现\n");

  const report = scanWorkspace(root);

  assert.equal(report.profile.id, "personal-local-multirepo");
  assert.equal(report.profile.selection.confidence, "high");
  assert.equal(report.inventory.gitRoots.length, 2);
  assert.equal(rule(report, "boundaries.repository-shape").status, "pass");
});

test("reports broken local instruction links with a source line", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "# Rules\n\nRead [missing rules](docs/missing.md).\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });
  const result = rule(report, "accuracy.local-links");

  assert.equal(result.status, "fail");
  assert.equal(result.evidence[0].file, "AGENTS.md");
  assert.equal(result.evidence[0].line, 3);
  assert.deepEqual(result.data?.broken, [{ file: "AGENTS.md", target: "docs/missing.md" }]);
});

test("rejects local governance links that escape the workspace", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "# Rules\n\nRead [outside rules](../outside-rules.md).\n");

  const result = rule(scanWorkspace(root, { profile: "team-shared-repo" }), "accuracy.local-links");

  assert.equal(result.status, "fail");
  assert.deepEqual(result.data?.broken, [{ file: "AGENTS.md", target: "../outside-rules.md" }]);
});

test("does not follow directory links while resolving governance documents", (t) => {
  const root = workspace(t);
  const outside = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "# Rules\n\nRead [linked rules](linked/rules.md).\n");
  write(outside, "rules.md", "EXTERNAL_MARKER must never enter the report.\n");
  try {
    fs.symlinkSync(outside, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (["EPERM", "EACCES", "ENOTSUP"].includes(code)) {
      t.skip(`Directory links are unavailable in this environment (${code}).`);
      return;
    }
    throw error;
  }

  const report = scanWorkspace(root, { profile: "team-shared-repo" });
  const result = rule(report, "accuracy.local-links");

  assert.equal(result.status, "fail");
  assert.ok(report.reviewItems.some((item) => item.id === "skipped-files"));
  assert.doesNotMatch(JSON.stringify(report), /EXTERNAL_MARKER/);
});

test("honors explicit root-entry read prohibitions without treating write-only rules as exclusions", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", [
    "`history/` 是私有封档；不要列目录、搜索、读取或访问。",
    "`blog/` 不得写入新文章。",
    "所有工作必须以 `specs/` 为准；未读取对应规范不得开始编码。"
  ].join("\n"));
  write(root, "history/AGENTS.md", "PRIVATE_HISTORY_MARKER\n");
  write(root, "blog/AGENTS.md", "禁止输出密码或 Token。\n");
  write(root, "specs/AGENTS.md", "# Required specs\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(report.inventory.instructionFiles.includes("history/AGENTS.md"), false);
  assert.equal(report.inventory.instructionFiles.includes("blog/AGENTS.md"), true);
  assert.equal(report.inventory.instructionFiles.includes("specs/AGENTS.md"), true);
  assert.ok(report.reviewItems.some((item) => item.id === "policy-excluded"));
  assert.match(report.unchecked.join("\n"), /history\//);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_HISTORY_MARKER/);
});

test("reports permission-limited directories instead of treating them as empty", {
  skip: process.platform === "win32" ? "POSIX permission bits are not enforced on Windows" : false
}, (t) => {
  const root = workspace(t);
  const restricted = path.join(root, "restricted");
  fs.mkdirSync(restricted);
  write(root, "AGENTS.md", "# Rules\nOnly modify this repository.\n");
  fs.chmodSync(restricted, 0o000);
  // Restore before workspace cleanup: node:test runs after-hooks in registration order,
  // so a later t.after would run only after the directory removal had already failed.
  let report;
  try {
    report = scanWorkspace(root, { profile: "team-shared-repo" });
  } finally {
    fs.chmodSync(restricted, 0o700);
  }

  assert.ok(report.reviewItems.some((item) => item.id === "skipped-files"));
});

test("does not read oversized instruction files into evidence", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", `OVERSIZED_SECRET_MARKER\n${"x".repeat(513 * 1024)}`);

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(rule(report, "discoverability.entrypoint-content").status, "fail");
  assert.equal(rule(report, "context.instruction-size").status, "partial");
  assert.ok(report.reviewItems.some((item) => item.id === "unreadable-governance"));
  assert.doesNotMatch(JSON.stringify(report), /OVERSIZED_SECRET_MARKER/);
});

test("reports invalid UTF-8 governance files for manual review", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  fs.writeFileSync(path.join(root, "AGENTS.md"), Buffer.from([0x23, 0x20, 0x52, 0x75, 0x6c, 0x65, 0x73, 0x0a, 0xc3, 0x28]));

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(rule(report, "discoverability.entrypoint-content").status, "fail");
  assert.ok(report.reviewItems.some((item) => item.id === "unreadable-governance"));
});

test("excludes not-applicable and unknown rules from the score denominator", () => {
  const profile = { dimensions: { requirements: 100 } };
  const result = calculateStaticScore([
    { id: "support.pass", dimension: "requirements", status: "pass", weight: 1 },
    { id: "support.fail", dimension: "requirements", status: "fail", weight: 1 },
    { id: "support.na", dimension: "requirements", status: "not_applicable", weight: 100 },
    { id: "support.unknown", dimension: "requirements", status: "unknown", weight: 100 }
  ], profile);

  assert.equal(result.score, 50);
  assert.equal(result.core.status, "clear");
  assert.equal(result.dimensions.requirements.applicableRules, 2);
  assert.equal(result.deterministicCoverage, 66.7);
});

test("reports core delivery gaps without changing the weighted score or grade", () => {
  const profile = { dimensions: { requirements: 100 } };
  const supporting = { id: "supporting.rule", dimension: "requirements" as const, status: "pass" as const, weight: 99 };

  const limited = calculateStaticScore([
    supporting,
    { id: "requirements.artifact-contract", dimension: "requirements", status: "partial", weight: 1 }
  ], profile);
  const blocked = calculateStaticScore([
    supporting,
    { id: "requirements.artifact-contract", dimension: "requirements", status: "fail", weight: 1 }
  ], profile);

  assert.equal(limited.score, 99.5);
  assert.equal(limited.grade, "S");
  assert.equal(limited.core.status, "limited");
  assert.deepEqual(limited.core.nonPassingRules, [{ id: "requirements.artifact-contract", status: "partial" }]);

  assert.equal(blocked.score, 99);
  assert.equal(blocked.grade, "S");
  assert.equal(blocked.core.status, "blocked");
  assert.notEqual(limited.score, blocked.score);
});

test("reserves S grade for final scores of 95 or higher", () => {
  assert.equal(grade(100), "S");
  assert.equal(grade(95), "S");
  assert.equal(grade(94.9), "A");
  assert.equal(grade(90), "A");
  assert.equal(grade(89.9), "B");
  assert.equal(grade(80), "B");
  assert.equal(grade(79.9), "C");
  assert.equal(grade(70), "C");
  assert.equal(grade(69.9), "D");
  assert.equal(grade(55), "D");
  assert.equal(grade(54.9), "E");
  assert.equal(grade(35), "E");
  assert.equal(grade(34.9), "F");
  assert.equal(grade(0), "F");
});

test("redacts credential-shaped evidence excerpts", () => {
  const item = evidence({ path: "AGENTS.md", content: "token = highly-sensitive-value" }, /token/i);
  assert.equal(item.excerpt, "token=[REDACTED]");
  assert.equal(item.line, 1);
});

test("locates evidence for matchers that span several lines", () => {
  const content = ["# Rules", "", "## 开工流程", "1. 读取当前任务状态。"].join("\n");
  const item = evidence({ path: "AGENTS.md", content }, /(?:^|\n)#{0,6}\s*开工流程[\s\S]{0,40}读取/m);
  assert.equal(item.line, 3);
  assert.equal(item.excerpt, "## 开工流程");
});

test("produces byte-stable JSON for an unchanged workspace", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "# Rules\nOnly modify this repository.\n");

  const first = JSON.stringify(scanWorkspace(root, { profile: "team-shared-repo" }));
  const second = JSON.stringify(scanWorkspace(root, { profile: "team-shared-repo" }));

  assert.equal(first, second);
});

test("does not combine unrelated keywords into governance evidence", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", [
    "# Rules",
    "See the release workflow before 发布。",
    "敏感字段必须有业务注释。",
    "代码评审时删除无用私有方法。",
    "数据库对象名可以保留英文。",
    "其他修改需要确认。"
  ].join("\n"));

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(rule(report, "authorization.git-remote-release").status, "fail");
  assert.equal(rule(report, "authorization.data-side-effects").status, "partial");
  assert.equal(rule(report, "safety.secrets").status, "fail");
  assert.equal(rule(report, "safety.destructive-operations").status, "partial");
});

test("loads directly linked governance documents as evidence", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "# Rules\nRead [safety rules](docs/safety.md).\n");
  write(root, "docs/safety.md", [
    "# Safety",
    "未经用户许可，不得创建本地 commit。",
    "未经用户许可，不得 push、merge、tag 或执行发布。",
    "生产数据库迁移必须先确认环境并获得授权。",
    "禁止输出密码、Token、Cookie、连接串或其他敏感信息。",
    "删除或覆盖文件前必须确认范围并准备恢复方式。"
  ].join("\n"));

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.ok(report.inventory.governanceFiles.includes("docs/safety.md"));
  assert.equal(rule(report, "authorization.git-remote-release").status, "pass");
  assert.equal(rule(report, "authorization.data-side-effects").status, "pass");
  assert.equal(rule(report, "safety.secrets").status, "pass");
  assert.equal(rule(report, "safety.destructive-operations").status, "pass");
});

test("loads repository-relative markdown paths written as code references", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "# Rules\nRead `docs/safety.md` before changes.\n");
  write(root, "docs/safety.md", "禁止输出密码、Token、Cookie 或连接串。\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.ok(report.inventory.governanceFiles.includes("docs/safety.md"));
  assert.equal(rule(report, "safety.secrets").status, "pass");
});

test("loads bare and child-relative Markdown code references", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "开始任务前读取 `HANDOFF.md`，再读取目标仓库的局部规则。\n");
  write(root, "HANDOFF.md", "# 当前任务状态\n下一步：读取目标模块。\n");
  write(root, "backend/AGENTS.md", "修改前读取 `docs/backend-spec.md`。\n");
  write(root, "backend/docs/backend-spec.md", "# Backend spec\n禁止输出密码或 Token。\n");
  write(root, "docs/backend-spec.md", "# Unrelated root document\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.ok(report.inventory.governanceFiles.includes("HANDOFF.md"));
  assert.ok(report.inventory.governanceFiles.includes("backend/docs/backend-spec.md"));
  assert.equal(rule(report, "safety.secrets").status, "pass");
});

test("falls back to workspace-root Markdown code references from nested instructions", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "先读取目标仓库的局部规则。\n");
  write(root, "backend/AGENTS.md", "修改前读取 `docs/shared-policy.md`。\n");
  write(root, "docs/shared-policy.md", "禁止输出密码、Token 或 Cookie。\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.ok(report.inventory.governanceFiles.includes("docs/shared-policy.md"));
  assert.equal(rule(report, "safety.secrets").status, "pass");
});

test("ignores generated package manifests", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "# Rules\nOnly modify this repository.\n");
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  write(root, ".vite/deps/package.json", JSON.stringify({ name: "generated" }));

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(report.inventory.manifests, 1);
});

test("recognizes verification entrypoints across common non-JavaScript stacks", async (t) => {
  const cases = [
    {
      name: "python",
      command: "Run pytest for this repository before completion.",
      files: {
        "requirements.txt": "pytest==8.4.0\n",
        "tests/test_app.py": "def test_app():\n    assert True\n"
      }
    },
    {
      name: "go",
      command: "Run go test ./... for this repository before completion.",
      files: {
        "go.mod": "module example.test/app\n\ngo 1.22\n",
        "app_test.go": "package app\n"
      }
    },
    {
      name: "rust",
      command: "Run cargo test for this repository before completion.",
      files: {
        "Cargo.toml": "[package]\nname = \"app\"\nversion = \"0.1.0\"\nrust-version = \"1.80\"\n"
      }
    },
    {
      name: "dotnet",
      command: "Run dotnet test for this repository before completion.",
      files: {
        "App.sln": "Microsoft Visual Studio Solution File\n",
        "src/App.csproj": "<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>\n",
        "tests/App.Tests.csproj": "<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>\n"
      }
    },
    {
      name: "godot",
      command: "Run godot --headless --path . --editor --quit-after for this repository before completion.",
      files: {
        "project.godot": "[application]\nconfig/name=\"Example\"\n",
        "export_presets.cfg": "[preset.0]\nname=\"Windows\"\n",
        "tests/test_scene.gd": "extends Node\n"
      }
    }
  ];

  for (const item of cases) {
    await t.test(item.name, (caseContext) => {
      const root = workspace(caseContext);
      fs.mkdirSync(path.join(root, ".git"));
      write(root, "AGENTS.md", `# Rules\nOnly modify files in this repository. ${item.command}\n`);
      for (const [relative, content] of Object.entries(item.files)) write(root, relative, content);

      const report = scanWorkspace(root, { profile: "team-shared-repo" });

      assert.ok(report.inventory.manifests > 0);
      assert.equal(rule(report, "verification.commands").status, "pass");
      assert.equal(rule(report, "verification.module-coverage").status, "pass");
    });
  }
});

test("recognizes common npm static-check script families as module coverage", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "运行 npm run typecheck 验证。\n");
  write(root, "package.json", JSON.stringify({ scripts: { typecheck: "tsc --noEmit" } }));
  write(root, "frontend/package.json", JSON.stringify({ scripts: { "verify:types": "tsc --noEmit" } }));
  write(root, "mobile/package.json", JSON.stringify({ scripts: { "type-check": "vue-tsc --noEmit" } }));

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(rule(report, "verification.module-coverage").status, "pass");
});

test("does not treat business rollback rules as destructive-operation governance", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "Read `openspec/specs/PLATFORM-RULES/spec.md`.\n");
  write(root, "openspec/specs/PLATFORM-RULES/spec.md", "第三方下发失败不得回滚成功的本地登记，但必须可重试。\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(rule(report, "safety.destructive-operations").status, "partial");
});

test("applies configured profile and keeps waivers visible without marking them passed", (t) => {
  const root = workspace(t);
  write(root, ".ekko-benchmark.json", JSON.stringify({
    profile: "personal-local-multirepo",
    minScore: 50,
    waivers: [{ rule: "requirements.acceptance-contract", reason: "验收标准由外部需求系统统一维护" }]
  }));
  fs.mkdirSync(path.join(root, "one", ".git"), { recursive: true });
  fs.mkdirSync(path.join(root, "two", ".git"), { recursive: true });
  write(root, "AGENTS.md", "# Rules\nOnly modify this workspace.\n");

  const report = scanWorkspace(root);
  const waived = rule(report, "requirements.acceptance-contract");

  assert.equal(report.profile.selection.confidence, "configured");
  assert.equal(report.config.minScore, 50);
  assert.equal(waived.status, "waived");
  assert.equal(waived.data?.originalStatus, "fail");
  assert.match(waived.summary, /外部需求系统/);
});

test("rejects waivers for unknown rules", (t) => {
  const root = workspace(t);
  write(root, ".ekko-benchmark.json", JSON.stringify({
    waivers: [{ rule: "missing.rule", reason: "这是一个不存在的规则编号" }]
  }));
  write(root, "AGENTS.md", "# Rules\n");

  assert.throws(() => scanWorkspace(root), /unknown rule 'missing\.rule'/);
});

test("rejects unknown configuration fields", (t) => {
  const root = workspace(t);
  write(root, ".ekko-benchmark.json", JSON.stringify({ minScroe: 70 }));
  write(root, "AGENTS.md", "# Rules\n");

  assert.throws(() => scanWorkspace(root), /unknown field 'minScroe'/);
});

test("rejects duplicate waivers instead of silently overriding them", (t) => {
  const root = workspace(t);
  write(root, ".ekko-benchmark.json", JSON.stringify({
    waivers: [
      { rule: "requirements.acceptance-contract", reason: "由外部需求系统统一维护" },
      { rule: "requirements.acceptance-contract", reason: "重复配置不应该被接受" }
    ]
  }));
  write(root, "AGENTS.md", "# Rules\n");

  assert.throws(() => scanWorkspace(root), /duplicate waiver for 'requirements\.acceptance-contract'/);
});

test("distinguishes an existing team entrypoint from a Git-tracked one", (t) => {
  const root = workspace(t);
  assert.equal(spawnSync("git", ["init", "-q", "-b", "main", root], { windowsHide: true }).status, 0);
  write(root, "AGENTS.md", "# Rules\nOnly modify this repository.\n");

  const before = scanWorkspace(root, { profile: "team-shared-repo" });
  assert.equal(rule(before, "discoverability.entrypoint-versioned").status, "fail");

  assert.equal(spawnSync("git", ["-C", root, "add", "AGENTS.md"], { windowsHide: true }).status, 0);
  const after = scanWorkspace(root, { profile: "team-shared-repo" });
  assert.equal(rule(after, "discoverability.entrypoint-versioned").status, "pass");
});

test("keeps Git tracking checks unknown when the index cannot be read", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "# Rules\nNever expose passwords or tokens.\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(rule(report, "discoverability.entrypoint-versioned").status, "unknown");
  assert.equal(rule(report, "safety.tracked-local-files").status, "unknown");
  assert.ok(report.reviewItems.some((item) => item.id === "git-index-unavailable"));
});

test("does not expose the contents of tracked local secret candidates", (t) => {
  const root = workspace(t);
  assert.equal(spawnSync("git", ["init", "-q", "-b", "main", root], { windowsHide: true }).status, 0);
  write(root, "AGENTS.md", "# Rules\nNever expose passwords, tokens, cookies, or other sensitive credentials.\n");
  write(root, ".env", "API_TOKEN=do-not-leak-this-value\n");
  assert.equal(spawnSync("git", ["-C", root, "add", "AGENTS.md", ".env"], { windowsHide: true }).status, 0);

  const report = scanWorkspace(root, { profile: "team-shared-repo" });
  const result = rule(report, "safety.tracked-local-files");
  const serialized = JSON.stringify(result);

  assert.equal(result.status, "fail");
  assert.match(serialized, /\.env/);
  assert.doesNotMatch(serialized, /do-not-leak-this-value/);
});

test("fails placeholder-only entrypoints", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "# AGENTS.md\nTODO\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(rule(report, "discoverability.entrypoint-content").status, "fail");
  assert.ok(report.reviewItems.some((item) => item.id === "stale-markers"));
});

test("checks commands referenced by automation files", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "# Rules\nUse npm test for verification and never expose sensitive credentials.\n");
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" }, engines: { node: ">=20" } }));
  write(root, ".github/workflows/ci.yml", "jobs:\n  test:\n    steps:\n      - run: npm run missing-check\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });
  const result = rule(report, "automation.commands-resolve");

  assert.equal(result.status, "fail");
  assert.deepEqual(result.data?.missing, [{ file: ".github/workflows/ci.yml", target: "npm missing-check" }]);
});

test("does not parse npm cache metadata across YAML lines as a command", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "# Rules\nUse npm test for verification in this repository.\n");
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  write(root, ".github/workflows/ci.yml", [
    "steps:",
    "  - uses: actions/setup-node@v4",
    "    with:",
    "      cache: npm",
    "      cache-dependency-path: package-lock.json",
    "  - run: npm test"
  ].join("\n"));

  const result = rule(scanWorkspace(root, { profile: "team-shared-repo" }), "automation.commands-resolve");

  assert.equal(result.status, "pass");
});

test("accepts a documented PowerShell verification script and resolves Windows paths", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "# Rules\nOnly modify this repository. Run `pwsh -ExecutionPolicy Bypass -File .\\tools\\verify.ps1 -Mode all` before completion.\n");
  write(root, "project.godot", "[application]\nconfig/name=\"Example\"\n");
  write(root, "tools/verify.ps1", "Write-Output 'verified'\n");
  write(root, ".github/workflows/ci.yml", "steps:\n  - run: pwsh -File .\\tools\\verify.ps1\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(rule(report, "verification.commands").status, "pass");
  assert.equal(rule(report, "automation.commands-resolve").status, "pass");
});

test("accepts a documented aggregate npm validation script", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "# Rules\nOnly modify this repository. Run npm run validate before completion.\n");
  write(root, "package.json", JSON.stringify({ scripts: { validate: "npm run check && npm test", check: "tsc --noEmit", test: "node --test" } }));

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(rule(report, "accuracy.documented-commands").status, "pass");
  assert.equal(rule(report, "verification.commands").status, "pass");
});

test("treats package.json validity as not applicable when a project has no npm manifest", (t) => {
  const root = workspace(t);
  write(root, "AGENTS.md", "# Rules\nRun `pytest` before finishing.\n");
  write(root, "pyproject.toml", "[project]\nname = \"example\"\nrequires-python = \">=3.11\"\n");

  assert.equal(rule(scanWorkspace(root, { profile: "team-shared-repo" }), "accuracy.manifest-validity").status, "not_applicable");
});

test("does not read npm built-ins, flags or --if-present scripts as missing package scripts", (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, ".git"));
  write(root, "AGENTS.md", "# Rules\nVerify with `npm run --silent build` and `npm -w app run lint`.\n");
  write(root, "package.json", JSON.stringify({ scripts: { build: "tsc", lint: "eslint ." } }));
  write(root, ".github/workflows/ci.yml", [
    "steps:",
    "  - run: npm -v",
    "  - run: npm audit --audit-level=high",
    "  - run: npm run --if-present coverage",
    "  - run: gh release publish notes.sh",
    "  - run: npm run missing-check"
  ].join("\n"));

  const report = scanWorkspace(root, { profile: "team-shared-repo" });
  const automation = rule(report, "automation.commands-resolve");

  assert.equal(rule(report, "accuracy.documented-commands").status, "pass");
  assert.equal(rule(report, "accuracy.documented-commands").evidence[0]?.line, 2);
  assert.equal(automation.status, "fail");
  assert.deepEqual(automation.data?.missing, [{ file: ".github/workflows/ci.yml", target: "npm missing-check" }]);
});

test("only flags tracked registry configs that contain credentials", (t) => {
  const root = workspace(t);
  assert.equal(spawnSync("git", ["init", "-q", "-b", "main", root], { windowsHide: true }).status, 0);
  write(root, "AGENTS.md", "# Rules\n");
  write(root, ".npmrc", "engine-strict=true\n");
  assert.equal(spawnSync("git", ["-C", root, "add", "AGENTS.md", ".npmrc"], { windowsHide: true }).status, 0);
  assert.equal(rule(scanWorkspace(root, { profile: "team-shared-repo" }), "safety.tracked-local-files").status, "pass");

  write(root, ".npmrc", "//registry.npmjs.org/:_authToken=do-not-leak-this-value\n");
  const result = rule(scanWorkspace(root, { profile: "team-shared-repo" }), "safety.tracked-local-files");
  assert.equal(result.status, "fail");
  assert.doesNotMatch(JSON.stringify(result), /do-not-leak-this-value/);
});

test("ignores markdown link syntax shown inside code", (t) => {
  const root = workspace(t);
  write(root, "AGENTS.md", "# Rules\nLink format: `[Spec](docs/specs/<id>.md)`\n\n```md\n[Plan](docs/plans/<id>.md)\n```\n[Missing](docs/missing.md)\n");

  const result = rule(scanWorkspace(root, { profile: "team-shared-repo" }), "accuracy.local-links");

  assert.equal(result.status, "fail");
  assert.deepEqual(result.data?.broken, [{ file: "AGENTS.md", target: "docs/missing.md" }]);
});

test("accepts build files such as Makefile as the backing for documented verification", (t) => {
  const root = workspace(t);
  write(root, "AGENTS.md", "# Rules\nRun `make test` before finishing.\n");
  write(root, "src/main.c", "int main(void) { return 0; }\n");
  assert.equal(rule(scanWorkspace(root, { profile: "team-shared-repo" }), "verification.commands").status, "partial");

  write(root, "Makefile", "test:\n\t./run-tests\n");
  assert.equal(rule(scanWorkspace(root, { profile: "team-shared-repo" }), "verification.commands").status, "pass");
});

test("does not treat secret-handling or impact prose as delivery authorization or impact contracts", (t) => {
  for (const [agents, expected] of [
    ["# Rules\nNever commit secrets.\nDo not push without approval.\n", "partial"],
    ["# 规则\n禁止提交密钥。\n未经授权不得 push。\n", "partial"]
  ] as const) {
    const root = workspace(t);
    write(root, "AGENTS.md", agents);
    assert.equal(rule(scanWorkspace(root, { profile: "team-shared-repo" }), "authorization.git-remote-release").status, expected, agents);
  }
  for (const agents of [
    "# Notes\nThe design keeps tasks small.\nPerformance impact should stay low.\n",
    "# 说明\n设计上保持任务较小。\n性能影响应保持较低。\n"
  ]) {
    const root = workspace(t);
    write(root, "AGENTS.md", agents);
    assert.equal(rule(scanWorkspace(root, { profile: "team-shared-repo" }), "execution.plan-impact").status, "fail", agents);
  }
});

test("keeps passing results when a waiver is unnecessary and reports the unused waiver", (t) => {
  const root = workspace(t);
  write(root, "AGENTS.md", "# Rules\nOnly modify files in this repository.\n");
  const baseline = scanWorkspace(root, { profile: "team-shared-repo" });
  write(root, ".ekko-benchmark.json", JSON.stringify({
    waivers: [{ rule: "boundaries.documented", reason: "边界说明由外部仓库统一维护" }]
  }));

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(rule(report, "boundaries.documented").status, "pass");
  assert.equal(report.staticReadiness.score, baseline.staticReadiness.score);
  assert.ok(report.reviewItems.some((item) => item.id === "unused-waivers" && item.summary.includes("boundaries.documented")));
});

test("scores a docs-first project before development without penalizing missing code", (t) => {
  const root = workspace(t);
  write(root, "AGENTS.md", "# Rules\nRun `npm test` and `npm run lint` before finishing.\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(rule(report, "verification.commands").status, "pass");
  assert.equal(rule(report, "accuracy.documented-commands").status, "not_applicable");
  assert.equal(rule(report, "verification.module-coverage").status, "not_applicable");
  assert.ok(report.reviewItems.some((item) => item.id === "development-not-started"));
  assert.ok(report.unchecked.some((item) => item.includes("尚未建立的工程清单")));
});

test("still requires verification commands before development starts", (t) => {
  const root = workspace(t);
  write(root, "AGENTS.md", "# Rules\nOnly modify files in this repository.\n");

  assert.equal(rule(scanWorkspace(root, { profile: "team-shared-repo" }), "verification.commands").status, "fail");
});

test("checks documented npm scripts once any source code exists", (t) => {
  const root = workspace(t);
  write(root, "AGENTS.md", "# Rules\nRun `npm run lint` before finishing.\n");
  write(root, "src/index.ts", "export {};\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });

  assert.equal(rule(report, "accuracy.documented-commands").status, "fail");
  assert.ok(!report.reviewItems.some((item) => item.id === "development-not-started"));
});

test("requires module guidance to say which rules or responsibilities apply where", (t) => {
  const cases: Array<[string, string]> = [
    ["# Rules\nSet the PATH variable before running tools.\n", "partial"],
    ["# Rules\nKeep functions small.\n", "fail"],
    ["# Rules\nRules in this file apply to every package; the nearest AGENTS.md takes precedence.\n", "pass"],
    ["# 规则\n进入子目录前读取就近的 AGENTS.md，子仓库规则优先于本文件。\n", "pass"],
    ["# Layout\n- `src/` — application code\n- `test/` — node:test suites\n", "pass"],
    ["# 结构\n- 后端：`server/`\n- 前端：`web/`\n", "pass"],
    ["# Layout\n- `src/` — application code\n", "partial"]
  ];
  for (const [agents, expected] of cases) {
    const root = workspace(t);
    write(root, "AGENTS.md", agents);
    assert.equal(rule(scanWorkspace(root, { profile: "team-shared-repo" }), "scoping.module-guidance").status, expected, agents);
  }
});

test("ranks improvements by objective defects, then core gaps, with per-rule score gains", (t) => {
  const root = workspace(t);
  write(root, "AGENTS.md", "# Rules\nSee [Status](docs/missing.md).\nRun `npm test` before finishing.\n");
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  write(root, "src/index.js", "export {};\n");

  const report = scanWorkspace(root, { profile: "team-shared-repo" });
  const { items, potentialScore } = report.improvements;
  const open = report.results.filter((result) => result.status === "partial" || result.status === "fail");
  const kindOrder = { defect: 0, "core-gap": 1, gap: 2 } as const;

  assert.equal(items.length, open.length);
  assert.equal(items[0].id, "accuracy.local-links");
  assert.equal(items[0].kind, "defect");
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    assert.ok(kindOrder[previous.kind] < kindOrder[current.kind]
      || (previous.kind === current.kind && previous.gain >= current.gain), `${previous.id} before ${current.id}`);
  }
  const target = items.find((item) => item.kind === "core-gap");
  assert.ok(target);
  const fixed = report.results.map((result) => result.id === target.id ? { ...result, status: "pass" as const } : result);
  const expected = Math.round((calculateStaticScore(fixed, report.profile).score - report.staticReadiness.score) * 10) / 10;
  assert.equal(target.gain, expected);
  assert.ok(target.gain > 0);
  assert.equal(potentialScore, 100);
});

test("reports no improvements once every applicable rule passes", () => {
  const results = [
    { id: "verification.commands", title: "x", dimension: "verification", status: "pass", weight: 3 },
    { id: "accuracy.runtime-version", title: "y", dimension: "execution", status: "not_applicable", weight: 1 }
  ] as const;
  const plan = rankImprovements([...results], { dimensions: { verification: 18, execution: 10 } });
  assert.deepEqual(plan, { potentialScore: 100, items: [] });
});
