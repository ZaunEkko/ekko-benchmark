import fs from "node:fs";
import path from "node:path";
import { fileEvidence, outcome } from "../../core/evidence.js";
import { anyOf, findControlledLine, operationalPolicyFiles } from "./shared.js";
import type { Inventory, RuleDefinition } from "../../types.js";

const REGISTRY_CREDENTIAL = /_authToken|_auth\s*=|_password|^\s*password\s*[:=]/im;

/** Reads a tracked registry config only to classify it; unreadable or unscanned files stay suspicious. */
function registryConfigMayHoldCredentials(inventory: Inventory, trackedPath: string): boolean {
  const file = inventory.files.find((candidate) => candidate.path.toLowerCase() === trackedPath);
  if (!file || file.size > 64 * 1024) return true;
  try {
    return REGISTRY_CREDENTIAL.test(fs.readFileSync(file.absolute, "utf8"));
  } catch {
    return true;
  }
}

export const SAFETY_RULES: readonly RuleDefinition[] = [
  {
    id: "authorization.data-side-effects",
    dimension: "safety",
    title: "数据库和会改写文件的命令受控",
    severity: "warning",
    weight: 2,
    check(inventory) {
      const match = findControlledLine(
        inventory,
        anyOf(
          "i",
          /(?:执行|运行|访问|连接|写入|修改).{0,24}(?:数据库|\bSQL\b|迁移|部署)|(?:数据库|\bSQL\b|迁移|生成代码|覆盖文件|生产环境|production|部署).{0,24}(?:执行|运行|访问|连接|写入|修改|授权|确认|禁止|不得|停止|回滚)/,
          /\b(?:run|execut|apply|access|connect|writ|modify)\w*.{0,24}\b(?:databases?|DB|SQL|migrations?|deploy\w*)\b|\b(?:databases?|DB|SQL|migrations?|generated code|production|prod|deploy\w*)\b.{0,24}\b(?:run|execut|access|writ|modify|approv|confirm|never|do not|don't|stop|roll ?back)\w*/
        ),
        anyOf(
          "i",
          /未经|不得|禁止|需要.*(?:授权|许可|确认)|必须.*(?:授权|许可|确认|检查|停止)|(?:执行|运行|访问|修改)前|确认|授权|许可|只(?:能|允许)|停止|回滚|检查差异/,
          /\b(?:without|unless)\b.{0,24}\b(?:approval|permission|confirmation)\b|\b(?:ask|confirm|approv|permission)\w*|\b(?:never|do not|don't|must not|only)\b|\bstop\b|roll ?back|review the diff|check the diff/
        )
      );
      return match
        ? outcome("pass", "发现数据库、生产环境或文件改写风险的可执行约束。", { evidence: match.evidence })
        : outcome("partial", "未找到数据库或文件改写命令的授权边界。", { recommendation: "若项目包含这类操作，明确审批、检查差异和恢复要求。" });
    }
  },
  {
    id: "safety.tracked-local-files",
    dimension: "safety",
    title: "本地敏感配置未被版本控制",
    severity: "error",
    weight: 3,
    applies: (_, profile) => profile.id === "team-shared-repo",
    check(inventory) {
      if (!inventory.rootIsGit) return outcome("not_applicable", "根目录不是 Git 仓库。")
      if (!inventory.gitTrackedPathsKnown) return outcome("unknown", "Git 索引读取失败，无法检查受跟踪的本地敏感配置。")
      const risky = [...inventory.gitTrackedPaths].filter((file) => {
        const name = path.posix.basename(file);
        if (/^\.env(?:\..+)?$/i.test(name) && /\.example$|\.sample$|\.template$/i.test(name)) return false;
        // Registry configs are routinely committed for settings such as engine-strict; only credentials make them sensitive.
        if (/^\.(?:npmrc|pypirc)$/i.test(name)) return registryConfigMayHoldCredentials(inventory, file);
        return /^\.env(?:\..+)?$/i.test(name)
          || /^(?:id_rsa|id_ed25519|credentials\.json|service-account.*\.json)$/i.test(name)
          || /\.(?:pem|p12|pfx|key)$/i.test(name)
          || /(^|\/)\.claude\/settings\.local\.json$/i.test(file);
      });
      if (risky.length === 0) return outcome("pass", "未发现受 Git 跟踪的常见本地凭据或私钥文件。")
      const matched = inventory.files.find((file) => file.path.toLowerCase() === risky[0]);
      return outcome("fail", `发现 ${risky.length} 个受 Git 跟踪的本地敏感配置候选。`, {
        evidence: fileEvidence(matched, "[sensitive candidate path only]"),
        recommendation: "确认文件内容，移除真实凭据并改用示例文件或环境变量。",
        data: { files: risky }
      });
    }
  },
  {
    id: "safety.secrets",
    dimension: "safety",
    title: "敏感信息处理规则明确",
    severity: "error",
    weight: 3,
    check(inventory) {
      const match = findControlledLine(
        inventory,
        /(敏感信息|凭据|密码|\btokens?\b|secrets?|cookies?|\.env|连接串|令牌|credentials?|passwords?|api[ _-]?keys?|private keys?|connection strings?)/i,
        anyOf(
          "i",
          /不得|禁止|不要|必须|只(?:能|允许)|脱敏|环境变量|忽略|泄露|停止/,
          /\b(?:never|do not|don't|must not|should not|avoid|only)\b|\bredact\w*|\bmask\w*|environment variables?|env vars?|\.gitignore|\bleak\w*|\bstop\b/
        )
      );
      return match
        ? outcome("pass", "规范包含敏感信息或凭据的可执行处理约束。", { evidence: match.evidence })
        : outcome("fail", "未发现敏感信息处理规则。", { recommendation: "禁止输出或提交凭据，并说明本地环境配置边界。" });
    }
  },
  {
    id: "safety.destructive-operations",
    dimension: "safety",
    title: "破坏性操作有确认和恢复边界",
    severity: "warning",
    weight: 3,
    check(inventory) {
      const match = findControlledLine(
        inventory,
        anyOf(
          "i",
          /删除.{0,20}(?:文件|目录|分支|数据|记录|资源|容器|仓库)|清理.{0,20}(?:文件|目录|分支|数据|缓存|资源|容器|仓库|\.run|temp)|破坏性|reset --hard|不可逆|覆盖文件|回滚/,
          /\b(?:delet|remov|clean|wip|drop|truncat|purg)\w*.{0,20}\b(?:files?|director(?:y|ies)|folders?|branch(?:es)?|data|records?|resources?|containers?|repo(?:sitor(?:y|ies))?|databases?|tables?)\b|\bdestructive\b|\birreversible\b|force[- ]push|rm -rf|overwrit\w* files?|roll ?back/
        ),
        anyOf(
          "i",
          /不得|禁止|需要.*(?:授权|许可|确认)|必须.*(?:先|确认|授权|许可|备份|恢复|范围)|(?:删除|清理|覆盖).*(?:前|之前).*(?:确认|备份|范围)|不可逆/,
          /\b(?:ask|confirm|check with|get approval|require approval)\b|\b(?:never|do not|don't|must not)\b|\b(?:before|prior to)\b.{0,40}\b(?:confirm|back ?up|ask|scope)\w*|\birreversible\b/
        ),
        operationalPolicyFiles(inventory)
      );
      return match
        ? outcome("pass", "发现删除、覆盖或恢复相关的可执行约束。", { evidence: match.evidence })
        : outcome("partial", "未发现破坏性操作的确认与恢复规则。", { recommendation: "要求先定位目标和影响范围，再确认删除、覆盖或不可逆操作。" });
    }
  }
];
