import path from "node:path";
import { evidenceAt } from "../../core/evidence.js";
import { resolveLocalLink } from "../../core/inventory.js";
import type { Evidence, FileRecord, Inventory, LinkResolution, TextFileRecord } from "../../types.js";

/**
 * Joins language-specific alternatives into one matcher. Rules keep Chinese and English
 * vocabulary side by side so equivalent protocols score the same in either language.
 */
export function anyOf(flags: string, ...patterns: RegExp[]): RegExp {
  return new RegExp(patterns.map((pattern) => `(?:${pattern.source})`).join("|"), flags);
}

export const VERIFICATION_COMMAND = /(?:(?:npm|pnpm|yarn|bun)[ \t]+(?:run[ \t]+)?(?:test|lint|build|check|validate|verify|typecheck)|make[ \t]+(?:test|check|lint|verify)\b|mvn\w*[ \t]+|gradle\w*[ \t]+|dotnet[ \t]+(?:test|build)|(?:(?:python[ \t]+-m|uv[ \t]+run)[ \t]+)?pytest|python[ \t]+-m[ \t]+unittest|go[ \t]+test|cargo[ \t]+(?:test|check)|godot(?:\d|\d+\.\d+)?[ \t]+[^\r\n]*(?:--headless|--editor|--path)|node[ \t]+--test|(?:pwsh|powershell)[^\r\n]{0,160}-File[ \t]+[.\w/\\:-]*(?:verify|test|check|validate)[\w.-]*\.ps1|(?:bash|sh)[ \t]+[.\w/\\:-]*(?:verify|test|check|validate)[\w.-]*\.sh)/i;

export function instructionText(inventory: Inventory): string {
  return inventory.instructionFiles.map((file) => file.content ?? "").join("\n");
}

export function governanceText(inventory: Inventory): string {
  return inventory.governanceFiles.map((file) => file.content ?? "").join("\n");
}

export function firstMatchingInstruction(inventory: Inventory, regex: RegExp): TextFileRecord | undefined {
  return inventory.instructionFiles.find((file) => regex.test(file.content ?? ""));
}

export function firstMatchingGovernance(inventory: Inventory, regex: RegExp): TextFileRecord | undefined {
  return inventory.governanceFiles.find((file) => regex.test(file.content ?? ""));
}

export function firstMatchingPolicy(inventory: Inventory, regex: RegExp): TextFileRecord | undefined {
  return inventory.policyFiles.find((file) => regex.test(file.content ?? ""));
}

export function findControlledLine(
  inventory: Inventory,
  subject: RegExp,
  control: RegExp,
  files = inventory.policyFiles
): { file: TextFileRecord; evidence: Evidence } | null {
  for (const file of files) {
    const lines = (file.content ?? "").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (subject.test(line) && control.test(line)) {
        return { file, evidence: evidenceAt(file, index + 1, line) };
      }
    }
  }
  return null;
}

export function operationalPolicyFiles(inventory: Inventory): TextFileRecord[] {
  const pattern = anyOf(
    "i",
    /(?:AI|Agent|协作者|操作者|用户).{0,40}(?:删除|清理|覆盖|回滚|不可逆)|(?:删除|清理|覆盖).{0,32}(?:文件|目录|分支|数据|记录|资源|容器|仓库|缓存|temp)|reset --hard|不可逆操作/,
    /\b(?:delet|remov|clean|overwrit|wip|drop|purg)\w*.{0,32}\b(?:files?|director(?:y|ies)|folders?|branch(?:es)?|data|records?|resources?|containers?|repo(?:sitor(?:y|ies))?|cache|temp|database|tables?)\b|\b(?:destructive|irreversible)\b|force[- ]push|rm -rf/
  );
  return inventory.policyFiles.filter((file) => pattern.test(file.content ?? ""));
}

export function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.toLowerCase().includes(term.toLowerCase()));
}

