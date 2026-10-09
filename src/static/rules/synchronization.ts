import { evidence, evidenceAt, fileEvidence, outcome } from "../../core/evidence.js";
import { anyOf, firstMatchingGovernance, firstMatchingRootInstruction, CURRENT_STATE_SOURCE_PATTERN, currentStateFiles, explicitIdleStateEvidence } from "./shared.js";
import type { RuleDefinition } from "../../types.js";

export const SYNCHRONIZATION_RULES: readonly RuleDefinition[] = [
  {
    id: "synchronization.status-source",
    dimension: "synchronization",
    title: "任务状态与长期事实源可发现",
    severity: "warning",
    weight: 3,
    check(inventory) {
      const durablePattern = anyOf(
        "i",
        /(?:长期|跨需求).{0,24}(?:规则|规范|事实|决策|约束)|(?:规则|规范|事实|决策|约束).{0,24}(?:长期|跨需求)/,
        /long-lived|durable|persistent (?:rules|decisions|constraints|docs)/
      );
      const stateFile = firstMatchingGovernance(inventory, CURRENT_STATE_SOURCE_PATTERN);
      const durableFile = firstMatchingGovernance(inventory, durablePattern);
      if (stateFile && durableFile) return outcome("pass", "任务状态与长期规范/决策存在可区分的事实源。", {
        evidence: [evidence(stateFile, CURRENT_STATE_SOURCE_PATTERN), evidence(durableFile, durablePattern)]
      });
      if (stateFile || durableFile) return outcome("partial", "只发现任务状态或长期规范中的一类事实源。", {
        evidence: fileEvidence(stateFile ?? durableFile),
        recommendation: "区分临时任务状态与长期规则、规格和决策。"
      });
      return outcome("fail", "未发现明确的任务状态或长期决策事实源。", { recommendation: "指定唯一任务状态入口，并区分规则、规格、决策和交接。" });
    }
  },
  {
    id: "synchronization.resume-path",
    dimension: "synchronization",
    title: "新会话接续路径明确",
    severity: "warning",
    weight: 2,
    check(inventory) {
      const pattern = anyOf(
        "i",
        /(?:接续|恢复|开始.{0,12}(?:任务|工作)|新会话|current work|current task|任务状态|开工(?:顺序|流程|步骤)).{0,48}(?:读取|加载|查看|入口|来源|read|load|open|顺序|上下文|HANDOFF)|(?:读取|加载|查看).{0,32}(?:当前任务|任务状态|进度|阻塞|current work|current task|HANDOFF)|开始.{0,16}(?:前|时).{0,32}(?:当前状态|当前任务|上下文)/,
        /\b(?:new session|resum\w*|pick(?:ing)? up|start(?:ing)? (?:a |any )?(?:task|work|session)|task status|current (?:status|state))\b.{0,48}\b(?:read|load|check|open|see)\w*|\b(?:read|load|check|open)\w*.{0,32}\b(?:current (?:task|work|status|state)|task status|progress|blockers?|handoff)\b|\b(?:before|when) (?:starting|you start|beginning|resuming)\b.{0,32}\b(?:read|load|check)\w*.{0,32}\b(?:current|status|progress|context)\b/
      );
      const file = firstMatchingRootInstruction(inventory, pattern);
      return file
        ? outcome("pass", "根入口定义了当前任务或新会话恢复路径。", { evidence: evidence(file, pattern) })
        : outcome("partial", "未发现新会话恢复路径。", { recommendation: "说明新会话从何处读取当前任务、分支、阻塞和下一步。" });
    }
  },
  {
    id: "synchronization.resume-context",
    dimension: "synchronization",
    title: "交接状态覆盖进度、阻塞、验证和下一步",
    severity: "error",
    weight: 3,
    check(inventory) {
      const patterns = [
        /当前.{0,16}(?:任务|需求|状态|分支)|进度|current (?:task|work|status|state|branch)|progress/i,
        /阻塞|待(?:确认|处理|验收|授权|完成)|pending|blocker/i,
        /验证(?:结果|结论|通过|失败|记录)|测试(?:结果|通过|失败|项)|验收(?:结果|结论|通过|完成|失败|记录)|已验收|未验收|检查结果|verification|verified|test results?|tests? (?:pass|fail)\w*|checks? (?:pass|fail)\w*|acceptance (?:passed|failed|results?)/i,
        /下一步|接续|推荐.{0,8}顺序|待办|next step|up next|to-?do\b/i
      ];
      const stateFiles = currentStateFiles(inventory);
      const idleState = stateFiles
        .map((file) => ({ file, evidence: explicitIdleStateEvidence(file) }))
        .find((candidate) => candidate.evidence !== null);
      if (idleState?.evidence) {
        return outcome("pass", "当前状态索引明确记录没有进行中的任务，无需任务级交接字段。", {
          evidence: idleState.evidence,
          data: { signals: 4, idle: true }
        });
      }
      const candidate = stateFiles
        .map((file) => {
          const lines = (file.content ?? "").split(/\r?\n/);
          const matched = patterns.flatMap((pattern) => {
            const index = lines.findIndex((line) => pattern.test(line));
            return index >= 0 ? [{ pattern, evidence: evidenceAt(file, index + 1, lines[index]) }] : [];
          });
          return { file, matched };
        })
        .sort((left, right) => right.matched.length - left.matched.length)[0];
      if (!candidate?.file.content) {
        return outcome("fail", "未发现可从入口到达且可读取的任务状态文档。", {
          recommendation: "提供当前任务状态源，并从根入口直接导航。"
        });
      }
      const signals = candidate.matched.length;
      if (signals === 4) {
        return outcome("pass", `任务状态文档覆盖了 ${signals}/4 类接续信息。`, {
          evidence: candidate.matched.map((match) => match.evidence),
          data: { signals }
        });
      }
      return outcome("partial", `任务状态文档只覆盖了 ${signals}/4 类接续信息。`, {
        evidence: fileEvidence(candidate.file),
        recommendation: "补充当前进度、阻塞或待确认项、验证结果和推荐下一步。",
        data: { signals }
      });
    }
  },
  {
    id: "synchronization.completion-sync",
    dimension: "synchronization",
    title: "实现与确认变化会同步回长期文档",
    severity: "error",
    weight: 3,
    check(inventory) {
      const pattern = anyOf(
        "i",
        /(?:任务|需求|范围|实现|实施|验证|规则|决策|状态).{0,36}(?:完成|发生变化|变化|变更|通过).{0,36}(?:同步|更新|归档|迁移|记录|archive).{0,32}(?:事实源|文档|记录|工件|状态|proposal|design|tasks|spec)|(?:同步|更新|归档|archive).{0,28}(?:事实源|文档|记录|工件|状态|proposal|design|tasks|spec).{0,36}(?:实现|验证|完成|变化|变更)/,
        /\b(?:tasks?|requirements?|scope|implementation|verification|decisions?|status|work)\b.{0,36}\b(?:complet|finish|chang|done|pass|land)\w*.{0,36}\b(?:updat|sync|archiv|record|mov)\w*.{0,32}\b(?:docs?|documentation|specs?|status|records?|proposal|design|tasks|changelog|STATUS)\b|\b(?:updat|sync|archiv)\w*.{0,28}\b(?:docs?|specs?|status|records?|proposal|design|tasks|STATUS)\b.{0,36}\b(?:when|after|once|whenever)\b.{0,24}\b(?:implement\w*|verif\w*|complet\w*|finish\w*|chang\w*|scope)/
      );
      const file = firstMatchingGovernance(inventory, pattern);
      return file
        ? outcome("pass", "协议要求把实现、验证或确认后的变化同步回事实源。", { evidence: evidence(file, pattern) })
        : outcome("fail", "未发现任务完成或范围变化后更新协作事实源的规则。", {
            recommendation: "规定代码和确认结果变化后同步对应事实源，避免下一次会话读取旧状态。"
          });
    }
  }
];
