import { evidence, fileEvidence, outcome } from "../../core/evidence.js";
import { anyOf, VERIFICATION_COMMAND, governanceText, firstMatchingGovernance, firstMatchingPolicy, documentedNpmCommands, npmScriptReferences, packageHasScript, moduleCoverage } from "./shared.js";
import type { RuleDefinition } from "../../types.js";

function npmCommandLine(script: string): RegExp {
  const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(String.raw`\bnpm\b.*(?<![\w:.@/-])${escaped}(?![\w:.@/-])`);
}

export const VERIFICATION_RULES: readonly RuleDefinition[] = [
  {
    id: "accuracy.documented-commands",
    dimension: "verification",
    title: "文档中的 npm 命令真实存在",
    severity: "error",
    weight: 2,
    check(inventory) {
      const commands = documentedNpmCommands(inventory);
      if (commands.length === 0) return outcome("not_applicable", "入口未声明 npm run 命令。")
      if (!inventory.developmentStarted) {
        return outcome("not_applicable", "项目尚未开始开发，文档中的 npm 命令待 package.json 建立后核对。", {
          evidence: evidence(commands[0].file, npmCommandLine(commands[0].script))
        });
      }
      const missing = commands.filter((command) => !packageHasScript(inventory, command.script));
      return missing.length === 0
        ? outcome("pass", `解析的 ${commands.length} 个 npm run 引用均能在清单中找到。`, { evidence: evidence(commands[0].file, npmCommandLine(commands[0].script)) })
        : outcome("fail", `发现 ${missing.length} 个无法在 package.json 中找到的 npm 脚本。`, {
            evidence: evidence(missing[0].file, npmCommandLine(missing[0].script)),
            recommendation: `修正文档命令或补充脚本：${missing[0].script}`,
            data: { missing: [...new Set(missing.map((command) => command.script))] }
          });
    }
  },
  {
    id: "verification.commands",
    dimension: "verification",
    title: "构建和验证命令有可执行依据",
    severity: "error",
    weight: 3,
    check(inventory) {
      const text = governanceText(inventory);
      const documented = VERIFICATION_COMMAND.test(text);
      const manifests = inventory.projectManifests.length + inventory.buildFiles.length;
      if (documented && manifests > 0) {
        const file = firstMatchingGovernance(inventory, VERIFICATION_COMMAND);
        if (file) return outcome("pass", "入口提供验证命令，且发现对应工程清单。", { evidence: evidence(file, VERIFICATION_COMMAND) });
      }
      // Before any code exists the protocol can only promise commands; their backing is checked once the project is set up.
      if (documented && !inventory.developmentStarted) {
        const file = firstMatchingGovernance(inventory, VERIFICATION_COMMAND);
        return outcome("pass", "入口规定了验证命令；项目尚未开始开发，命令与工程清单的对应关系待建立后核对。", {
          evidence: file ? evidence(file, VERIFICATION_COMMAND) : null
        });
      }
      if (manifests > 0) return outcome("partial", "发现工程清单，但入口没有清晰的验证命令。", { recommendation: "记录可复制的窄测试、完整测试、lint 和构建命令。" });
      if (documented) {
        const file = firstMatchingGovernance(inventory, VERIFICATION_COMMAND);
        return outcome("partial", "入口提供验证命令，但未发现可支撑它的工程清单或构建文件。", {
          evidence: file ? evidence(file, VERIFICATION_COMMAND) : null,
          recommendation: "确认验证命令依赖的工程清单或构建文件位于扫描范围内。"
        });
      }
      return outcome("fail", "未发现验证命令或受支持的工程清单。", { recommendation: "补充真实可运行的验证入口。" });
    }
  },
  {
    id: "verification.module-coverage",
    dimension: "verification",
    title: "可运行模块具有测试或检查入口",
    severity: "warning",
    weight: 2,
    check(inventory) {
      const modules = moduleCoverage(inventory);
      if (modules.length === 0) {
        return inventory.developmentStarted
          ? outcome("unknown", "没有识别出可评价的工程模块。")
          : outcome("not_applicable", "项目尚未开始开发，没有可评价的工程模块。");
      }
      const uncovered = modules.filter((module) => !module.test);
      if (uncovered.length === 0) return outcome("pass", `${modules.length} 个识别模块均具有测试或检查入口。`, { evidence: fileEvidence(inventory.files.find((file) => file.path === modules[0].path)) });
      return outcome("partial", `${uncovered.length}/${modules.length} 个模块未发现测试或 lint/check 脚本。`, {
        evidence: fileEvidence(inventory.files.find((file) => file.path === uncovered[0].path)),
        recommendation: "为每个独立可运行模块提供统一的 test、lint 或 check 入口。",
        data: { uncovered: uncovered.map((module) => module.path) }
      });
    }
  },
  {
    id: "verification.acceptance-loop",
    dimension: "verification",
    title: "实现后验证并记录结论",
    severity: "error",
    weight: 4,
    check(inventory) {
      const sequencePattern = anyOf(
        "i",
        /(?:实现|实施|修改).{0,24}(?:完成|后|变化).{0,24}(?:验证|测试)|(?:验证|测试).{0,24}(?:完成|通过|失败|结果).{0,24}(?:更新|同步|记录)|(?:完成|交付|结束|收尾)(?:前|之前).{0,24}(?:执行|运行).{0,48}(?:验证|测试|test|lint|check)/,
        /\b(?:after|once|when)\b.{0,16}\b(?:implement\w*|chang\w*|making changes|code changes|finish\w*)\b.{0,40}\b(?:run|execut)\w*.{0,24}\b(?:tests?|verification|checks?|validat\w*)|\b(?:run|execut)\w*.{0,48}\b(?:tests?|checks?|validat\w*|verification|lint)\b.{0,24}\b(?:before|after)\b (?:finishing|completing|handing off|marking|declaring|you finish|done)|\b(?:tests?|verification|checks?)\b.{0,24}\b(?:pass\w*|fail\w*|results?)\b.{0,24}\b(?:updat|record|report|sync)\w*/
      );
      const resultPattern = anyOf(
        "i",
        /(?:记录|写入|同步|更新).{0,24}(?:验证|测试|检查)(?:结果|结论|状态)?|(?:验证|测试|检查)(?:结果|结论|状态).{0,24}(?:记录|写入|同步|更新)|未检查范围/,
        /\b(?:record|write|log|report|note|updat)\w*.{0,32}\b(?:test|verification|check|validation)s? ?(?:results?|outcomes?|status)\b|\b(?:record|write|log|report|note)\w* (?:the )?results\b|\b(?:test|verification|check) (?:results?|outcomes?)\b.{0,24}\b(?:record|write|log|report|note)\w*|\b(?:left unverified|not verified|unverified|unchecked|untested)\b/
      );
      const sequence = firstMatchingPolicy(inventory, sequencePattern);
      const resultHome = firstMatchingPolicy(inventory, resultPattern);
      if (sequence && resultHome) {
        return outcome("pass", "协议要求实现后验证，并为验证结论提供状态落点。", {
          evidence: [evidence(sequence, sequencePattern), evidence(resultHome, resultPattern)]
        });
      }
      return outcome(sequence || resultHome ? "partial" : "fail", "实现、验证和结果记录尚未形成完整闭环。", {
        evidence: fileEvidence(sequence ?? resultHome),
        recommendation: "规定实现后执行适用验证，并把通过、失败、阻塞和未检查范围写入任务状态。"
      });
    }
  },
  {
    id: "automation.commands-resolve",
    dimension: "verification",
    title: "已有自动化引用的命令和脚本可解析",
    severity: "error",
    weight: 2,
    check(inventory) {
      const automation = [...inventory.workflows, ...inventory.hooks];
      if (automation.length === 0) return outcome("not_applicable", "没有 CI 或 hook 自动化文件。")
      const missing = [];
      for (const file of automation) {
        const content = file.content ?? "";
        for (const reference of npmScriptReferences(content, { includeUnknown: true })) {
          if (!reference.ifPresent && !packageHasScript(inventory, reference.script)) missing.push({ file, target: `npm ${reference.script}` });
        }
        for (const match of content.matchAll(/(?:-File|\bnode|\bbash|\bsh)\s+([.\w/\\-]+\.(?:js|mjs|cjs|ps1|sh))/gi)) {
          const target = match[1].replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
          if (!inventory.filePaths.has(target)) missing.push({ file, target: match[1] });
        }
      }
      return missing.length === 0
        ? outcome("pass", "已有 CI/hook 引用的 npm 脚本和仓库脚本均可解析。", { evidence: fileEvidence(automation[0]) })
        : outcome("fail", `已有 CI/hook 包含 ${missing.length} 个无法解析的命令或脚本。`, {
            evidence: fileEvidence(missing[0].file),
            recommendation: `修复自动化引用：${missing[0].target}`,
            data: { missing: missing.map((item) => ({ file: item.file.path, target: item.target })) }
          });
    }
  }
];