export function rootInstructionFiles(inventory: Inventory): TextFileRecord[] {
  const roots = new Set(inventory.rootEntrypoints.map((file) => file.path.toLowerCase()));
  return inventory.instructionFiles.filter((file) => roots.has(file.path.toLowerCase()));
}

export function firstMatchingRootInstruction(inventory: Inventory, regex: RegExp): TextFileRecord | undefined {
  return rootInstructionFiles(inventory).find((file) => regex.test(file.content ?? ""));
}

export type CollaborationRole = "guidance" | "requirement" | "plan" | "decision" | "status" | "verification";

export const COLLABORATION_ROLE_PATTERNS: Readonly<Record<CollaborationRole, RegExp>> = {
  guidance: anyOf(
    "i",
    /(?:长期|跨需求|全局).{0,24}(?:规则|规范|约束)|(?:规则|规范|约束).{0,24}(?:长期|跨需求|全局)|(?:仓库内|局部|适用|对应).{0,24}(?:规则|规范|约束)/,
    /guardrails?|polic(?:y|ies)|long-lived|durable|\b(?:project|coding|engineering|repository|local|global|architecture)[ -](?:rules|conventions|standards|constraints|guidelines)\b|\bconstraints\b/
  ),
  requirement: anyOf(
    "i",
    /需求|目标|范围|当前.{0,8}(?:实现|行为)/,
    /proposal|brief|prd|specification|\brequirements?\b|\bgoals?\b|\bscope\b|current behaviou?r|feature requests?|user stor(?:y|ies)/
  ),
  plan: anyOf(
    "i",
    /(?:实施|实现|执行|技术).{0,16}(?:设计|方案|计划|步骤|任务)|(?:设计|方案|计划|步骤|任务).{0,16}(?:实施|实现|执行)/,
    /design|approach|tasks?|implementation plan|\bplan\b/
  ),
  decision: /(?:决策|取舍|已确认.{0,12}(?:约束|选择)|decision|ADR|accepted)/i,
  status: anyOf(
    "i",
    /当前.{0,12}(?:任务|状态|进度)|进度|阻塞|下一步/,
    /current (?:work|task|status|state)|work ledger|openspec\/changes|handoff|status|progress|blockers?|next steps?/
  ),
  verification: anyOf("i", /验收|验证|测试|未检查/, /acceptance|verification|definition of done|\btests?\b|\btesting\b/)
};

const STATE_TOPIC = String.raw`(?:当前任务|任务状态|当前状态|进行中(?:任务|变更)|current (?:task|work|change|status|state)|task status|work ledger)`;
const MARKDOWN_PATH = String.raw`(?:\[[^\]]+\]\([^)]+\)|\x60[^\x60\r\n]+\.md\x60)`;
export const CURRENT_STATE_SOURCE_PATTERN = new RegExp([
  String.raw`${STATE_TOPIC}.{0,48}(?:唯一|统一|事实源|入口|来源|记录|为准|source of truth|canonical|single source|(?:tracked|recorded|kept|maintained) in|lives? in)`,
  String.raw`(?:唯一|统一|事实源|入口|为准|source of truth|canonical|single source).{0,48}${STATE_TOPIC}`,
  String.raw`${STATE_TOPIC}[^\r\n]{0,8}?[:：]?\s*${MARKDOWN_PATH}`,
  String.raw`${MARKDOWN_PATH}.{0,20}(?:当前状态|当前任务|任务状态|进度|阻塞|current (?:task|work|status|state)|progress|blockers?)`,
  String.raw`^(?:#{1,3}\s*)?(?:当前任务状态|当前工作|current (?:task|work|status)|work ledger)\s*$`
].join("|"), "im");
export const CURRENT_STATE_PATH_PATTERN = /(?:^|\/)(?:handoff|current(?:[-_](?:work|task|status))?|status|now|work[-_]ledger)\.md$/i;
export const HEADING_NUMBER_PREFIX = String.raw`(?:\d+(?:\.\d+)*[.)、]?\s*)?`;
export const CURRENT_STATE_HEADING_PATTERN = new RegExp(
  String.raw`^#{1,3}\s*${HEADING_NUMBER_PREFIX}(?:当前任务(?:状态|交接)?|当前工作|任务状态|工作账本|current (?:task|work|status|state)|work ledger|handoff)\s*$`,
  "im"
);
export const CURRENT_WORK_INDEX_HEADING_PATTERN = new RegExp(
  String.raw`^#{1,3}\s*${HEADING_NUMBER_PREFIX}(?:当前(?:进行中|未完结|活跃)(?:任务|变更|工作)|(?:进行中|未完结|活跃)(?:任务|变更|工作)|(?:active|current|in-progress) (?:tasks?|changes?|work))\s*$`,
  "im"
);

