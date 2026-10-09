import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { scanWorkspace } from "../src/static/scan.js";

// The same software delivery protocol, sentence by sentence, in Chinese and English.
const PROTOCOLS = {
  zh: {
    agents: [
      "# AGENTS.md",
      "",
      "## 开始任务前",
      "按以下顺序读取：",
      "1. 当前任务状态：`docs/STATUS.md`（进度、阻塞、下一步）。",
      "2. 长期约束：`docs/ARCHITECTURE.md`；已确认的决策见 `docs/adr/`。",
      "3. 需求与实施计划：接到新需求时在 `docs/specs/` 创建需求记录，需求记录必须包含目标、范围、当前行为和验收标准；实施计划写在同一需求文件中。",
      "4. 验证信息：需求记录中的验收标准与测试结果。",
      "新会话开始时先读取 `docs/STATUS.md` 恢复当前任务。",
      "",
      "## 文档职责",
      "每类文档只记录一种事实：AGENTS.md 记录长期规则，需求记录记录需求与实施计划，`docs/adr/` 记录决策，`docs/STATUS.md` 记录当前任务状态。",
      "",
      "## 澄清",
      "需求存在歧义或与现有行为冲突时，先询问用户确认再写代码；确认前保持待确认状态，不得猜测。",
      "",
      "## 决策",
      "用户确认的取舍记录为 `docs/adr/` 中的 ADR。决策变化时新建 ADR 替代旧记录，不改写历史。",
      "",
      "## 实施",
      "修改代码前，在需求的实施计划中列出受影响的模块、文件和测试。",
      "",
      "## 验证",
      "完成前执行 `npm test` 与 `npm run lint`。在需求记录中记录验证结果与未检查范围。",
      "",
      "## 同步",
      "实现或范围发生变化时，同步更新需求记录和 `docs/STATUS.md`。",
      "",
      "## 边界",
      "只修改本仓库文件，不得写入生成目录 `dist/`。",
      "未经用户同意不得 commit。",
      "未经明确授权不得 push、发布或打 tag。",
      "未经授权不得对生产数据库执行迁移。",
      "禁止提交密钥、token 或 `.env` 文件，改用环境变量。",
      "删除文件或执行 `git reset --hard` 等破坏性命令前先询问用户确认。"
    ],
    status: [
      "# 状态",
      "",
      "## 当前工作",
      "",
      "- 当前任务：增加 CSV 导出",
      "- 阻塞：待确认接口方案",
      "- 验证结果：2026-10-01 测试通过",
      "- 下一步：实现导出模块"
    ]
  },
  en: {
    agents: [
      "# AGENTS.md",
      "",
      "## Before starting a task",
      "Read in this order:",
      "1. Current task status: `docs/STATUS.md` (progress, blockers, next step).",
      "2. Long-lived constraints: `docs/ARCHITECTURE.md`; accepted decisions in `docs/adr/`.",
      "3. Requirement and implementation plan: each new feature request creates a spec in `docs/specs/` that must include goals, scope, current behavior and acceptance criteria; the implementation plan lives in the same spec file.",
      "4. Verification: acceptance criteria and test results in the spec.",
      "A new session first reads `docs/STATUS.md` to resume the current task.",
      "",
      "## Document responsibilities",
      "Each document only records one kind of fact: AGENTS.md holds long-lived rules, specs hold requirements and plans, `docs/adr/` holds decisions, and `docs/STATUS.md` holds the current task status.",
      "",
      "## Clarification",
      "If a requirement is ambiguous or conflicts with existing behavior, ask the user to confirm before writing code; keep it marked pending until confirmed. Never guess.",
      "",
      "## Decisions",
      "Once the user approves a trade-off, record it as an ADR in `docs/adr/`. When a decision changes, add a new ADR that supersedes the old one; never rewrite history.",
      "",
      "## Implementation",
      "Before changing code, list the affected modules, files and tests in the spec's implementation plan.",
      "",
      "## Verification",
      "Run `npm test` and `npm run lint` before finishing. Record the test results and anything left unverified in the spec.",
      "",
      "## Sync",
      "When implementation or scope changes, update the spec and `docs/STATUS.md`.",
      "",
      "## Boundaries",
      "Only modify files in this repository; never write to the generated `dist/` folder.",
      "Do not commit without the user's approval.",
      "Do not push, publish or tag without explicit approval.",
      "Never run database migrations against production without approval.",
      "Never commit secrets, tokens or `.env` files; use environment variables.",
      "Ask before deleting files or running destructive commands like `git reset --hard`."
    ],
    status: [
      "# Status",
      "",
      "## Current work",
      "",
      "- Current task: add CSV export",
      "- Blockers: pending API decision",
      "- Verification: tests passed on 2026-10-01",
      "- Next step: implement the exporter"
    ]
  }
} as const;

function workspace(t: TestContext, files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ekko-benchmark-language-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  }
  return root;
}

function scanProtocol(t: TestContext, language: keyof typeof PROTOCOLS) {
  const protocol = PROTOCOLS[language];
  const root = workspace(t, {
    "AGENTS.md": `${protocol.agents.join("\n")}\n`,
    "docs/STATUS.md": `${protocol.status.join("\n")}\n`,
    "package.json": JSON.stringify({ name: "fixture", engines: { node: ">=22" }, scripts: { test: "node --test", lint: "eslint ." } })
  });
  return scanWorkspace(root, { profile: "team-shared-repo" });
}

test("equivalent Chinese and English protocols receive identical rule results", (t) => {
  const zh = scanProtocol(t, "zh");
  const en = scanProtocol(t, "en");

  for (const result of zh.results) {
    const counterpart = en.results.find((candidate) => candidate.id === result.id);
    assert.ok(counterpart, result.id);
    assert.equal(counterpart.status, result.status, `${result.id}: zh=${result.status} en=${counterpart.status}`);
  }
  assert.equal(en.staticReadiness.score, zh.staticReadiness.score);
  assert.equal(zh.staticReadiness.core.status, "clear", JSON.stringify(zh.staticReadiness.core.nonPassingRules));
  assert.equal(en.staticReadiness.core.status, "clear", JSON.stringify(en.staticReadiness.core.nonPassingRules));
});

test("generic English project notes do not satisfy delivery protocol rules", (t) => {
  const root = workspace(t, {
    "AGENTS.md": [
      "# AGENTS.md",
      "",
      "This repository contains a web application written in TypeScript.",
      "The code is organized into features and shared utilities.",
      "We like clean code, small functions and readable names."
    ].join("\n"),
    "package.json": JSON.stringify({ name: "fixture", scripts: { test: "node --test" } })
  });

  const report = scanWorkspace(root, { profile: "team-shared-repo" });
  for (const id of [
    "intake.clarification-policy",
    "context.capability-navigation",
    "requirements.artifact-contract",
    "requirements.acceptance-contract",
    "decisions.human-confirmed-persistence",
    "verification.acceptance-loop",
    "synchronization.resume-context",
    "synchronization.completion-sync",
    "safety.secrets"
  ]) {
    const result = report.results.find((candidate) => candidate.id === id);
    assert.ok(result, id);
    assert.equal(result.status, "fail", id);
  }
  assert.ok(report.staticReadiness.score < 55, `score ${report.staticReadiness.score}`);
});
