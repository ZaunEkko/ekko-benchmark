# 软件需求协作协议规则目录

当前 `0.1.0` 包含 39 条确定性规则。它们只评价软件工程工作区是否能让 Coding Agent 从人的自然语言开发需求自动进入工程上下文恢复、澄清、需求与设计沉淀、代码实施、验证和状态同步。

扫描器只读取本地软件工作区快照、Git 索引和显式配置，不访问网络、不执行被测项目命令、不调用模型，也不要求真实跑一次开发任务。仅有目录或文档标题不是完整证据；入口还必须说明这些工件何时读取、创建或更新，以及它们如何支持代码变更与验证。

协作文档可以用中文或英文书写。每条规则在 `src/static/rules/` 中并列维护中文与英文表达，同义写法应得到相同判定；`test/language-parity.test.ts` 用逐句对译的协议样本校验两种语言的逐条结果一致。报告输出语言仍为中文。

| 规则 ID | 维度 | 核心判断 |
| --- | --- | --- |
| `discoverability.root-entrypoint` | 需求接入 | 根目录是否存在受支持的 Agent 入口 |
| `discoverability.entrypoint-content` | 需求接入 | 入口是否包含非占位的可执行说明 |
| `intake.start-procedure` | 需求接入 | 是否规定接到需求后的默认启动动作 |
| `intake.clarification-policy` | 需求接入 | 不确定项是否询问人而非静默猜测 |
| `discoverability.entrypoint-versioned` | 上下文路由 | 共享仓库入口是否已被 Git 跟踪 |
| `discoverability.multi-tool-consistency` | 上下文路由 | 多个工具入口是否采用统一事实源 |
| `scoping.layered-loading` | 上下文路由 | 长规范是否支持链接或子入口分层加载 |
| `context.capability-navigation` | 上下文路由 | 根入口是否导航状态、约束、需求、计划、决策和验证事实 |
| `context.task-aware-loading` | 上下文路由 | 是否按顺序或任务类型加载适用上下文 |
| `accuracy.local-links` | 上下文路由 | 已加载治理文档中的本地链接是否存在 |
| `context.instruction-size` | 上下文路由 | 单个入口是否控制在 32 KiB 内 |
| `context.duplicate-entrypoints` | 上下文路由 | 多个工具入口是否重复维护长事实 |
| `requirements.artifact-contract` | 需求沉淀 | 需求事实是否具有创建、内容和更新契约 |
| `requirements.plan-traceability` | 需求沉淀 | 需求事实与实施计划是否可追踪关联 |
| `requirements.acceptance-contract` | 需求沉淀 | 是否规定验收标准或验收用例的落点 |
| `decisions.role-separation` | 澄清与决策 | 长期约束、需求、计划、决策和状态职责是否分离 |
| `decisions.human-confirmed-persistence` | 澄清与决策 | 关键取舍是否经人确认后持久化 |
| `decisions.evolution-history` | 澄清与决策 | 决策变化是否保留状态和历史 |
| `scoping.module-guidance` | 实施指引 | 是否说明规则适用的目录或模块，或给出至少两条目录与职责的对应；只提到目录为 `partial` |
| `accuracy.manifest-validity` | 实施指引 | `package.json` 是否可以解析 |
| `accuracy.runtime-version` | 实施指引 | 工程是否提供运行时或工具链版本依据 |
| `execution.child-instructions` | 实施指引 | 进入子仓库前是否加载局部 Agent 规则 |
| `execution.plan-impact` | 实施指引 | 实施计划是否承载方案和影响范围 |
| `accuracy.documented-commands` | 验证闭环 | 文档引用的 `npm run` 脚本是否存在 |
| `boundaries.repository-shape` | 边界 | Git 结构是否符合所选协作画像 |
| `boundaries.documented` | 边界 | 是否明确仓库和写入边界 |
| `authorization.git-remote-release` | 授权 | 是否分别约束本地提交与远程/发布操作 |
| `authorization.data-side-effects` | 授权 | 数据库、生产或文件改写操作是否受控 |
| `verification.commands` | 验证闭环 | 是否提供与工程清单匹配的验证命令 |
| `verification.module-coverage` | 验证闭环 | 可运行模块是否具有 test/lint/check 入口 |
| `verification.acceptance-loop` | 验证闭环 | 是否要求实现后验证并记录结论 |
| `automation.commands-resolve` | 验证闭环 | 已存在的 CI/hook 引用是否能解析 |
| `synchronization.status-source` | 状态同步 | 是否区分任务状态与长期规范/决策 |
| `synchronization.resume-path` | 状态同步 | 是否提供新会话恢复路径 |
| `synchronization.resume-context` | 状态同步 | 接续上下文是否覆盖进度、阻塞、验证和下一步 |
| `synchronization.completion-sync` | 状态同步 | 实现和确认变化是否同步回长期文档 |
| `safety.tracked-local-files` | 安全 | Git 是否跟踪常见本地凭据或私钥文件 |
| `safety.secrets` | 安全 | 是否存在可执行的敏感信息处理约束 |
| `safety.destructive-operations` | 安全 | 删除、覆盖等操作是否要求确认和恢复 |