export function currentStateFiles(inventory: Inventory): TextFileRecord[] {
  return inventory.governanceFiles.filter((file) => {
    const content = file.content ?? "";
    return CURRENT_STATE_PATH_PATTERN.test(file.path)
      || CURRENT_STATE_HEADING_PATTERN.test(content)
      || (CURRENT_STATE_SOURCE_PATTERN.test(content) && CURRENT_WORK_INDEX_HEADING_PATTERN.test(content));
  });
}

export function explicitIdleStateEvidence(file: TextFileRecord): Evidence | null {
  const lines = (file.content ?? "").split(/\r?\n/);
  const directPattern = /^\s*(?:[-*>]\s*)?(?:(?:当前|目前)(?:暂无|没有|无)(?:任何)?(?:进行中|未完成|未完结|活跃|活动)?(?:任务|变更|工作)|(?:暂无|没有|无)(?:任何)?(?:当前|进行中|未完成|未完结|活跃|活动)(?:任务|变更|工作)|no (?:active|current|in-progress|unfinished) (?:tasks?|changes?|work)|(?:nothing|no (?:tasks?|work|changes?)) (?:is )?(?:currently )?in progress)[。.!！]?\s*$/i;
  const directIndex = lines.findIndex((line) => directPattern.test(line));
  if (directIndex >= 0) return evidenceAt(file, directIndex + 1, lines[directIndex]);
  const tableIdleIndex = lines.findIndex((line) => /^\s*\|.*\|\s*$/.test(line)
    && line.split("|").some((cell) => directPattern.test(cell.trim())));
  if (tableIdleIndex >= 0) return evidenceAt(file, tableIdleIndex + 1, lines[tableIdleIndex]);

  const headingIndex = lines.findIndex((line) => CURRENT_WORK_INDEX_HEADING_PATTERN.test(line));
  if (headingIndex < 0) return null;
  const nextHeading = lines.findIndex((line, index) => index > headingIndex && /^#{1,3}\s+/.test(line));
  const section = lines.slice(headingIndex + 1, nextHeading >= 0 ? nextHeading : undefined);
  const tableRows = section.filter((line) => /^\s*\|.*\|\s*$/.test(line));
  const separatorIndex = tableRows.findIndex((line) => /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line));
  const dataRows = separatorIndex >= 0 ? tableRows.slice(separatorIndex + 1) : [];
  if (separatorIndex !== 1 || dataRows.length > 0) return null;
  return evidenceAt(file, headingIndex + 1, lines[headingIndex]);
}

export function collaborationRoles(text: string): CollaborationRole[] {
  return (Object.entries(COLLABORATION_ROLE_PATTERNS) as Array<[CollaborationRole, RegExp]>)
    .filter(([, pattern]) => pattern.test(text))
    .map(([role]) => role);
}

export interface GovernanceLink {
  file: TextFileRecord;
  target: string;
  resolution: LinkResolution;
}

