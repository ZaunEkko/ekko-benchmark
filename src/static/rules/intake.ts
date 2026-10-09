import { evidence, fileEvidence, outcome } from "../../core/evidence.js";
import { anyOf, firstMatchingGovernance, findControlledLine, firstMatchingRootInstruction } from "./shared.js";
import type { RuleDefinition } from "../../types.js";

export const INTAKE_RULES: readonly RuleDefinition[] = [
  {
    id: "discoverability.root-entrypoint",
    dimension: "intake",
    title: "根级 AI 入口可发现",
    severity: "error",
    weight: 3,
    check(inventory) {
      const entry = inventory.rootEntrypoints[0];
      return entry
        ? outcome("pass", `发现 ${inventory.rootEntrypoints.length} 个根级入口。`, { evidence: fileEvidence(entry) })
        : outcome("fail", "未发现受支持的根级 AI 协作入口。", { recommendation: "新增 AGENTS.md，或使用 CLAUDE.md 等明确入口并指向统一规则。" });
    }
  },
  {
    id: "discoverability.entrypoint-content",
    dimension: "intake",
    title: "根级入口包含可执行内容",
    severity: "error",
    weight: 2,
    check(inventory) {
      const meaningful = inventory.rootEntrypoints.find((file) => {
        const content = inventory.instructionFiles.find((candidate) => candidate.path === file.path)?.content ?? "";
        return content.replace(/[#*`\s-]/g, "").length >= 40;
      });
      return meaningful
        ? outcome("pass", "至少一个根级入口包含非占位的协作说明。", { evidence: fileEvidence(meaningful) })
        : outcome("fail", "根级入口为空、过短或只有标题，无法指导任务。", { recommendation: "补充项目边界、验证命令、授权规则和事实源入口。" });
    }
  },
  {
    id: "intake.start-procedure",
    dimension: "intake",
    title: "入口规定接到需求后的启动动作",
    severity: "error",
    weight: 3,
    check(inventory) {
      const pattern = anyOf(
        "im",
        /(?:开始|处理|执行|着手).{0,16}(?:实质)?(?:需求|任务).{0,12}(?:前|时)|(?:收到|接到|面对).{0,12}(?:需求|任务)|(?:^|\n)#{0,6}\s*(?:\d+(?:\.\d+)*[.)、]?\s*)?(?:开工|任务启动|开始任务)(?:顺序|流程|步骤)[\s\S]{0,500}(?:读取|检查|确认|识别|定位|加载)/,
        /before.{0,16}(?:task|work|implementation)|(?:when|after|once|whenever) (?:you )?(?:receive|get|are given|pick up|start|begin|take on).{0,16}(?:task|request|requirement|issue|feature|ticket)|(?:^|\n)#{0,6}\s*(?:\d+(?:\.\d+)*[.)]?\s*)?(?:getting started|starting (?:a |any |new )?(?:task|work)|task (?:start|kickoff|intake))\b[\s\S]{0,500}\b(?:read|check|confirm|identify|locate|load)/
      );
      const file = firstMatchingRootInstruction(inventory, pattern);
      return file
        ? outcome("pass", "根级入口明确规定了新需求开始时的动作。", { evidence: evidence(file, pattern) })
        : outcome("fail", "根级入口没有说明 Agent 接到自然语言需求后如何启动。", {
            recommendation: "在根入口规定新任务的默认启动流程，例如先恢复状态、加载适用规则并建立需求上下文。"
          });
    }
  },
  {
    id: "intake.clarification-policy",
    dimension: "intake",
    title: "不确定项会进入人工澄清而非静默猜测",
    severity: "error",
    weight: 3,
    check(inventory) {
      const uncertaintyPattern = anyOf(
        "i",
        /待确认|不确定|歧义|冲突|未知|猜测/,
        /assumption|ambiguous|ambiguit(?:y|ies)|unclear|uncertain|\bunknowns?\b|\bconflicts?\b|guess|unsure/
      );
      const confirmationPattern = anyOf(
        "i",
        /(?:询问|请求|等待|交由|ask).{0,12}(?:用户|项目负责人|需求负责人|human|owner).{0,20}(?:确认|澄清|决定|批准|clarif|confirm|decide)?|(?:用户|项目负责人|需求负责人|human|owner).{0,16}(?:确认|澄清|决定|批准)(?:后|前|的|关键)|(?:关键|业务).{0,12}(?:歧义|不确定).{0,12}(?:前|时)?(?:必须|需要|应|才)?确认/,
        /\b(?:ask|consult|wait for|check with|confirm with)\w*.{0,16}\b(?:user|human|owner|maintainer|requester)s?\b|\b(?:until|unless|after|once|before)\b.{0,12}\b(?:user|human|owner|maintainer)s? (?:confirm|clarif|decide|approv)\w*|\b(?:user|human|owner|maintainer)s? (?:must|should|needs? to|has to) (?:confirm|clarify|decide|approve)\b/
      );
      const direct = findControlledLine(inventory, uncertaintyPattern, confirmationPattern, inventory.governanceFiles);
      const uncertainty = firstMatchingGovernance(inventory, uncertaintyPattern);
      const confirmation = firstMatchingGovernance(inventory, confirmationPattern);
      if (direct) {
        return outcome("pass", "协议明确要求把影响结果的不确定项交由人澄清。", {
          evidence: direct.evidence
        });
      }
      if (uncertainty || confirmation) {
        return outcome("partial", "发现不确定项或人工确认说明，但没有直接建立“发现不确定项就询问人”的动作关系。", {
          evidence: [
            ...(uncertainty ? [evidence(uncertainty, uncertaintyPattern)] : []),
            ...(confirmation && confirmation !== uncertainty ? [evidence(confirmation, confirmationPattern)] : [])
          ],
          recommendation: "在同一条规则中说明哪些不确定项必须询问人，以及确认前如何保持为待确认而不是既定事实。"
        });
      }
      return outcome("fail", "未发现需求歧义和关键取舍的人工澄清机制。", {
        recommendation: "要求 Agent 对影响结果的未知项提问，并将未确认内容保持为待确认状态。"
      });
    }
  }
];
