import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { TextDecoder } from "node:util";
import { InputError } from "../errors.js";
import type {
  FileRecord,
  Inventory,
  LinkResolution,
  PackageManifest,
  ProfileSelection,
  SkippedPath,
  TextFileRecord
} from "../types.js";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".gradle",
  ".idea",
  ".next",
  ".nuxt",
  ".vite",
  ".vscode",
  ".ekko-benchmark",
  "node_modules",
  "target",
  "dist",
  "build",
  "coverage",
  "out",
  "temp"
]);

const ROOT_ENTRYPOINTS = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  "AI_INSTRUCTIONS.md",
  ".github/copilot-instructions.md",
  ".cursorrules",
  ".windsurfrules"
];

const MAX_FILES = 20_000;
const MAX_TEXT_BYTES = 512 * 1024;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function existsWithoutSymlink(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  if (!isInside(root, target)) return false;
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : "unreadable";
}

function walk(root: string, policyExclusions: ReadonlySet<string>): { files: FileRecord[]; skipped: SkippedPath[]; truncated: boolean } {
  const files: FileRecord[] = [];
  const skipped: SkippedPath[] = [];
  let truncated = false;

  function visit(directory: string): void {
    if (truncated) return;
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      skipped.push({ path: toPosix(path.relative(root, directory)) || ".", reason: errorCode(error) });
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      if (entry.isSymbolicLink()) {
        skipped.push({ path: toPosix(path.relative(root, path.join(directory, entry.name))), reason: "symlink" });
        continue;
      }
      if (entry.isDirectory()) {
        const child = path.join(directory, entry.name);
        const relative = toPosix(path.relative(root, child));
        if (policyExclusions.has(relative.toLowerCase())) {
          skipped.push({ path: relative, reason: "workspace-policy" });
        } else if (!IGNORED_DIRECTORIES.has(entry.name)) {
          visit(child);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      const absolute = path.join(directory, entry.name);
      let size = 0;
      try {
        size = fs.statSync(absolute).size;
      } catch {
        skipped.push({ path: toPosix(path.relative(root, absolute)), reason: "unreadable" });
        continue;
      }
      files.push({ path: toPosix(path.relative(root, absolute)), absolute, size });
    }
  }

  visit(root);
  return { files, skipped, truncated };
}

function discoverGitRoots(root: string, policyExclusions: ReadonlySet<string>, maxDepth = 3): string[] {
  const roots: string[] = [];

  function visit(directory: string, depth: number): void {
    if (fs.existsSync(path.join(directory, ".git"))) roots.push(directory);
    if (depth >= maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || IGNORED_DIRECTORIES.has(entry.name)) continue;
      const child = path.join(directory, entry.name);
      const relative = toPosix(path.relative(root, child));
      if (!policyExclusions.has(relative.toLowerCase())) visit(child, depth + 1);
    }
  }

  visit(root, 0);
  return roots.sort((left, right) => left.localeCompare(right, "en"));
}

function safeRead(file: FileRecord): string | null {
  if (file.size > MAX_TEXT_BYTES) return null;
  try {
    return UTF8_DECODER.decode(fs.readFileSync(file.absolute));
  } catch {
    return null;
  }
}

function rootPolicyExclusions(root: string): Set<string> {
  const exclusions = new Set<string>();
  const pathPattern = /`((?:\.\.?[\\/])?(?:[\w.@-]+[\\/])+?)`/g;
  const prohibitedReadPattern = /(?:不要|不得|禁止).{0,20}(?:列目录|搜索|读取|查看|访问)|(?:完全)?不可访问|(?:do not|must not|never|forbid|prohibit).{0,20}(?:read|search|list|access)/i;

  for (const candidate of ROOT_ENTRYPOINTS) {
    const absolute = path.join(root, candidate);
    let stat;
    try {
      const linkStat = fs.lstatSync(absolute);
      if (linkStat.isSymbolicLink() || !linkStat.isFile()) continue;
      stat = linkStat;
    } catch {
      continue;
    }
    const content = safeRead({ path: toPosix(candidate), absolute, size: stat.size });
    if (content === null) continue;
    for (const line of content.split(/\r?\n/)) {
      if (!prohibitedReadPattern.test(line)) continue;
      for (const match of line.matchAll(pathPattern)) {
        const raw = match[1].replaceAll("\\", "/");
        const resolved = path.resolve(root, raw);
        if (resolved === root || !isInside(root, resolved)) continue;
        try {
          const targetStat = fs.lstatSync(resolved);
          if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) continue;
        } catch {
          continue;
        }
        exclusions.add(toPosix(path.relative(root, resolved)).toLowerCase());
      }
    }
  }
  return exclusions;
}

