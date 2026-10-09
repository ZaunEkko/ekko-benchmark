# 贡献指南

## 开始前

阅读 `AGENTS.md`、`docs/scoring-model.md`、`docs/rules.md` 和 `docs/roadmap.md`。本项目只评价软件工程中的 Coding Agent 协作；规则变更必须能映射到自然语言软件需求、代码实施或软件交付边界，并说明适用画像、确定性证据、可能误报和不适用条件。

## 本地验证

```powershell
npm run validate
npm run benchmark
npm run benchmark -- scan D:\path\to\workspace -- --profile team-shared-repo
```

PowerShell 下的 `npm.ps1` 会吞掉第一个 `--`，第二个 `--` 用于避免 npm 把 `--profile` 解析成自身配置；CLI 会忽略单独的 `--`，所以 bash 下同一写法也可运行。发布后的 `npx @zaunekko/benchmark scan ... --profile ...` 不需要这个额外分隔符。

提交规则变更时至少提供一个正例和一个反例测试。修复误报时应保留导致误报的最小文本，避免只针对某个仓库名称打补丁。

规则按维度维护在 `src/static/rules/<dimension>.ts`，报告顺序由 `src/static/rules.ts` 的 `RULE_ORDER` 固定。新增或修改匹配表达时，用 `anyOf()` 同时给出中文与英文写法，并同步更新 `test/language-parity.test.ts` 的对译样本；扩展已有中文表达时只能增加分支，不要改窄原有写法。

## 设计要求

- 静态扫描路径必须离线、只读、确定且不跟随符号链接；
- 不执行被测项目中的命令；
- 不输出疑似凭据原文；
- 不用静态分数声称代码质量、模型能力或真实软件任务效果；
- 不加入只服务于非软件工程工作流的领域规则；
- 不把特定语言、框架或工件目录当成软件协作能力本身；
- 新增报告字段时保持 `schemaVersion` 兼容，破坏性变更必须提升 schema 主版本。
