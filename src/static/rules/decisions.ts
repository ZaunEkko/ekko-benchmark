import { evidence, fileEvidence, outcome } from "../../core/evidence.js";
import { anyOf, firstMatchingGovernance, collaborationRoles } from "./shared.js";
import type { RuleDefinition } from "../../types.js";

export const DECISIONS_RULES: readonly RuleDefinition[] = [
  {
    id: "decisions.role-separation",
    dimension: "decisions",
    title: "规则、事实、方案、决策和进度职责分离",
    severity: "error",
    weight: 4,
    check(inventory) {
      const separationPattern = anyOf(
        "i",
        /文档职责|工件职责|职责.{0,24}(?:分离|区分)|文档分类|分别(?:记录|维护|保存)|只记录|不能替代|唯一.{0,12}(?:入口|来源)/,
        /source of truth|canonical|single source|\b(?:document|artifact|file) (?:responsibilit(?:y|ies)|roles)\b|\b(?:only|exclusively) (?:records?|contains?|holds?|tracks?)\b|\bdo(?:es)? not (?:replace|duplicate)\b|\bkept separate(?:ly)?\b|\b(?:recorded|tracked|maintained) separately\b/
      );
      const candidate = inventory.governanceFiles
        .filter((file) => separationPattern.test(file.content ?? ""))
        .map((file) => ({ file, roles: collaborationRoles(file.content ?? "").filter((role) => role !== "verification") }))
        .sort((left, right) => right.roles.length - left.roles.length)[0];
      const file = candidate?.file;
      const roles = candidate?.roles ?? [];
      if (roles.length >= 4 && file) {
        return outcome("pass", `协议区分了 ${roles.length}/5 类协作事实的职责。`, {
          evidence: evidence(file, separationPattern),
          data: { roles }
        });
      }
      return outcome(roles.length >= 2 ? "partial" : "fail", `协议只识别并区分了 ${roles.length}/5 类协作事实。`, {
        evidence: fileEvidence(file),
        recommendation: "按工作区自己的工件体系，区分长期约束、需求事实、实施计划、确认决策和当前任务状态。",
        data: { roles }
      });
    }
  },
  {
    id: "decisions.human-confirmed-persistence",
    dimension: "decisions",
    title: "关键取舍经人确认后持久化",
    severity: "error",
    weight: 4,
    check(inventory) {
      const pattern = anyOf(
        "i",
        /(?:用户|人|负责人|owner|human).{0,24}(?:确认|批准|同意|决定).{0,32}(?:记录|写入|沉淀|追加|更新|decision|ADR|log|约束)|(?:只有|仅|only).{0,32}(?:确认|批准|同意).{0,32}(?:记录|写入|沉淀|decision|ADR|log)/,
        /\b(?:user|human|owner|maintainer)s?\b.{0,24}\b(?:confirm|approv|agree|accept|sign(?:s|ed)? off|decid)\w*.{0,48}\b(?:record|write|log|persist|document|add|capture|store)\w*.{0,24}\b(?:decisions?|ADRs?|log|constraints?)\b|\bonly\b.{0,32}\b(?:confirmed|approved|agreed|accepted)\b.{0,32}\b(?:decisions?|ADRs?|log|record)/
      );
      const file = firstMatchingGovernance(inventory, pattern);
      return file
        ? outcome("pass", "协议把人的确认设为关键决策沉淀条件。", { evidence: evidence(file, pattern) })
        : outcome("fail", "未发现关键取舍与人工确认之间的持久化门槛。", {
            recommendation: "规定 Agent 先提出待确认项，并把人确认后的关键取舍写入工作区选定的决策事实源。"
          });
    }
  },
  {
    id: "decisions.evolution-history",
    dimension: "decisions",
    title: "决策变化保留历史而非静默改写",
    severity: "warning",
    weight: 2,
    check(inventory) {
      const statusPattern = /Proposed.{0,40}Accepted|Accepted.{0,40}Superseded|Draft.{0,40}(?:Approved|Confirmed)|待确认.{0,40}已确认|Active.{0,40}(?:Superseded|Archived)/i;
      const statusFile = firstMatchingGovernance(inventory, statusPattern);
      const historyPattern = anyOf(
        "i",
        /(?:决策|取舍|决定|decision|ADR|约束).{0,32}(?:变化|替代|变更|过时).{0,48}(?:新建|追加|保留|归档|Superseded|append|archive)|(?:不|不要|不得|never).{0,20}(?:静默)?(?:改写|覆盖|删除).{0,24}(?:历史|结论|记录|decision)/,
        /\b(?:decisions?|ADRs?|constraints?)\b.{0,48}\b(?:chang|replac|supersed|obsolete|revis)\w*.{0,64}\b(?:new (?:ADR|record|entry)|append|supersed|archiv|keep)\w*|\b(?:never|do not|don't|must not)\b.{0,20}\b(?:silently )?(?:rewrite|overwrite|delete|edit)\b.{0,32}\b(?:history|old (?:ADRs?|decisions?)|accepted (?:ADRs?|decisions?)|past decisions?|the record)/
      );
      const historyFile = firstMatchingGovernance(inventory, historyPattern);
      if (historyFile) {
        return outcome("pass", "决策事实源定义了变更历史保留方式。", {
          evidence: [
            ...(statusFile ? [evidence(statusFile, statusPattern)] : []),
            evidence(historyFile, historyPattern)
          ]
        });
      }
      return outcome(statusFile ? "partial" : "fail", "未发现决策变化后保留可追踪历史的规则。", {
        evidence: fileEvidence(statusFile),
        recommendation: "决策变化时追加或新建记录，标明替代关系并保留旧结论；状态名称可以自定义。"
      });
    }
  }
];