/** Blanks fenced blocks and inline code so syntax examples are not read as live links. */
export function maskMarkdownCode(content: string): string {
  const blank = (text: string) => text.replace(/[^\r\n]/g, " ");
  return content
    .replace(/^[ \t]*(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?^[ \t]*\1[^\r\n]*$/gm, blank)
    .replace(/`[^`\r\n]+`/g, blank);
}

export function collectLinks(inventory: Inventory): GovernanceLink[] {
  const links: GovernanceLink[] = [];
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const file of inventory.governanceFiles) {
    if (!file.content) continue;
    for (const match of maskMarkdownCode(file.content).matchAll(pattern)) {
      const target = match[1].trim().split(/\s+["']/)[0];
      links.push({ file, target, resolution: resolveLocalLink(inventory, file.path, target) });
    }
  }
  return links;
}

const NPM_VALUE_FLAGS = new Set(["-w", "--workspace", "--prefix", "-C", "--loglevel", "--registry", "--cache", "--userconfig", "--tag", "--access", "--otp"]);
const NPM_RUN_ALIASES = new Set(["run", "run-script", "rum", "urn"]);
const NPM_LIFECYCLE_SCRIPTS: Readonly<Record<string, string>> = { test: "test", t: "test", tst: "test", start: "start", stop: "stop", restart: "restart" };
// npm's own commands (and aliases) never name a package script.
const NPM_BUILTIN_COMMANDS = new Set([
  "access", "adduser", "audit", "bugs", "cache", "ci", "clean-install", "completion", "config", "c", "dedupe", "ddp",
  "deprecate", "diff", "dist-tag", "docs", "doctor", "edit", "exec", "x", "explain", "why", "explore", "find-dupes",
  "fund", "help", "hook", "init", "create", "install", "i", "add", "in", "ins", "install-ci-test", "cit", "install-test",
  "it", "link", "ln", "ll", "login", "logout", "ls", "list", "org", "outdated", "owner", "pack", "ping", "pkg", "prefix",
  "profile", "prune", "publish", "query", "rebuild", "rb", "repo", "root", "sbom", "search", "set", "get", "shrinkwrap",
  "star", "stars", "team", "token", "uninstall", "un", "unlink", "remove", "rm", "unpublish", "unstar", "update", "up",
  "upgrade", "version", "view", "info", "show", "whoami"
]);

export interface NpmScriptReference {
  script: string;
  /** `--if-present` makes a missing script a no-op rather than a failure. */
  ifPresent: boolean;
}

/**
 * Extracts package scripts that npm invocations depend on, skipping npm's own flags and built-in
 * commands. Unknown subcommands count as script names only when `includeUnknown` is set, because
 * prose such as "npm is required" must not read as a command in documentation.
 */
export function npmScriptReferences(text: string, { includeUnknown = false }: { includeUnknown?: boolean } = {}): NpmScriptReference[] {
  const references: NpmScriptReference[] = [];
  for (const match of text.matchAll(/\bnpm[ \t]+([^\r\n`;&|)]*)/g)) {
    const tokens = match[1].trim().split(/[ \t]+/).map((token) => token.replace(/^["']|["']$/g, "")).filter(Boolean);
    let command: string | null = null;
    let argument: string | null = null;
    let ifPresent = false;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token === "--") break;
      if (token.startsWith("-")) {
        if (token === "--if-present") ifPresent = true;
        if (NPM_VALUE_FLAGS.has(token)) index += 1;
        continue;
      }
      if (command === null) {
        command = token;
        if (!NPM_RUN_ALIASES.has(command)) break;
        continue;
      }
      argument = token;
      break;
    }
    if (command === null) continue;
    const script = NPM_RUN_ALIASES.has(command)
      ? argument
      : NPM_LIFECYCLE_SCRIPTS[command] ?? (includeUnknown && !NPM_BUILTIN_COMMANDS.has(command) ? command : null);
    if (script && /^[\w:.@/-]+$/.test(script)) references.push({ script, ifPresent });
  }
  return references;
}

export function documentedNpmCommands(inventory: Inventory): Array<{ file: TextFileRecord; script: string }> {
  return inventory.governanceFiles.flatMap((file) => npmScriptReferences(file.content ?? "")
    .filter((reference) => !reference.ifPresent)
    .map((reference) => ({ file, script: reference.script })));
}