function collectGovernanceFiles(root: string, startingFiles: TextFileRecord[], byPath: Map<string, FileRecord>): TextFileRecord[] {
  const selected = new Map<string, TextFileRecord>();
  const queue: Array<FileRecord | TextFileRecord> = [...startingFiles];
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  const pathReferencePattern = /`((?:\.{0,2}[\\/])?(?:[\w.@-]+[\\/])*[\w.@-]+\.md(?:#[^`\r\n]*)?)`/gi;

  while (queue.length > 0 && selected.size < 120) {
    const file = queue.shift();
    if (!file) continue;
    if (selected.has(file.path.toLowerCase())) continue;
    const content = "content" in file ? file.content : safeRead(file);
    const enriched = { ...file, content };
    selected.set(file.path.toLowerCase(), enriched);
    if (content === null) continue;

    const rawTargets = [
      ...[...content.matchAll(linkPattern)].map((match) => ({ raw: match[1].trim().split(/\s+["']/)[0].replace(/^<|>$/g, ""), codeReference: false })),
      ...[...content.matchAll(pathReferencePattern)].map((match) => ({ raw: match[1], codeReference: true }))
    ];
    for (const { raw, codeReference } of rawTargets) {
      if (!raw || /^(?:https?:|mailto:|tel:|#)/i.test(raw)) continue;
      let decoded;
      try {
        decoded = decodeURIComponent(raw.split("#", 1)[0]).replaceAll("\\", "/");
      } catch {
        continue;
      }
      const sourceDirectory = path.dirname(path.join(root, file.path));
      const candidates = codeReference
        ? [path.resolve(sourceDirectory, decoded), path.resolve(root, decoded)]
        : [path.resolve(sourceDirectory, decoded)];
      for (const absolute of candidates) {
        if (!isInside(root, absolute)) continue;
        const relative = toPosix(path.relative(root, absolute));
        if (!/\.md$/i.test(relative)) continue;
        const linked = byPath.get(relative.toLowerCase());
        if (!linked) continue;
        if (!selected.has(linked.path.toLowerCase())) queue.push(linked);
        break;
      }
    }
  }
  return [...selected.values()];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function readPackageManifest(file: FileRecord): PackageManifest {
  const content = safeRead(file);
  if (content === null) return { path: file.path, type: "npm", scripts: {}, engines: {}, packageManager: null, invalid: true };
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      path: file.path,
      type: "npm",
      scripts: stringRecord(parsed.scripts),
      engines: stringRecord(parsed.engines),
      packageManager: typeof parsed.packageManager === "string" ? parsed.packageManager : null,
      invalid: false
    };
  } catch {
    return { path: file.path, type: "npm", scripts: {}, engines: {}, packageManager: null, invalid: true };
  }
}

function gitConfig(root: string, key: string): string | null {
  if (!fs.existsSync(path.join(root, ".git"))) return null;
  const result = spawnSync("git", ["-C", root, "config", "--local", "--get", key], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 3_000
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function gitTrackedPaths(root: string): { paths: Set<string>; known: boolean } {
  if (!fs.existsSync(path.join(root, ".git"))) return { paths: new Set(), known: false };
  const result = spawnSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) return { paths: new Set(), known: false };
  return {
    paths: new Set(result.stdout.split("\0").filter(Boolean).map((item) => item.replaceAll("\\", "/").toLowerCase())),
    known: true
  };
}

function isFileRecord(value: FileRecord | undefined): value is FileRecord {
  return value !== undefined;
}

const BUILD_FILE = /(?:^|\/)(?:GNUmakefile|[Mm]akefile|CMakeLists\.txt|justfile|Taskfile\.ya?ml|meson\.build)$/;
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|py|java|kts?|go|rs|cs|fs|vb|c|cc|cpp|cxx|h|hpp|m|mm|swift|rb|php|gd|lua|scala|dart|vue|svelte)$/i;

function isProjectManifest(file: FileRecord): boolean {
  return /(^|\/)(?:package\.json|pom\.xml|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|pyproject\.toml|requirements(?:-[^/]+)?\.txt|Pipfile|go\.mod|Cargo\.toml|[^/]+\.(?:sln|csproj|fsproj|vbproj)|project\.godot|composer\.json|Gemfile|mix\.exs)$/i.test(file.path);
}

export function buildInventory(inputPath: string): Inventory {
  const root = path.resolve(inputPath);
  const stat = fs.statSync(root, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) throw new InputError(`Workspace is not a directory: ${root}`);

  const policyExclusions = rootPolicyExclusions(root);
  const walked = walk(root, policyExclusions);
  const byPath = new Map(walked.files.map((file) => [file.path.toLowerCase(), file]));
  const gitRoots = discoverGitRoots(root, policyExclusions);
  const rootIsGit = gitRoots.some((candidate) => path.resolve(candidate) === root);
  const trackedPaths = gitTrackedPaths(root);
  const rootEntrypoints = ROOT_ENTRYPOINTS
    .map((candidate) => byPath.get(candidate.toLowerCase()))
    .filter(isFileRecord);
  const nestedEntrypoints = walked.files.filter((file) => {
    const basename = path.posix.basename(file.path).toLowerCase();
    return ["agents.md", "claude.md", "gemini.md", "ai_instructions.md"].includes(basename) && !rootEntrypoints.includes(file);
  });
  const instructionFiles = [...rootEntrypoints, ...nestedEntrypoints].map((file) => ({
    ...file,
    content: safeRead(file)
  }));
  const governanceFiles = collectGovernanceFiles(root, instructionFiles, byPath);
  const instructionPaths = new Set(instructionFiles.map((file) => file.path.toLowerCase()));
  const policyFiles = governanceFiles.filter((file) => {
    if (instructionPaths.has(file.path.toLowerCase())) return true;
    return /必须|不得|禁止|未经|只(?:能|允许)|需要.{0,16}(?:授权|许可|确认)|\b(?:MUST|SHALL|NEVER|DO NOT)\b/i.test(file.content ?? "");
  });

  const packages = walked.files
    .filter((file) => path.posix.basename(file.path).toLowerCase() === "package.json")
    .filter((file) => !/(^|\/)tests?\/examples?\//i.test(file.path))
    .map(readPackageManifest);
  const maven = walked.files.filter((file) => path.posix.basename(file.path).toLowerCase() === "pom.xml");
  const gradle = walked.files.filter((file) => /(^|\/)(build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?)$/i.test(file.path));
  const projectManifests = walked.files.filter(isProjectManifest);
  const buildFiles = walked.files.filter((file) => BUILD_FILE.test(file.path));
  const developmentStarted = projectManifests.length > 0 || buildFiles.length > 0 || walked.files.some((file) => SOURCE_FILE.test(file.path));
  const workflows = walked.files.filter((file) => /^\.github\/workflows\/[^/]+\.(ya?ml)$/i.test(file.path)).map((file) => ({ ...file, content: safeRead(file) }));
  const hooks = walked.files.filter((file) => /(^|\/)\.githooks\/[^/]+$/i.test(file.path)).map((file) => ({ ...file, content: safeRead(file) }));
  const versionFiles = walked.files.filter((file) => /(^|\/)(\.nvmrc|\.node-version|\.python-version|\.tool-versions|mise\.toml|gradle\.properties|rust-toolchain(?:\.toml)?|global\.json)$/i.test(file.path));
  const packagePins = packages.filter((manifest) => Object.keys(manifest.engines).length > 0 || manifest.packageManager);
  const mavenPins = maven.filter((file) => /<(?:java\.version|maven\.compiler\.(?:source|target|release))>[^<]+</i.test(safeRead(file) ?? ""));
  const manifestPins = projectManifests.filter((file) => {
    if (/package\.json$|pom\.xml$/i.test(file.path)) return false;
    const content = safeRead(file) ?? "";
    return /requires-python\s*=|^go\s+\d+\.\d+|rust-version\s*=|<TargetFrameworks?>[^<]+</im.test(content);
  });

  return {
    root,
    rootIsGit,
    gitRoots,
    files: walked.files,
    filePaths: new Set(walked.files.map((file) => file.path.toLowerCase())),
    skipped: walked.skipped,
    truncated: walked.truncated,
    rootEntrypoints,
    nestedEntrypoints,
    instructionFiles,
    governanceFiles,
    policyFiles,
    packages,
    maven,
    gradle,
    projectManifests,
    buildFiles,
    developmentStarted,
    workflows,
    hooks,
    runtimePins: [...versionFiles, ...packagePins.map((manifest) => walked.files.find((file) => file.path === manifest.path)), ...mavenPins, ...manifestPins].filter(isFileRecord),
    hookPath: gitConfig(root, "core.hooksPath"),
    gitTrackedPaths: trackedPaths.paths,
    gitTrackedPathsKnown: trackedPaths.known,
    isInside: (target: string) => isInside(root, target)
  };
}

export function detectProfile(inventory: Inventory): ProfileSelection {
  if (!inventory.rootIsGit && inventory.gitRoots.length >= 2) {
    return {
      id: "personal-local-multirepo",
      confidence: "high",
      reason: `根目录不是 Git 仓库，扫描到 ${inventory.gitRoots.length} 个嵌套 Git 仓库。`
    };
  }
  if (inventory.rootIsGit) {
    return {
      id: "team-shared-repo",
      confidence: "high",
      reason: "当前根目录是 Git 仓库，按共享仓库检查版本化协作协议。"
    };
  }
  return {
    id: "team-shared-repo",
    confidence: "low",
    reason: "未发现可明确分类的 Git 结构，暂按共享仓库画像检查；可用 --profile 覆盖。"
  };
}

export function resolveLocalLink(inventory: Inventory, sourcePath: string, rawTarget: string): LinkResolution {
  const targetWithoutFragment = rawTarget.split("#", 1)[0].trim();
  if (!targetWithoutFragment || /^(?:https?:|mailto:|tel:)/i.test(targetWithoutFragment)) return { external: true };
  let decoded;
  try {
    decoded = decodeURIComponent(targetWithoutFragment.replace(/^<|>$/g, ""));
  } catch {
    return { exists: false, path: targetWithoutFragment };
  }
  const sourceDirectory = path.dirname(path.join(inventory.root, sourcePath));
  const absolute = path.resolve(sourceDirectory, decoded);
  if (!inventory.isInside(absolute)) return { outside: true, path: decoded };
  return {
    exists: existsWithoutSymlink(inventory.root, absolute),
    path: toPosix(path.relative(inventory.root, absolute)) || "."
  };
}