CI 不是软件需求协作协议的必要条件，缺少 CI 不扣分。如果工作区已经存在 CI 或 hook，扫描器只检查其中引用的本地命令是否明显失效。

## 核心链路诊断

规则权重负责计算维度完备度。以下规则同时被标记为核心软件交付能力：需求启动与澄清、六类上下文导航、需求工件生命周期、需求与计划关联、验收契约、人工确认决策、实施影响、验证命令与结果记录、新会话恢复、完成后同步、仓库边界、Git/发布授权、凭据处理和破坏性操作。

核心状态只用于把主流程风险从普通问题中提出来：全部通过为 `clear`，存在非失败缺口为 `limited`，任一失败为 `blocked`。它不改变 `score` 或等级；相关规则的 `pass/partial/fail` 已经通过规则权重计分，不能再扣一次。完整规则 ID 和计算公式见 [评分模型](scoring-model.md#23-核心软件交付诊断)，机器目录的 `core` 字段会标出这些规则。

## 证据原则

- 规则对象和控制动作必须在同一规范语句中成立，不能把不同位置的关键词拼成结论；
- 工件存在或名称命中只提供弱证据，职责、触发条件、导航关系和完成后的同步规则才构成闭环；
- 工件名称和目录布局不受规定；不同体系表达等价能力时应获得等价结论；
- 每条能力必须服务于软件需求理解、代码实施、工程验证或交付边界，不评价非软件工程工作流；
- 上下文导航必须覆盖状态、长期约束、需求事实、实施计划、确认决策和验证记录六类事实，缺少任一类不能拿满分；
- 历史任务中出现过验证结果不等于建立了通用验证协议，必须明确要求后续实现记录通过、失败和未检查范围；
- “存在待确认项”和“人的确认可写入决策”不能拼成主动澄清，完整通过必须直接要求遇到影响结果的不确定项时询问人；
- 当前没有进行中任务时，明确的空闲状态或空的当前任务索引可作为接续证据；仅描述状态流程、但没有当前状态记录不能通过；
- 安全和授权只接受规范事实源作证，历史状态记录与业务状态机不能替代操作规则；
- 疑似敏感文件只报告路径，不读取或输出其值；
- 根入口明确禁止列举、搜索或读取的相对目录会在扫描前排除，并明确列为未检查范围；仅禁止写入不会阻止只读扫描；
- `not_applicable`、`unknown` 和 `waived` 不参与分母，但含义分别保留；
- 带有 TODO、TBD、待补充等标记的内容进入人工复核，不直接扣确定性分。

机器可读目录由 `npx @zaunekko/benchmark rules --format json` 输出，并以运行时代码为准。