export function packageHasScript(inventory: Inventory, name: string): boolean {
  return inventory.packages.some((manifest) => Object.hasOwn(manifest.scripts, name));
}

export function pathIsUnder(directory: string, candidate: string): boolean {
  return directory === "." || candidate === directory || candidate.startsWith(`${directory}/`);
}

export function uniqueManifestRoots(files: FileRecord[], pattern: RegExp): FileRecord[] {
  const selected = new Map<string, FileRecord>();
  for (const file of files.filter((candidate) => pattern.test(candidate.path))) {
    const directory = path.posix.dirname(file.path).toLowerCase();
    if (!selected.has(directory)) selected.set(directory, file);
  }
  return [...selected.values()];
}

export function moduleCoverage(inventory: Inventory): Array<{ path: string; test: boolean; build: boolean }> {
  const npmModules = inventory.packages.map((manifest) => ({
    path: manifest.path,
    test: Object.keys(manifest.scripts).some((name) => /^(?:(?:test|lint|check|verify|validate)(?::|$)|type-?check(?::|$))/i.test(name)),
    build: Object.keys(manifest.scripts).some((name) => /^(?:(?:build|compile|check)(?::|$)|type-?check(?::|$))/i.test(name))
  }));
  const buildRoots = [...inventory.maven, ...inventory.gradle].filter((file) => {
    const depth = file.path.split("/").length;
    return depth <= 3;
  }).map((file) => ({ path: file.path, test: true, build: true }));
  const python = uniqueManifestRoots(inventory.projectManifests, /(^|\/)(?:pyproject\.toml|requirements(?:-[^/]+)?\.txt|Pipfile)$/i).map((file) => {
    const directory = path.posix.dirname(file.path);
    const test = inventory.files.some((candidate) => pathIsUnder(directory, candidate.path) && /(^|\/)(?:tests?\/|test_[^/]+\.py$|[^/]+_test\.py$)/i.test(candidate.path));
    return { path: file.path, test, build: /pyproject\.toml$/i.test(file.path) };
  });
  const go = uniqueManifestRoots(inventory.projectManifests, /(^|\/)go\.mod$/i).map((file) => {
    const directory = path.posix.dirname(file.path);
    const test = inventory.files.some((candidate) => pathIsUnder(directory, candidate.path) && /_test\.go$/i.test(candidate.path));
    return { path: file.path, test, build: true };
  });
  const rust = uniqueManifestRoots(inventory.projectManifests, /(^|\/)Cargo\.toml$/i)
    .map((file) => ({ path: file.path, test: true, build: true }));
  const solutions = uniqueManifestRoots(inventory.projectManifests, /\.sln$/i);
  const dotnetRoots = solutions.length > 0
    ? solutions
    : inventory.projectManifests.filter((file) => /\.(?:csproj|fsproj|vbproj)$/i.test(file.path) && !/(?:^|[.\/_-])tests?(?:[.\/_-]|$)/i.test(file.path));
  const dotnet = dotnetRoots.map((file) => {
    const directory = path.posix.dirname(file.path);
    const test = inventory.files.some((candidate) => pathIsUnder(directory, candidate.path) && (/(?:^|\/)(?:tests?)\//i.test(candidate.path) || /(?:^|[.\/_-])tests?\.(?:csproj|fsproj|vbproj)$/i.test(candidate.path)));
    return { path: file.path, test, build: true };
  });
  const godot = uniqueManifestRoots(inventory.projectManifests, /(^|\/)project\.godot$/i).map((file) => {
    const directory = path.posix.dirname(file.path);
    const test = inventory.files.some((candidate) => pathIsUnder(directory, candidate.path) && /(^|\/)tests?\//i.test(candidate.path));
    const build = inventory.files.some((candidate) => pathIsUnder(directory, candidate.path) && /(^|\/)export_presets\.cfg$/i.test(candidate.path));
    return { path: file.path, test, build };
  });
  return [...npmModules, ...buildRoots, ...python, ...go, ...rust, ...dotnet, ...godot];
}
