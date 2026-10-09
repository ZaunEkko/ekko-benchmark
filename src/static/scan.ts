import { buildInventory, detectProfile } from "../core/inventory.js";
import { getProfile } from "./profiles.js";
import { RULES } from "./rules.js";
import { calculateStaticScore, rankImprovements } from "./score.js";
import { PACKAGE_NAME, VERSION } from "../meta.js";
import { loadConfig } from "./config.js";
import { InputError } from "../errors.js";
import type { ProfileSelection, RuleResult, StaticReport } from "../types.js";

export function scanWorkspace(workspace: string, options: { profile?: string } = {}): StaticReport {
  const inventory = buildInventory(workspace);
  const config = loadConfig(inventory.root);
  const detected = detectProfile(inventory);
  const profile = getProfile(options.profile ?? config.profile ?? detected.id);
  const profileSelection: ProfileSelection = options.profile
    ? { id: profile.id, confidence: "explicit", reason: "通过 --profile 显式指定。" }
    : config.profile
      ? { id: profile.id, confidence: "configured", reason: `由 ${config.path} 指定。` }
      : detected;
  const knownRules = new Set(RULES.map((rule) => rule.id));
  const unknownWaiver = config.waivers.find((waiver) => !knownRules.has(waiver.rule));
  if (unknownWaiver) throw new InputError(`${config.path} waiver references unknown rule '${unknownWaiver.rule}'.`);
  const waiverByRule = new Map(config.waivers.map((waiver) => [waiver.rule, waiver]));
  const unusedWaivers: string[] = [];

  const results: RuleResult[] = RULES.map((rule): RuleResult => {
    if (rule.applies && !rule.applies(inventory, profile)) {
      if (waiverByRule.has(rule.id)) unusedWaivers.push(rule.id);
      return {
        id: rule.id,
        dimension: rule.dimension,
        title: rule.title,
        severity: rule.severity,
        weight: rule.weight,
        status: "not_applicable",
        summary: `不适用于 ${profile.id} 画像。`,
        evidence: [],
        recommendation: null,
        data: null
      };
    }
    const result = {
      id: rule.id,
      dimension: rule.dimension,
      title: rule.title,
      severity: rule.severity,
      weight: rule.weight,
      ...rule.check(inventory, profile)
    };
    const waiver = waiverByRule.get(rule.id);
    if (!waiver) return result;
    // A waiver excuses an unmet rule; applied to a passing rule it would only drop that pass from the denominator.
    if (result.status === "pass" || result.status === "not_applicable") {
      unusedWaivers.push(rule.id);
      return result;
    }
    return {
      ...result,
      status: "waived",
      summary: `${result.summary} Waiver: ${waiver.reason}`,
      data: { ...(result.data ?? {}), originalStatus: result.status, waiverReason: waiver.reason }
    };
  });
  const scoring = calculateStaticScore(results, profile);
  const externalLinkCount = inventory.instructionFiles.reduce((count, file) => {
    return count + ((file.content ?? "").match(/\]\(https?:\/\//gi)?.length ?? 0);
  }, 0);
  const staleMarkerCount = inventory.policyFiles.reduce((count, file) => {
    return count + ((file.content ?? "").match(/\b(?:TODO|FIXME|TBD)\b|待补充|待确认|占位(?:符|内容)/gi)?.length ?? 0);
  }, 0);
  const unreadableGovernanceCount = inventory.governanceFiles.filter((file) => file.content === null).length;
  const policyExcluded = inventory.skipped.filter((item) => item.reason === "workspace-policy");
  const otherSkipped = inventory.skipped.length - policyExcluded.length;

  return {
    schemaVersion: "1.0",
    tool: { name: PACKAGE_NAME, version: VERSION },
    kind: "static-readiness",
    workspace: inventory.root,
    profile: { ...profile, selection: profileSelection },
    config: { path: config.path, minScore: config.minScore, waivers: config.waivers },
    staticReadiness: scoring,
    results,
    improvements: rankImprovements(results, profile),
    reviewItems: [
      ...(!inventory.developmentStarted ? [{ id: "development-not-started", summary: "未发现工程清单、构建文件或源代码，按尚未开始开发处理：协作协议照常评分，文档命令与工程清单的对应关系待项目建立后重新扫描核对。" }] : []),
      ...(externalLinkCount > 0 ? [{ id: "external-links", summary: `${externalLinkCount} 个外部链接未做联网有效性检查。` }] : []),
      ...(staleMarkerCount > 0 ? [{ id: "stale-markers", summary: `${staleMarkerCount} 个待办或占位标记需要人工确认是否仍然有效。` }] : []),
      ...(unreadableGovernanceCount > 0 ? [{ id: "unreadable-governance", summary: `${unreadableGovernanceCount} 个治理文档因超大、非 UTF-8 或读取失败而未解析。` }] : []),
      ...(inventory.rootIsGit && !inventory.gitTrackedPathsKnown ? [{ id: "git-index-unavailable", summary: "Git 索引读取失败，版本化与受跟踪敏感文件结论保持 unknown。" }] : []),
      ...(unusedWaivers.length > 0 ? [{ id: "unused-waivers", summary: `${unusedWaivers.length} 个 waiver 对应的规则已通过或不适用，未生效，可从配置中移除：${unusedWaivers.join("、")}。` }] : []),
      ...(policyExcluded.length > 0 ? [{ id: "policy-excluded", summary: `${policyExcluded.length} 个目录因根入口的明确访问禁令未被列举或读取。` }] : []),
      ...(otherSkipped > 0 ? [{ id: "skipped-files", summary: `${otherSkipped} 个路径因符号链接或读取限制被跳过。` }] : [])
    ],
    inventory: {
      files: inventory.files.length,
      gitRoots: inventory.gitRoots.map((root) => root.replaceAll("\\", "/")),
      rootEntrypoints: inventory.rootEntrypoints.map((file) => file.path),
      instructionFiles: inventory.instructionFiles.map((file) => file.path),
      governanceFiles: inventory.governanceFiles.map((file) => file.path),
      policyFiles: inventory.policyFiles.map((file) => file.path),
      manifests: inventory.projectManifests.length,
      workflows: inventory.workflows.length,
      hooks: inventory.hooks.length,
      truncated: inventory.truncated
    },
    unchecked: [
      "外部链接内容和远程仓库状态",
      "文档命令的真实执行结果与生产环境行为",
      "Coding Agent 在真实软件任务中的代码正确率、越界行为和恢复能力",
      "被忽略目录、构建产物和符号链接目标",
      ...(!inventory.developmentStarted ? ["文档中的构建、测试命令与尚未建立的工程清单是否对应"] : []),
      ...(policyExcluded.length > 0 ? [`根入口明确禁止访问的目录：${policyExcluded.map((item) => `${item.path}/`).join("、")}`] : [])
    ],
    disclaimer: "此分数只表示软件项目的静态 Coding Agent 协作协议完备度；无需真实跑任务，但不评价代码质量、模型能力或具体开发任务成功率。"
  };
}
