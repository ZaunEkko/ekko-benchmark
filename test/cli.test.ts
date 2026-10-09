import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(directory, "..", "src", "bin.js");

test("no-argument CLI scans the current directory", (t: TestContext) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ekko-benchmark-cli-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".git"));
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Rules\nOnly modify this repository.\n", "utf8");

  const result = spawnSync(process.execPath, [cli], { cwd: root, encoding: "utf8", windowsHide: true });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /EKKO BENCHMARK · 软件工程 AI 协作体检/);
  assert.match(result.stdout, /team-shared-repo/);
  assert.match(result.stdout, /协作分:/);
  assert.match(result.stdout, /Ekko 直评/);
  assert.match(result.stdout, /维度总览/);
  assert.match(result.stdout, /需要处理/);
});

test("minimum score threshold uses exit code 1 without hiding the report", (t: TestContext) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ekko-benchmark-gate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [cli, root, "--min-score", "100"], { encoding: "utf8", windowsHide: true });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /协作分:/);
});

test("agent command defaults to the current directory and emits a full semantic scoring protocol", (t: TestContext) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ekko-benchmark-agent-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".git"));
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Rules\nOnly modify this repository.\n", "utf8");

  const result = spawnSync(process.execPath, [cli, "agent"], { cwd: root, encoding: "utf8", windowsHide: true });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /协作分:/);
  assert.match(result.stdout, /AGENT ENHANCED SCORE · 语义增强重评分协议/);
  assert.match(result.stdout, /全量规则队列/);
  assert.match(result.stdout, /静态协议分: .*不得改写/);
  assert.doesNotMatch(result.stdout, /npx @zaunekko\/benchmark agent \./);
});

test("configuration validation failures use input-error exit code 2", (t: TestContext) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ekko-benchmark-config-error-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Rules\n", "utf8");
  fs.writeFileSync(path.join(root, ".ekko-benchmark.json"), JSON.stringify({
    waivers: [
      { rule: "requirements.acceptance-contract", reason: "重复配置用于错误测试一" },
      { rule: "requirements.acceptance-contract", reason: "重复配置用于错误测试二" }
    ]
  }), "utf8");

  const result = spawnSync(process.execPath, [cli, root], { encoding: "utf8", windowsHide: true });

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /^Input error:/);
  assert.doesNotMatch(result.stderr, /Internal error:/);
});

test("workflow pairing failures use input-error exit code 2", (t: TestContext) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ekko-benchmark-workflow-error-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const examplePath = path.join(directory, "..", "..", "examples", "workflow-experiment.example.json");
  const input = JSON.parse(fs.readFileSync(examplePath, "utf8"));
  input.runs[3].taskId = "different-task";
  const inputPath = path.join(root, "experiment.json");
  fs.writeFileSync(inputPath, JSON.stringify(input), "utf8");

  const result = spawnSync(process.execPath, [cli, "workflow", "score", inputPath], { encoding: "utf8", windowsHide: true });

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /^Input error:/);
  assert.doesNotMatch(result.stderr, /Internal error:/);
});

test("bare option separators forwarded by npm are ignored", (t: TestContext) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ekko-benchmark-separator-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [cli, "scan", root, "--", "--profile", "personal-local-multirepo", "--format", "json"], {
    encoding: "utf8",
    windowsHide: true
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).profile.id, "personal-local-multirepo");
});

test("version flags are only recognized as options, not as option values", (t: TestContext) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ekko-benchmark-version-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const asOption = spawnSync(process.execPath, [cli, "scan", root, "-v"], { encoding: "utf8", windowsHide: true });
  assert.equal(asOption.status, 0, asOption.stderr);
  assert.match(asOption.stdout, /^\d+\.\d+\.\d+\n$/);

  const asValue = spawnSync(process.execPath, [cli, "scan", root, "--format", "json", "--output", "-v"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  assert.equal(asValue.status, 0, asValue.stderr);
  assert.match(asValue.stdout, /Report written to/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "-v"), "utf8")).kind, "static-readiness");
});

test("unsupported report formats use input-error exit code 2", (t: TestContext) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ekko-benchmark-format-error-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [cli, root, "--format", "xml"], { encoding: "utf8", windowsHide: true });

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /Unknown format 'xml'/);
});

test("terminal report and agent protocol surface prioritized improvements", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ekko-benchmark-improve-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Rules\nSee [Status](docs/missing.md).\n", "utf8");

  const terminal = spawnSync(process.execPath, [cli, root], { encoding: "utf8", windowsHide: true });
  assert.equal(terminal.status, 0, terminal.stderr);
  assert.match(terminal.stdout, /最值得先改/);
  assert.match(terminal.stdout, /\+\d+\.\d\s+客观错误\s+本地规范链接可以解析/);

  const agent = spawnSync(process.execPath, [cli, "agent", root], { encoding: "utf8", windowsHide: true });
  assert.equal(agent.status, 0, agent.stderr);
  assert.match(agent.stdout, /改进阶段/);
  assert.match(agent.stdout, /扫描器漏判不提出改写文档的建议/);
  assert.match(agent.stdout, /补齐可涨 \+\d+\.\d（客观错误）/);
  assert.match(agent.stdout, /只有用户明确同意后才修改文件/);
});
