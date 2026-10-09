<div align="center">

# Ekko Benchmark

**给软件项目做一次 AI 协作体检。**

看看 Coding Agent 接到一句自然语言需求后，是能一路交付，还是中途开始兼职读心术。

[![CI](https://img.shields.io/github/actions/workflow/status/ZaunEkko/ekko-benchmark/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/ZaunEkko/ekko-benchmark/actions/workflows/ci.yml)
![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Runtime dependencies](https://img.shields.io/badge/runtime_dependencies-0-16A34A?style=flat-square)
[![MIT License](https://img.shields.io/badge/license-MIT-111827?style=flat-square)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-D97757?style=flat-square&logo=anthropic&logoColor=white)](https://github.com/ZaunEkko/claude-plugins/tree/main/plugins/ekko-collab-protocol)

[快速开始](#快速开始) · [评分内容](#它在评什么) · [Agent 模式](#agent-模式) · [Claude Code 插件](#claude-code-插件) · [评分模型](#评分模型) · [项目文档](#项目文档)

</div>

```powershell
npx @zaunekko/benchmark
```

一行命令，只读扫描当前软件项目，给出协作分、等级、九个维度、证据位置和改进建议。扫描过程离线、确定，不运行被测项目，也不调用外部 AI。

> 用 Claude Code？装上 [`ekko-collab-protocol`](#claude-code-插件) 插件，一个命令就能初始化协作文件、打分和按优先级优化。

## 先看结果

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ EKKO BENCHMARK · 软件工程 AI 协作体检                                      │
│ 协作分: 90.5 / 100    等级: A    ██████████████████░░                      │
│ 核心诊断: limited (4 项；不影响评分)                                       │
│ 结果: ✓ 通过 30   △ 部分 4   ✕ 失败 0   ? 未知 0   ◇ 豁免 0                │
└────────────────────────────────────────────────────────────────────────────┘

Ekko 直评
----------
短评  这套协作规矩很能打，剩下的是拧紧几颗螺丝。

维度总览
┌──────────────────┬────────┬──────┬─────────┬──────────────┐
│ 维度             │   分数 │ 权重 │  规则   │ 完备度       │
├──────────────────┼────────┼──────┼─────────┼──────────────┤
│ 需求接入         │   86.4 │   10 │   4/4   │ ██████████░░ │
│ 上下文路由       │  100.0 │   12 │   5/8   │ ████████████ │
│ ...              │    ... │  ... │   ...   │ ...          │
└──────────────────┴────────┴──────┴─────────┴──────────────┘
```

终端默认优先展示结论和待处理项；完整逐项结果可以输出为 Markdown 或 JSON。上面是校准样本的节选，不是预设目标分。

## 它在评什么

Ekko Benchmark 评价的是**软件工程中的 Coding Agent 协作准备度**：项目有没有把一条自然语言需求交给 Agent 后所需的路径讲清楚。

```text
需求进入
  → 恢复工程上下文
  → 澄清真正不确定的取舍
  → 沉淀需求、计划与决策
  → 修改代码
  → 构建、测试与验收
  → 记录结果并留下可接续状态
```

| 维度 | 核心问题 |
| --- | --- |
| 需求接入 | Agent 是否知道需求从哪里进入、何时要问人？ |
| 上下文路由 | 是否能找到工程状态、约束和适用说明？ |
| 需求沉淀 | 需求、范围、验收标准和实施计划是否可追踪？ |
| 澄清与决策沉淀 | 不确定项和已确认取舍是否会留下记录？ |
| 实施指引 | Agent 是否知道如何改代码、遵循哪些工程约束？ |
| 验证闭环 | 是否要求执行适用验证并记录结果与未检查范围？ |
| 状态同步与接续 | 新会话能否恢复进度、阻塞和下一步？ |
| 仓库与写入边界 | 多仓、生成物和禁止写入范围是否明确？ |
| 安全与授权 | 凭据、副作用和发布类操作是否有清楚边界？ |

它评的是能力，不是模板。`Spec/Design/ADR/HANDOFF`、OpenSpec 的 `proposal/design/tasks`，或团队自己的 `brief/approach/decision-log/current-work` 都可以表达同一组能力；文件名和文档数量本身不加分。

协作文档用中文或英文写都可以：同一套约定无论用哪种语言表达，都会得到相同的逐条判定。报告本身以中文输出。

## 三种模式

| 模式 | 命令 | 回答的问题 |
| --- | --- | --- |
| 静态扫描 | `npx @zaunekko/benchmark` | 当前项目写出了多完整的 AI 协作协议？ |
| Agent 语义复核 | `npx @zaunekko/benchmark agent` | 在场的 Agent 结合项目语义后，会如何独立重评？ |
| 工作流试验 | `npx @zaunekko/benchmark workflow score <experiment.json>` | 已有受控 A/B 软件任务试验的真实效果如何？ |

三者不会混在一起。静态高分不代表代码质量高，也不代表某个模型面对真实任务一定成功；真实工作流结果也不会偷偷改写静态基线。

## 快速开始

要求 [Node.js](https://nodejs.org/) 22 或更高版本。

```powershell
# 扫描当前目录
npx @zaunekko/benchmark

# 扫描其他软件项目
npx @zaunekko/benchmark D:\path\to\repo

# 生成 Markdown 报告
npx @zaunekko/benchmark D:\path\to\repo `
  --profile team-shared-repo `
  --format markdown `
  --output .\reports\repo.md

# 查看全部规则与可用画像
npx @zaunekko/benchmark rules
npx @zaunekko/benchmark profiles
```

`npx` 运行结束后进程就退出，Ekko Benchmark 不是常驻服务，不需要卸载。npm 可能保留下载缓存，但不会因此把包写进当前项目的 `dependencies`。

CLI 退出码：`0` 表示成功，`1` 表示分数门禁未通过，`2` 表示输入错误，`3` 表示内部错误。

## Agent 模式

当用户已经在 Codex、Claude Code 等 Coding Agent 会话中时，直接运行：

```powershell
npx @zaunekko/benchmark agent
```

`agent` 默认复核当前目录，不需要在末尾加 `.`。需要检查其他工作区时仍可传入路径：

```powershell
npx @zaunekko/benchmark agent D:\path\to\repo
```

CLI 不会另外调用模型，而是把静态基线、九个维度、全部规则、证据、权重、公式和回答契约交给**当前已经在场的 Agent**。Agent 再语义阅读项目并全量重评，可以纠正静态规则的误报或漏报，也可以把静态通过项降分。

输出必须同时保留：

- `静态协议分`：离线、确定、可复现；
- `Agent 语义分`：有证据定位的独立语义判断；
- 未读取范围、工具限制和模型信息。

Agent 语义分仍然不是一次真实开发任务的成功率。

评分定稿后，Agent 会进入改进阶段：按客观错误、核心缺口、一般缺口排序给出改进建议和预计涨分。扫描器没认出的写法只作为规则反馈，不会建议你为迎合规则改写文档；授权边界这类团队约定只起草、由你决定；未经你同意不会修改文件，改完会同时报告改前改后两个分数。静态报告也会直接列出「最值得先改」。

## Claude Code 插件

不想自己串起扫描、复核和修改？[`ekko-collab-protocol`](https://github.com/ZaunEkko/claude-plugins/tree/main/plugins/ekko-collab-protocol) 把 Ekko Benchmark 装进 Claude Code，引擎随插件离线分发，不需要另装 npm 包：

```text
/plugin marketplace add ZaunEkko/claude-plugins
/plugin install ekko-collab-protocol@zaunekko
/reload-plugins
```

| 命令 | 作用 |
| --- | --- |
| `/ekko-collab-protocol:init` | 识别项目结构，只就团队约定提问，生成 `AGENTS.md`、当前状态、需求记录与 ADR 约定；生成结果在本基准上通过全部适用规则，并且从不覆盖已有文件 |
| `/ekko-collab-protocol:score` | 只读地给出静态协议分与 Agent 语义分，附逐条证据 |
| `/ekko-collab-protocol:optimize` | 按客观错误、核心缺口、一般缺口排序，只修改你选中的条目，并报告改前改后分数 |

中文和英文项目都适用，还没开始写代码、只有协作文档的项目也能直接初始化。更多插件见 [ZaunEkko/claude-plugins](https://github.com/ZaunEkko/claude-plugins) 插件市场。

## 评分模型

报告只计算一个加权 `score`。各规则先汇总为九个维度分，再按当前协作画像的维度权重合成总分。

| 等级 | 分数 | 含义 |
| :---: | ---: | --- |
| **S** | 95-100 | 协作协议非常完整，主链路和边界都经得起新会话接手 |
| **A** | 90-94.9 | 主流程清楚，仅有少量局部缺口 |
| **B** | 80-89.9 | 可以稳定开工，但部分环节仍依赖经验补全 |
| **C** | 70-79.9 | 基础可用，关键链路存在明显断点 |
| **D** | 55-69.9 | Agent 经常需要猜测或反复询问 |
| **E** | 35-54.9 | 只有零散约定，难以形成闭环 |
| **F** | 0-34.9 | 缺少可执行的协作入口和交付协议 |

等级只由分数区间决定，不参与计算。核心软件交付规则另显示为 `clear`、`limited` 或 `blocked`，用于定位主链路问题，但不会封顶、乘系数或二次扣分。

`unknown`、`not_applicable` 和理由完整的 `waived` 不进入分母；确定性发现与人工复核项始终分开报告。完整公式见 [评分模型](docs/scoring-model.md)。

## 画像与配置

| 画像 | 适用场景 |
| --- | --- |
| `personal-local-multirepo` | 个人本地协调多个软件仓库，强调跨仓路由和接续 |
| `team-shared-repo` | 多人、多 Agent 共享 Git 仓库，强调版本化入口和交付边界 |

零配置是默认路径。确实需要固定画像、分数门禁或设计例外时，在项目根目录增加 `.ekko-benchmark.json`：

```json
{
  "profile": "team-shared-repo",
  "minScore": 70,
  "waivers": [
    {
      "rule": "requirements.acceptance-contract",
      "reason": "验收标准由外部需求系统维护，并可从根入口访问"
    }
  ]
}
```

Waiver 必须给出具体原因，并在报告中保持可见；它只豁免未通过的规则，规则已通过或不适用时不会生效，报告会提示移除。命令行参数优先于配置文件；完整示例见 [配置示例](examples/ekko-benchmark.config.example.json)。

## 报告与边界

每份报告都包含扫描器版本、画像、总分、维度分、逐项状态、脱敏证据、修复建议、覆盖率、截断情况和未检查范围。

默认扫描坚持以下边界：

- 只读、离线、确定，不执行被测项目中的构建、测试、迁移或发布命令；
- 不跟随符号链接，不读取 `.git`、依赖目录、常见构建产物和 `temp/`；
- 遵守根入口明确声明的目录读取禁令，并把排除项写入未检查范围；
- 不 clone 远程仓库，不要求真实运行一次 AI 开发任务；
- 不输出疑似凭据原文，不把框架、代码规模或 CI 的存在直接换算成分数；
- 只评价软件工程协作，不覆盖小说、视频、研究、设计或通用办公工作流。

## 本地开发

项目使用 TypeScript 严格模式，要求 Node.js 22+；发布后的 CLI 没有第三方运行时依赖。

```powershell
npm ci
npm run validate
npm run benchmark -- scan D:\path\to\workspace -- --profile team-shared-repo
```

规则变更必须补充画像差异、`not_applicable` 分母和证据定位测试。贡献前请阅读 [贡献指南](CONTRIBUTING.md)。

## 项目文档

- [评分模型](docs/scoring-model.md)：维度、权重、等级和计分公式
- [静态规则目录](docs/rules.md)：每条规则的适用性、证据和限制
- [设计决策](docs/adr/)：静态与真实效果分离、能力而非模板等关键取舍
- [校准记录](docs/calibration/2026-09-03-two-samples.md)：样本、版本和未检查范围
- [路线图](docs/roadmap.md)：当前完成度、发布门槛和后续计划
- [安全策略](SECURITY.md)：漏洞报告与敏感信息边界

## License

[MIT](LICENSE) © 2026 ZaunEkko
