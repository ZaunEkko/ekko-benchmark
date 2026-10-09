import { evidence, fileEvidence, outcome } from "../../core/evidence.js";
import { anyOf, instructionText, hasAny, rootInstructionFiles, firstMatchingRootInstruction, collaborationRoles, collectLinks } from "./shared.js";
import type { RuleDefinition } from "../../types.js";

export const CONTEXT_RULES: readonly RuleDefinition[] = [
  {
    id: "discoverability.entrypoint-versioned",
    dimension: "context",
    title: "共享入口已纳入版本控制",
    severity: "error",
    weight: 2,
    applies: (_, profile) => profile.id === "team-shared-repo",
    check(inventory) {
      if (!inventory.rootIsGit) return outcome("not_applicable", "根目录不是 Git 仓库。")
      if (!inventory.gitTrackedPathsKnown) return outcome("unknown", "Git 索引读取失败，无法确定根级入口是否已被跟踪。")
      const tracked = inventory.rootEntrypoints.filter((file) => inventory.gitTrackedPaths.has(file.path.toLowerCase()));
      if (tracked.length > 0) return outcome("pass", `有 ${tracked.length} 个根级入口已被 Git 跟踪。`, { evidence: fileEvidence(tracked[0]) });
      return outcome("fail", "根级协作入口尚未被 Git 跟踪，其他协作者无法从仓库恢复规则。", { recommendation: "确认内容后将协作入口纳入版本控制。" });
    }
  },
  {
    id: "discoverability.multi-tool-consistency",
    dimension: "context",
    title: "多工具入口指向统一事实源",
    severity: "warning",
    weight: 2,
    applies: (_, profile) => profile.id === "team-shared-repo",
    check(inventory) {
      if (inventory.rootEntrypoints.length < 2) {
        return outcome("not_applicable", "只发现一个工具入口，没有多入口一致性问题。")
      }
      const shortEntrypoints = inventory.rootEntrypoints.filter((file) => (file.size ?? 0) < 2_000);
      const namesMentioned = instructionText(inventory);
      const canonical = inventory.rootEntrypoints.find((file) => /instructions|agents|claude/i.test(file.path));
      const coherent = shortEntrypoints.length >= inventory.rootEntrypoints.length - 1 || hasAny(namesMentioned, ["统一", "source of truth", "single source", "canonical", "以 ", "为准"]);
      return coherent
        ? outcome("pass", "多个工具入口采用薄入口或明确统一事实源。", { evidence: fileEvidence(canonical) })
        : outcome("partial", "存在多个较长入口，未能确定其事实是否保持一致。", { recommendation: "保留一个规范事实源，其余工具入口只做短链接。" });
    }
  },
  {
    id: "scoping.layered-loading",
    dimension: "context",
    title: "大型规范支持分层加载",
    severity: "warning",
    weight: 1,
    check(inventory) {
      const links = collectLinks(inventory).filter((link) => link.resolution.exists);
      if (inventory.nestedEntrypoints.length > 0 || links.length >= 2) {
        return outcome("pass", "发现子目录入口或可解析的分层规范链接。", { evidence: fileEvidence(inventory.nestedEntrypoints[0] ?? links[0]?.file) });
      }
      const total = inventory.instructionFiles.reduce((sum, file) => sum + file.size, 0);
      return total < 8_000
        ? outcome("pass", "当前入口体积较小，无需强制拆分。")
        : outcome("partial", "规范较长且缺少明显的分层加载入口。", { recommendation: "在根入口保留索引，按任务或目录链接详细规则。" });
    }
  },
  {
    id: "context.capability-navigation",
    dimension: "context",
    title: "根入口导航需求生命周期事实源",
    severity: "error",
    weight: 4,
    check(inventory) {
      const navigationPattern = anyOf(
        "i",
        /按任务类型|(?:读取|阅读|加载|查阅).{0,24}(?:规则|规范|文档|状态|上下文)|(?:规则|规范|文档|状态|上下文).{0,24}(?:读取|阅读|加载|查阅)|(?:索引|入口|路由).{0,16}(?:规则|规范|文档|状态|上下文)|按以下顺序|(?:开工|任务启动)(?:顺序|流程|步骤)|确认.{0,16}任务涉及.{0,16}(?:仓库|模块).{0,32}(?:再|然后).{0,16}(?:读(?:取)?|加载)/,
        /reading order|load order|(?:read|load) (?:them )?in (?:the following|this) order|by task type|\b(?:read|load|consult|check)\w*.{0,24}\b(?:docs?|documentation|rules|guidelines|status|context|specs?)\b|\b(?:index|entry ?point|map|where to find)\b.{0,16}\b(?:docs?|rules|status|context)\b/
      );
      const entry = rootInstructionFiles(inventory)
        .map((file) => ({ file, roles: collaborationRoles(file.content ?? "") }))
        .filter(({ file }) => navigationPattern.test(file.content ?? ""))
        .sort((left, right) => right.roles.length - left.roles.length)[0];
      if (!entry) return outcome("fail", "根级入口没有声明如何导航协作能力所需的事实源。", {
        recommendation: "在根入口说明任务状态、长期约束、需求事实、实施计划、确认决策和验证信息从何处加载。"
      });
      if (entry.roles.length === 6) {
        return outcome("pass", `根入口可导航 ${entry.roles.length}/6 类协作事实。`, {
          evidence: evidence(entry.file, navigationPattern),
          data: { roles: entry.roles }
        });
      }
      if (entry.roles.length >= 4) {
        return outcome("partial", `根入口只覆盖 ${entry.roles.length}/6 类协作事实。`, {
          evidence: evidence(entry.file, navigationPattern),
          recommendation: "补充缺失的任务状态、长期约束、需求事实、实施计划、确认决策或验证信息入口。",
          data: { roles: entry.roles }
        });
      }
      return outcome("fail", "根入口没有形成可执行的协作事实导航。", {
        evidence: evidence(entry.file, navigationPattern),
        recommendation: "按工作区自己的组织方式，把各类协作事实接入根入口。"
      });
    }
  },
  {
    id: "context.task-aware-loading",
    dimension: "context",
    title: "上下文加载顺序明确",
    severity: "warning",
    weight: 2,
    check(inventory) {
      const orderPattern = anyOf(
        "i",
        /(?:读取|阅读|加载|建立上下文).{0,16}顺序|按以下顺序|按任务类型|根据.{0,16}(?:需求|任务|模块).{0,16}(?:读取|加载|查阅)|(?:需求|任务|模块).{0,16}(?:对应|相关|适用).{0,16}(?:文档|规则|规范)|(?:开工|任务启动)(?:顺序|流程|步骤)|(?:确认|识别).{0,16}(?:需求|任务).{0,12}(?:涉及|影响).{0,16}(?:仓库|模块).{0,32}(?:再|然后).{0,16}(?:读(?:取)?|加载)/,
        /reading order|load order|\b(?:read|load)\w*.{0,16}\bin (?:the following|this) order|by task type|depending on the (?:task|module|area)|\b(?:for|per) (?:each )?(?:task|module|area)\b.{0,24}\b(?:read|load|consult|see)\w*|\b(?:read|load|consult|see)\w*.{0,24}\b(?:relevant|corresponding|applicable)\b.{0,16}\b(?:docs?|rules|guides?|specs?)\b/
      );
      const file = firstMatchingRootInstruction(inventory, orderPattern);
      if (!file) {
        return outcome("partial", "根入口虽可能链接文档，但没有按顺序或任务类型声明加载方式。", {
          recommendation: "规定上下文加载顺序，或提供从任务类型到适用事实源的路由表。"
        });
      }
      const roles = collaborationRoles(file.content ?? "");
      return roles.length >= 4
        ? outcome("pass", "根入口按顺序或任务类型加载多类协作事实。", { evidence: evidence(file, orderPattern), data: { roles } })
        : outcome("partial", "发现加载说明，但覆盖的协作事实类型不足。", {
            evidence: evidence(file, orderPattern),
            recommendation: "把任务状态、适用约束、需求事实、方案和确认决策纳入加载路径。",
            data: { roles }
          });
    }
  },
  {
    id: "accuracy.local-links",
    dimension: "context",
    title: "本地规范链接可以解析",
    severity: "error",
    weight: 2,
    check(inventory) {
      const links = collectLinks(inventory);
      const broken = links.filter((link) => !link.resolution.external && (link.resolution.outside || !link.resolution.exists));
      if (broken.length > 0) {
        return outcome("fail", `发现 ${broken.length} 个无法解析的本地链接。`, {
          evidence: evidence(broken[0].file, broken[0].target),
          recommendation: `修复或删除链接：${broken[0].target}`,
          data: { broken: broken.map((link) => ({ file: link.file.path, target: link.target })) }
        });
      }
      return links.length > 0
        ? outcome("pass", `检查了 ${links.length} 个 Markdown 链接，未发现失效的仓库内目标。`, { evidence: fileEvidence(links[0].file) })
        : outcome("not_applicable", "入口中没有 Markdown 链接。")
    }
  },
  {
    id: "context.instruction-size",
    dimension: "context",
    title: "入口上下文体积受控",
    severity: "warning",
    weight: 2,
    check(inventory) {
      if (inventory.instructionFiles.length === 0) return outcome("not_applicable", "没有入口文件。")
      const oversized = inventory.instructionFiles.filter((file) => file.size > 32_000);
      return oversized.length === 0
        ? outcome("pass", "单个入口文件均未超过 32 KiB。", { evidence: fileEvidence(inventory.instructionFiles[0]) })
        : outcome("partial", `${oversized.length} 个入口超过 32 KiB。`, { evidence: fileEvidence(oversized[0]), recommendation: "根入口保留高价值约束和索引，将领域细节按需加载。" });
    }
  },
  {
    id: "context.duplicate-entrypoints",
    dimension: "context",
    title: "工具入口避免重复维护长事实",
    severity: "warning",
    weight: 1,
    check(inventory) {
      if (inventory.rootEntrypoints.length < 2) return outcome("not_applicable", "只有一个根级工具入口。")
      const long = inventory.rootEntrypoints.filter((file) => file.size > 4_000);
      return long.length <= 1
        ? outcome("pass", "最多只有一个长入口，其余入口适合充当指针。", { evidence: fileEvidence(inventory.rootEntrypoints[0]) })
        : outcome("partial", "多个工具入口都维护了较长内容，存在规则漂移风险。", { evidence: fileEvidence(long[0]), recommendation: "集中维护一个规范事实源，其他入口只链接和声明优先级。" });
    }
  }
];
