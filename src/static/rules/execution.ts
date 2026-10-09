import { evidence, fileEvidence, outcome } from "../../core/evidence.js";
import { anyOf, firstMatchingInstruction, firstMatchingGovernance, firstMatchingRootInstruction } from "./shared.js";
import type { RuleDefinition } from "../../types.js";

export const EXECUTION_RULES: readonly RuleDefinition[] = [
  {
    id: "scoping.module-guidance",
    dimension: "execution",
    title: "规则说明模块或目录适用范围",
    severity: "warning",
    weight: 2,
    check(inventory) {
      // A bare mention of "目录" or "path" does not tell an Agent which rules apply where.
      const scopePattern = anyOf(
        "i",
        /(?:适用于|仅适用|只适用|作用于|适用范围|作用范围).{0,24}(?:目录|模块|仓库|子项目|包|前端|后端)|(?:目录|模块|仓库|子项目|前端|后端).{0,24}(?:各自|单独|局部|就近|专属)的?(?:规则|约定|规范|说明)|(?:就近|局部|子目录).{0,16}(?:AGENTS|CLAUDE|规则|规范)|(?:最近|就近|所属|靠近).{0,16}(?:目录|模块|仓库|子仓库|层级).{0,24}(?:AGENTS|CLAUDE|规则|规范)|规则.{0,24}(?:优先级|优先于|覆盖|就近)/,
        /\b(?:appl(?:y|ies)|scoped|limited) to\b.{0,24}\b(?:director(?:y|ies)|modules?|packages?|folders?|repositor(?:y|ies)|frontend|backend)\b|\b(?:director(?:y|ies)|modules?|packages?|folders?|frontend|backend)\b.{0,24}\b(?:specific|local|own)\b.{0,12}\b(?:rules|conventions|guidelines|instructions)\b|\b(?:nearest|closest)\b.{0,24}\b(?:AGENTS|CLAUDE|rules|instructions)|\b(?:rules|instructions)\b.{0,24}\b(?:precedence|override|take priority)\b/
      );
      // Two or more location-to-purpose lines ("`src/` — UI", "| `pkg/api` | ...", "后端：`server/`") map where code lives.
      const directoryMapLine = anyOf(
        "",
        /^\s*(?:[-*]\s+|\|\s*)?(?:`\.?[\w@-]+(?:\/[\w.@-]+)*\/?`|\.?[\w@-]+(?:\/[\w.@-]+)*\/)\s*(?:[:：|—–]|\s-\s)\s*\S/,
        /^\s*(?:[-*]\s+|#{1,6}\s+)?[^`:：|\r\n]{1,24}[:：]\s*`\.?[\w@-]+(?:\/[\w.@-]+)*\/`\s*$/
      );
      const mentionPattern = anyOf(
        "i",
        /目录|模块|仓库|前端|后端|scope|path|frontend|backend/,
        /\b(?:modules?|director(?:y|ies)|folders?|packages?|repositor(?:y|ies)|monorepo)\b/
      );
      const scoped = firstMatchingInstruction(inventory, scopePattern);
      if (scoped) return outcome("pass", "入口说明了规则对目录、模块或仓库的适用范围。", { evidence: evidence(scoped, scopePattern) });
      const mapLines = (file: { content: string | null }) => (file.content ?? "").split(/\r?\n/).filter((line) => directoryMapLine.test(line)).length;
      const mapped = inventory.instructionFiles.find((file) => mapLines(file) >= 2);
      if (mapped) return outcome("pass", "入口提供了目录与职责的对应说明。", { evidence: evidence(mapped, directoryMapLine) });
      const mentioned = firstMatchingInstruction(inventory, mentionPattern)
        ?? inventory.instructionFiles.find((file) => mapLines(file) > 0);
      return mentioned
        ? outcome("partial", "入口提到目录或模块，但没有说明各目录的职责或规则适用范围。", {
            evidence: evidence(mentioned, anyOf("i", mentionPattern, directoryMapLine)),
            recommendation: "列出主要目录的职责，或说明哪些规则适用于哪些目录与模块。"
          })
        : outcome("fail", "入口未说明规则的适用目录或模块。", { recommendation: "说明根规则与子目录规则的优先级及适用范围。" });
    }
  },
  {
    id: "accuracy.manifest-validity",
    dimension: "execution",
    title: "工程清单可以解析",
    severity: "error",
    weight: 2,
    check(inventory) {
      if (inventory.packages.length === 0) return outcome("not_applicable", "未发现 package.json。");
      const invalid = inventory.packages.filter((manifest) => manifest.invalid);
      return invalid.length === 0
        ? outcome("pass", `${inventory.packages.length} 个 package.json 均可解析。`)
        : outcome("fail", `发现 ${invalid.length} 个无法解析的 package.json。`, {
            evidence: fileEvidence(inventory.files.find((file) => file.path === invalid[0].path)),
            recommendation: "修复 JSON 语法后再依赖其中的构建和测试命令。",
            data: { invalid: invalid.map((manifest) => manifest.path) }
          });
    }
  },
  {
    id: "accuracy.runtime-version",
    dimension: "execution",
    title: "运行时或工具链版本有固定依据",
    severity: "warning",
    weight: 1,
    check(inventory) {
      const hasProjects = inventory.projectManifests.length > 0;
      if (!hasProjects) return outcome("not_applicable", "未识别出需要运行时版本的工程清单。")
      return inventory.runtimePins.length > 0
        ? outcome("pass", "发现运行时或工具链版本约束。", { evidence: fileEvidence(inventory.runtimePins[0]) })
        : outcome("partial", "发现工程清单，但没有识别出运行时版本约束。", { recommendation: "通过 engines、.nvmrc、.tool-versions 或构建属性固定支持版本。" });
    }
  },
  {
    id: "execution.child-instructions",
    dimension: "execution",
    title: "进入子仓库前加载其局部规则",
    severity: "error",
    weight: 3,
    applies(inventory) {
      return inventory.nestedEntrypoints.length > 0;
    },
    check(inventory) {
      const pattern = anyOf(
        "i",
        /(?:进入|修改|处理|工作).{0,24}(?:子仓库|子目录|模块|repository).{0,40}(?:前|时).{0,40}(?:读取|阅读|遵守|加载).{0,24}(?:CLAUDE|AGENTS|规则|instructions)|(?:确认|识别).{0,16}(?:需求|任务).{0,12}(?:涉及|影响).{0,16}(?:仓库|模块).{0,32}(?:再|然后).{0,20}(?:读(?:取)?|阅读|加载).{0,24}(?:目标|每个|对应|局部|最近).{0,16}(?:仓库|目录|AGENTS|CLAUDE|规则|instructions)/,
        /\b(?:before|when)\b.{0,16}\b(?:work|edit|chang|modify|touch|enter)\w*.{0,32}\b(?:sub-?(?:repos?|repositor(?:y|ies)|projects?|director(?:y|ies)|packages?)|modules?|packages?|repositor(?:y|ies))\b.{0,40}\b(?:read|load|follow|obey|apply)\w*.{0,24}\b(?:AGENTS|CLAUDE|rules|instructions)/
      );
      const file = firstMatchingRootInstruction(inventory, pattern);
      return file
        ? outcome("pass", "根入口要求进入子仓库前加载局部规则。", { evidence: evidence(file, pattern) })
        : outcome("fail", "发现子级 Agent 入口，但根入口没有说明何时加载。", {
            recommendation: "要求 Agent 在修改目标子仓库前读取并服从其局部入口。"
          });
    }
  },
  {
    id: "execution.plan-impact",
    dimension: "execution",
    title: "实施计划承载方案与影响范围",
    severity: "error",
    weight: 4,
    check(inventory) {
      const plan = firstMatchingGovernance(inventory, anyOf(
        "i",
        /(?:方案|计划|approach|design|implementation plan|tasks?).{0,80}(?:实施|实现|步骤|任务|技术|影响|待确认|验收)|(?:实施|实现|技术|目标).{0,48}(?:方案|计划|approach|design|tasks?)/,
        /\b(?:plans?|approach|spec)\b.{0,80}\b(?:implementation|steps?|tasks?|impact|affected|pending|acceptance)\b|\bimplementation (?:plan|approach|design|steps)\b/
      ));
      // Bare "impact" also matches prose such as "performance impact"; require an impacted code scope.
      const impactPattern = /(?:受)?影响的?(?:文件|模块|范围|组件)|affected (?:files?|modules?|components?|areas?|packages?)|impact(?:ed)? (?:files?|modules?|components?|areas?|scope|analysis)|blast radius/i;
      const impact = firstMatchingGovernance(inventory, impactPattern);
      if (plan && impact) {
        return outcome("pass", "工作区为实施方案和影响范围定义了记录落点。", {
          evidence: evidence(impact, impactPattern)
        });
      }
      return outcome(plan || impact ? "partial" : "fail", "实施计划对方案或影响范围的约定不完整。", {
        evidence: fileEvidence(plan ?? impact),
        recommendation: "要求实施计划记录目标方案、影响文件或模块、待确认项和验收方式。"
      });
    }
  }
];
