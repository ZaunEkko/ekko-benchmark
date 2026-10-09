import { evidence, outcome } from "../../core/evidence.js";
import { anyOf, firstMatchingPolicy, findControlledLine } from "./shared.js";
import type { RuleDefinition } from "../../types.js";

export const BOUNDARIES_RULES: readonly RuleDefinition[] = [
  {
    id: "boundaries.repository-shape",
    dimension: "boundaries",
    title: "工作区 Git 结构符合协作画像",
    severity: "error",
    weight: 2,
    check(inventory, profile) {
      if (profile.id === "personal-local-multirepo") {
        return !inventory.rootIsGit && inventory.gitRoots.length >= 2
          ? outcome("pass", `根协调目录之外发现 ${inventory.gitRoots.length} 个独立 Git 仓库。`)
          : outcome("fail", "当前结构不符合个人本地多仓画像。", { recommendation: "确认扫描根目录，或显式选择更合适的画像。" });
      }
      return inventory.rootIsGit
        ? outcome("pass", "协作根目录本身属于 Git 仓库。")
        : outcome("fail", "共享仓库画像下，根规则和状态无法确认已被版本化。", { recommendation: "从真实 Git 根目录扫描，或改用 personal-local-multirepo。" });
    }
  },
  {
    id: "boundaries.documented",
    dimension: "boundaries",
    title: "仓库和写入边界有明确说明",
    severity: "error",
    weight: 3,
    check(inventory) {
      const headingPattern = anyOf(
        "im",
        /(?:工作区|仓库|修改|写入)边界|边界与授权/,
        /\b(?:repository|repo|workspace|write|edit|file) (?:boundar(?:y|ies)|scope)\b|^#{1,6}\s*(?:boundaries|scope of changes)\b/
      );
      const heading = firstMatchingPolicy(inventory, headingPattern);
      const controlled = findControlledLine(
        inventory,
        anyOf("i", /仓库|目录|模块|工程|workspace|repository/, /\b(?:repo|files?|director(?:y|ies)|folders?|modules?|packages?|codebase|project)\b/),
        anyOf(
          "i",
          /(?:只能|只在|不得|不要).{0,24}(?:修改|写入|执行)|(?:修改|写入|执行).{0,24}(?:只能|只在|不得|不要)/,
          /\b(?:only|never|do not|don't|must not|should not)\b.{0,24}\b(?:modify|edit|write|change|touch)\b/
        )
      );
      const proof = heading
        ? evidence(heading, headingPattern)
        : controlled?.evidence;
      return proof
        ? outcome("pass", "发现仓库或写入边界的明确规则。", { evidence: proof })
        : outcome("fail", "未找到仓库或写入边界说明。", { recommendation: "说明允许修改的仓库、模块、生成目录和外部工作区。" });
    }
  },
  {
    id: "authorization.git-remote-release",
    dimension: "boundaries",
    title: "Git 与远程副作用授权分离",
    severity: "error",
    weight: 3,
    check(inventory) {
      const control = anyOf(
        "i",
        /未经|不得|禁止|必须.*(?:授权|许可|确认)|需要.*(?:授权|许可|确认)|先.*(?:授权|许可|确认)/,
        /only.*approval|\b(?:without|unless|until)\b.{0,24}\b(?:explicit |prior |written )?(?:approval|permission|confirmation|consent|sign-off)\b|\b(?:ask|get|obtain|require)\w*.{0,16}\b(?:approval|permission|confirmation)\b|\b(?:do not|don't|never|must not|not allowed to)\b/
      );
      // "Never commit secrets" governs secret handling, not when a commit may be created.
      const local = findControlledLine(inventory, /\bcommit\b(?!.{0,40}(?:secret|token|credential|password|\.env|private key|api key))|创建.*提交|本地提交/i, control);
      const remote = findControlledLine(inventory, /\bpush\b|\bmerge\b|\btag\b|远程操作|创建.*(?:PR|MR)|部署|执行发布|\bpublish\b|\bdeploy\b|\brelease\b|(?:open|create) (?:a )?(?:PR|pull request|MR)/i, control);
      if (local && remote) {
        return outcome("pass", "规范分别约束本地提交和远程/发布类副作用。", { evidence: remote.evidence });
      }
      if (local || remote) {
        return outcome("partial", "只覆盖了部分 Git 或发布授权边界。", { recommendation: "分别说明 commit、push、merge、tag、数据库执行和发布权限。" });
      }
      return outcome("fail", "未发现 Git 与远程副作用的明确授权规则。", { recommendation: "明确哪些操作可自行执行，哪些必须获得用户授权。" });
    }
  }
];
