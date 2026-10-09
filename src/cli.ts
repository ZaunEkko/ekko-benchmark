import fs from "node:fs";
import path from "node:path";
import { PROFILES } from "./static/profiles.js";
import { listRuleMetadata } from "./static/rules.js";
import { scanWorkspace } from "./static/scan.js";
import { renderAgentGuide, renderReport, renderTerminal } from "./report/render.js";
import { scoreWorkflowExperiment } from "./workflow/score.js";
import { renderWorkflow } from "./workflow/render.js";
import { VERSION } from "./meta.js";
import { InputError } from "./errors.js";

const HELP = `Ekko Benchmark ${VERSION}

用法:
  npx @zaunekko/benchmark [目录] [选项]
  npx @zaunekko/benchmark scan [目录] [选项]
  npx @zaunekko/benchmark agent [目录] [选项]
  npx @zaunekko/benchmark workflow score <experiment.json> [选项]
  npx @zaunekko/benchmark rules [--format terminal|json]
  npx @zaunekko/benchmark profiles [--format terminal|json]

默认行为:
  不传命令时只读扫描当前软件项目，输出 Coding Agent 协作准备度报告。
  agent 默认复核当前目录，为已在场的 Coding Agent 生成语义重评分协议，不调用外部 AI。
  workflow score 是可选的既有软件任务试验记录分析，不是默认扫描前置条件。

扫描选项:
  --profile <id>       覆盖自动识别的协作画像
  --format <format>    terminal（默认）、markdown 或 json
  --output <file>      将报告写入文件
  --min-score <0-100>  低于门禁时退出码为 1

通用选项:
  -h, --help           显示帮助
  -v, --version        显示版本
`;

class UsageError extends InputError {}

interface CliOptions {
  format: string;
  output: string | null;
  profile: string | null;
  minScore: number | null;
  positionals: string[];
  help: boolean;
  version: boolean;
}

function takeValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new UsageError(`${option} requires a value.`);
  return value;
}

function parseOptions(
  args: string[],
  { allowProfile = false, allowMinScore = false }: { allowProfile?: boolean; allowMinScore?: boolean } = {}
): CliOptions {
  const options: CliOptions = { format: "terminal", output: null, profile: null, minScore: null, positionals: [], help: false, version: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    // Bare separators survive npm forwarding differently in bash and PowerShell (npm.ps1 consumes one).
    if (arg === "--") continue;
    if (arg === "--format") {
      options.format = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--output" || arg === "-o") {
      options.output = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--profile" && allowProfile) {
      options.profile = takeValue(args, index, arg);
      index += 1;
    } else if (arg === "--min-score" && allowMinScore) {
      const raw = takeValue(args, index, arg);
      options.minScore = Number(raw);
      if (!Number.isFinite(options.minScore) || options.minScore < 0 || options.minScore > 100) {
        throw new UsageError("--min-score must be between 0 and 100.");
      }
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg.startsWith("-")) {
      throw new UsageError(`Unknown option '${arg}'.`);
    } else {
      options.positionals.push(arg);
    }
  }
  return options;
}

/** Handles --help and --version after option values are consumed, so `--output -v` stays a path. */
function printedMeta(options: CliOptions): boolean {
  if (options.version) process.stdout.write(`${VERSION}\n`);
  else if (options.help) process.stdout.write(HELP);
  return options.version || options.help;
}

function emit(content: string, output: string | null): void {
  if (!output) {
    process.stdout.write(content);
    return;
  }
  const target = path.resolve(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  process.stdout.write(`Report written to ${target}\n`);
}

function runScan(args: string[]): number {
  const options = parseOptions(args, { allowProfile: true, allowMinScore: true });
  if (printedMeta(options)) return 0;
  if (options.positionals.length > 1) throw new UsageError("Scan accepts at most one workspace path.");
  const workspace = options.positionals[0] ?? ".";
  const report = scanWorkspace(workspace, options.profile ? { profile: options.profile } : {});
  emit(renderReport(report, options.format), options.output);
  const minScore = options.minScore ?? report.config.minScore;
  return minScore !== null && report.staticReadiness.score < minScore ? 1 : 0;
}

function runAgent(args: string[]): number {
  const options = parseOptions(args, { allowProfile: true });
  if (printedMeta(options)) return 0;
  if (options.positionals.length > 1) throw new UsageError("Agent accepts at most one workspace path.");
  if (options.format !== "terminal") throw new UsageError("Agent mode currently supports terminal format only.");
  const workspace = options.positionals[0] ?? ".";
  const report = scanWorkspace(workspace, options.profile ? { profile: options.profile } : {});
  emit(`${renderTerminal(report, { showAgentHint: false }).trimEnd()}\n${renderAgentGuide(report)}`, options.output);
  return 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runWorkflow(args: string[]): number {
  const subcommand = args[0];
  if (subcommand !== "score") throw new UsageError("Workflow command currently supports: workflow score <experiment.json>.");
  const options = parseOptions(args.slice(1));
  if (printedMeta(options)) return 0;
  if (options.positionals.length !== 1) throw new UsageError("workflow score requires exactly one experiment JSON file.");
  const inputPath = path.resolve(options.positionals[0]);
  let input: unknown;
  try {
    input = JSON.parse(fs.readFileSync(inputPath, "utf8")) as unknown;
  } catch (error) {
    throw new UsageError(`Cannot read experiment JSON '${inputPath}': ${errorMessage(error)}`);
  }
  const report = scoreWorkflowExperiment(input);
  emit(renderWorkflow(report, options.format), options.output);
  return 0;
}

function renderCatalog(items: Array<Record<string, unknown>>, format: string, fields: string[]): string {
  if (format === "json") return `${JSON.stringify(items, null, 2)}\n`;
  if (format !== "terminal") throw new UsageError("Catalog format must be terminal or json.");
  return `${items.map((item) => fields.map((field) => String(item[field] ?? "")).join(" | ")).join("\n")}\n`;
}

function runCatalog(command: "rules" | "profiles", args: string[]): number {
  const options = parseOptions(args);
  if (printedMeta(options)) return 0;
  if (options.positionals.length > 0 || options.output) throw new UsageError(`${command} does not accept paths or --output.`);
  if (command === "rules") {
    process.stdout.write(renderCatalog(listRuleMetadata() as Array<Record<string, unknown>>, options.format, ["id", "dimension", "severity", "core", "title"]));
  } else {
    const items = Object.values(PROFILES).map(({ id, label, description }) => ({ id, label, description }));
    process.stdout.write(renderCatalog(items, options.format, ["id", "label", "description"]));
  }
  return 0;
}

function isInputError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  return error instanceof InputError || ["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(code);
}

export async function main(args: string[]): Promise<void> {
  try {
    if (args.length === 1 && ["--version", "-v"].includes(args[0])) {
      process.stdout.write(`${VERSION}\n`);
      return;
    }
    if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
      process.stdout.write(HELP);
      return;
    }

    const command = args[0];
    let exitCode;
    if (command === "scan") exitCode = runScan(args.slice(1));
    else if (command === "agent") exitCode = runAgent(args.slice(1));
    else if (command === "workflow") exitCode = runWorkflow(args.slice(1));
    else if (command === "rules" || command === "profiles") exitCode = runCatalog(command, args.slice(1));
    else exitCode = runScan(args);
    process.exitCode = exitCode;
  } catch (error) {
    if (isInputError(error)) {
      process.stderr.write(`Input error: ${errorMessage(error)}\nRun with --help for usage.\n`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }
}
