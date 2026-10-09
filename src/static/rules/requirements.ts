import { evidence, fileEvidence, outcome } from "../../core/evidence.js";
import { anyOf, firstMatchingGovernance, COLLABORATION_ROLE_PATTERNS } from "./shared.js";
import type { RuleDefinition, TextFileRecord } from "../../types.js";

export const REQUIREMENTS_RULES: readonly RuleDefinition[] = [
  {
    id: "requirements.artifact-contract",
    dimension: "requirements",
    title: "需求事实具有创建、内容与更新契约",
    severity: "error",
    weight: 4,
    check(inventory) {
      const triggerPattern = anyOf(
        "i",
        /(?:收到|接到|新增|新建|新|new).{0,16}(?:需求|任务|变更|\b(?:requirement|task|change)\b).{0,32}(?:创建|新建|建立|记录|create)|(?:当|若|每当).{0,8}(?:新增|新建|收到|接到).{0,16}(?:需求|任务|变更).{0,32}(?:创建|新建|建立|记录)/,
        /\b(?:new|each|every|incoming)\b.{0,16}\b(?:requirements?|tasks?|changes?|features?|requests?|issues?|stor(?:y|ies))\b.{0,40}\b(?:creat|open|add|writ|record|start)\w*|\b(?:create|open|write|add|start)\b (?:a |an )?(?:new )?(?:spec|proposal|brief|PRD|design doc|requirements? doc|issue)\b.{0,40}\b(?:for|per|when|before)\b (?:each|every|a|any|new)\b/
      );
      const contentPattern = anyOf(
        "i",
        /需求(?:设计)?(?:记录|文档|简报|提案|事实).{0,24}(?:需|应|必须|包含|记录).{0,48}(?:目标|范围|当前(?:实现|行为)|来源)|\b(?:proposal|brief|spec(?:ification)?)\b.{0,24}(?:记录|包含|应包含|must include|records?|contains?).{0,48}(?:目标|范围|当前(?:实现|行为)|来源|goals?|scope|source)|按.{0,8}需求.{0,8}记录.{0,40}(?:目标|范围|当前(?:实现|行为)|来源|事实)/,
        /\b(?:requirements? (?:docs?|documents?|records?|files?)|spec(?:ification)?s?|PRDs?|proposals?|briefs?|feature requests?|user stor(?:y|ies))\b.{0,32}\b(?:must|should|shall|needs? to)\b.{0,12}\b(?:include|record|contain|capture|describe|state|list|cover)\w*.{0,48}\b(?:goals?|objectives?|scope|current behaviou?r|motivation|problem|source)\b/
      );
      const syncPattern = anyOf(
        "i",
        /(?:实现|代码|范围|需求|scope).{0,32}(?:完成|变化|变更).{0,32}(?:更新|同步).{0,32}(?:需求|事实|文档|记录|工件|proposal|brief|spec)|(?:更新|同步).{0,32}(?:需求|事实|文档|记录|工件|proposal|brief|spec).{0,32}(?:实现|代码|范围|变化|完成)/,
        /\b(?:implementation|code|scope|requirements?)\b.{0,32}\b(?:changes?|changed|evolves?|is done|completes?|finished)\b.{0,40}\b(?:updat|sync|revis|amend)\w*.{0,32}\b(?:spec|requirements?|docs?|proposal|brief|record)|\b(?:updat|sync|keep)\w*.{0,32}\b(?:spec|requirements?|proposal|brief)\b.{0,40}\b(?:in sync|up to date|when|after|whenever)\b.{0,32}\b(?:implementation|code|scope|changes?)\b/
      );
      const matches = [triggerPattern, contentPattern, syncPattern]
        .map((pattern) => ({ pattern, file: firstMatchingGovernance(inventory, pattern) }));
      const found = matches.filter((match): match is { pattern: RegExp; file: TextFileRecord } => match.file !== undefined);
      if (found.length === 3) {
        return outcome("pass", "需求事实契约覆盖创建触发、记录内容和变化后同步。", {
          evidence: found.map(({ file, pattern }) => evidence(file, pattern))
        });
      }
      return outcome(found.length > 0 ? "partial" : "fail", `需求事实契约只覆盖了 ${found.length}/3 项能力。`, {
        evidence: found.map(({ file, pattern }) => evidence(file, pattern)),
        recommendation: "说明何时建立需求记录、记录哪些目标/范围/现状，以及实现或范围变化后如何同步。"
      });
    }
  },
  {
    id: "requirements.plan-traceability",
    dimension: "requirements",
    title: "需求事实与实施计划可追踪关联",
    severity: "error",
    weight: 3,
    check(inventory) {
      const relationshipPattern = anyOf(
        "i",
        /(?:需求(?:事实|记录|文档|简报|提案)?|\b(?:proposal|brief|spec(?:ification)?)\b).{0,80}(?:实施(?:方案|计划)|\b(?:design|approach|tasks?)\b).{0,48}(?:同名|对应|关联|引用|同一|一一|通过.{0,12}(?:ID|标识))|(?:同名|对应|关联|引用|同一|一一).{0,48}(?:需求(?:事实|记录|文档|简报|提案)?|\b(?:proposal|brief|spec(?:ification)?)\b).{0,80}(?:实施(?:方案|计划)|\b(?:design|approach|tasks?)\b)/,
        /\b(?:requirements?|specs?|specification|proposal|brief|PRD)\b.{0,80}\b(?:implementation plan|plan|design|approach|tasks?)\b.{0,48}\b(?:same (?:file|folder|directory|name)|linked|links? (?:to|back)|references?|refers? to|cross-link\w*|by (?:id|issue number|ticket)|matching (?:id|name))\b|\b(?:implementation plan|plan|design|approach|tasks?)\b.{0,48}\b(?:lives?|kept|stored|goes|is written|belongs?)\b.{0,16}\b(?:in|inside)\b.{0,8}\bthe same\b.{0,24}\b(?:spec|requirements?|proposal|brief|file|folder|directory)\b/
      );
      const bundlePattern = /(?:新(?:需求|任务|变更)|new (?:requirement|task|change|feature)).{0,32}(?:创建|新建|建立|create).{0,24}(?:同一|same|single|one).{0,16}(?:目录|工件包|bundle|folder|directory).{0,160}\b(?:proposal|brief|spec(?:ification)?)\b.{0,140}\b(?:design|approach|tasks?)\b/i;
      const files = inventory.governanceFiles
        .filter((file) => COLLABORATION_ROLE_PATTERNS.requirement.test(file.content ?? "") && COLLABORATION_ROLE_PATTERNS.plan.test(file.content ?? ""));
      const explicit = files.find((candidate) => relationshipPattern.test(candidate.content ?? ""));
      const bundled = explicit ? undefined : files.find((candidate) => bundlePattern.test(candidate.content ?? ""));
      const file = explicit ?? bundled;
      if (file) {
        return outcome("pass", "协议要求需求事实与实施计划建立可追踪关系。", {
          evidence: explicit
            ? evidence(file, relationshipPattern)
            : evidence(file, /(?:新增|新建).{0,24}(?:需求|任务|变更).{0,24}(?:创建|新建|建立)|(?:创建|新建|建立).{0,24}(?:需求|任务|变更)/i)
        });
      }
      return outcome(files.length > 0 ? "partial" : "fail", "未发现需求事实与实施计划之间的明确关联方式。", {
        evidence: fileEvidence(files[0]),
        recommendation: "允许同名文件、同一任务目录、显式引用或外部 ID，只需保证需求与计划可双向定位。"
      });
    }
  },
  {
    id: "requirements.acceptance-contract",
    dimension: "requirements",
    title: "需求文档规定验收标准或验收用例",
    severity: "error",
    weight: 3,
    check(inventory) {
      const acceptancePattern = /验收(?:标准|条件|方式|用例|步骤|约定|要求|后)|已验收|未验收|acceptance (?:criteria|tests?|checks?)|definition of done|done criteria/i;
      const contractPattern = anyOf(
        "i",
        /(?:需求|任务|变更|工件|spec|proposal|brief|design|approach|plan|方案|计划).{0,40}(?:必须|需要|应|记录|包含|写入|维护|定义|must include|records?|contains?).{0,32}(?:验收(?:标准|条件|方式|用例|步骤)|acceptance criteria|definition of done)|(?:验收(?:标准|条件|方式|用例|步骤)|acceptance criteria|definition of done).{0,40}(?:记录|写入|维护|定义).{0,32}(?:需求|任务|变更|工件|spec|proposal|brief|design|approach|plan|方案|计划)/,
        /\b(?:requirements?|specs?|specification|tasks?|changes?|proposal|brief|design|plan|PRD|issues?|stor(?:y|ies)|tickets?)\b.{0,48}\b(?:must|should|shall|needs? to|include|record|contain|define|list|capture|state)\w*.{0,64}\b(?:acceptance (?:criteria|tests?|checks?)|definition of done|done criteria)\b|\b(?:acceptance criteria|definition of done)\b.{0,48}\b(?:live|recorded|written|defined|belong|go)\w*.{0,32}\b(?:in|inside)\b.{0,24}\b(?:requirements?|specs?|tasks?|proposal|plan|issues?|tickets?)\b/
      );
      const contract = firstMatchingGovernance(inventory, contractPattern);
      if (contract) {
        return outcome("pass", "协议把验收信息明确落到需求或实施工件中。", {
          evidence: evidence(contract, contractPattern)
        });
      }
      const mention = firstMatchingGovernance(inventory, acceptancePattern);
      return outcome(mention ? "partial" : "fail", mention
        ? "发现通用验收约定，但没有明确要求写入需求或实施工件。"
        : "协议没有要求为需求记录可验证的验收条件。", {
        evidence: fileEvidence(mention),
        recommendation: "在工作区选定的需求或计划工件中固定记录验收标准、用例或完成定义。"
      });
    }
  }
];
