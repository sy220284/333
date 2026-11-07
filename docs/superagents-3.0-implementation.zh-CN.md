# Super Agents 3.0 实施文档与验收门禁

> 对应方案：docs/superagents-3.0-product-architecture.zh-CN.md
> 目标分支：PR19；2026-11-07 启动。本文的“完成”只按具体提交 SHA 的真实验收证据判定。

## 一、先固化共享契约，再扩展体验

执行原则：保持现有 SDK/Tool/权限的唯一执行链；新服务提供发现、调度、记忆及 UI 投影。保留当前 Mission Job 与 Git Worktree 的状态真值；后续统一 SQLite 索引以事务投影为主，经过旧数据兼容测试后方迁移权威写入。新增能力使用明确授权，不创建未被请求的周期任务、隐藏 Agent 或云存储。

## 二、工程依赖和落地顺序

| 交付 | 入口与工作范围 | 最低功能验收 | 主要风险 |
| --- | --- | --- | --- |
| A 能力目录 | src/services/agentCenter/capabilityCatalog.ts、desktop protocol/gateway/UI | 真实列出当前 MCP、Skill、Plugin/Workflow；来源/启用状态可信；不同项目不串档 | 装了不等于可运行 |
| B 经验记忆 | src/services/agentCenter/experienceMemory.ts | 候选→证据核验→批准→按适用范围召回；不保存流水账；跨会话持久 | 无证据或过期知识污染 |
| C 持久身份 | Agent Registry、Team/SDK Session 关联 | 角色会话关闭后身份保留、恢复时装载正确记忆 | 角色/会话混淆 |
| D 消息总线 | Event Hub、Team Mailbox 投影 | 端到端投递/接收/认领/完成；重放去重；跨团队路由 | 交接丢失或重复执行 |
| E 总控监督 | Coordinator、Mission、Job、事件源 | 项目目标→动态分工→纠偏→审核，保留日志与证据 | 无限制任务增殖 |
| F 自创能力 | Capability Builder/Validator/Runtime | Skill/MCP/Plugin 自动生成、隔离测试、审核发布、版本升级回滚 | 执行器越权、依赖污染 |
| G UI | 群聊主屏、能力中心、成果看板 | 任一工具动态出现在 UI；参数校验、运行状态和预览可用 | 只是显示、实际不可调用 |
| H 多模态成果 | Artifact Hub/Viewer | 视频、音频、文本、图像、文档、代码均可展示/核验/导出 | 产物丢失和误报完成 |
| I 主动事件 | Repo/files/任务事件适配器 | 显式订阅后增量监测，暂停/恢复可追踪 | 越过授权主动修改 |
| J 最终回归 | CI + 安装版 + 实网样例 | Windows/macOS/Linux、真实 SDK/权限、两种模式和五类任务通过 | 模拟测试假阳性 |

### 已落地能力的改造位置

- 运行核心：src/tools.ts、src/Tool.ts、src/tools/SkillTool/、src/tools/WorkflowTool/。
- Skills & Plugins：src/commands.ts、src/utils/plugins/pluginLoader.ts、src/utils/plugins/mcpPluginIntegration.ts。
- MCP：src/services/mcp/config.ts。
- 长期任务：src/utils/agentMissions.ts、src/services/agentCenter/missionJobs.ts。
- 团队：src/tools/TeamCreateTool/、src/tools/SendMessageTool/、src/utils/teammateMailbox.ts。
- 桌面后端：src/services/desktop/protocol.ts、gateway.ts。
- 桌面 UI：desktop/src/App.tsx、desktop/src/components/ 与 theme/。

## 三、能力契约与 UI

### 统一目录读取

Request：capabilities.list（无副作用），输出 items（id/name/kind/source/scope/description/status），warnings（来源加载异常）。

目录是视图，不接管执行：技能由 getCommands() / SkillTool 调用，MCP 由原生配置与工具池调用，插件由 Plugin Loader 解析，工作流由 WorkflowTool 调用。status=available 指发现能力，status=disabled 表示配置已禁用，status=unverified 表示尚无真实调用证明。

接下来实现：
- capabilities.get、capabilities.previewInstall、capabilities.install、capabilities.toggle、capabilities.version、capabilities.rollback；
- 所有安装操作有差异预览、哈希、路径/依赖/权限清单、签名或可信来源规则；
- 运行中的任务固定能力版本，发布新版本只影响新任务；
- Schema 驱动表单、错误、状态及多模态输出预览；自定义 UI 隔离于 Electron 主进程。

### AI 自创插件生命周期

Candidate(草稿) → Built(构建) → Tested(测试) → PendingApproval(待批准) → Enabled(启用) → Superseded/Disabled(升级/禁用)。
每一次状态变化附带 artifact hash、测试结果、工具版本和用户/策略授权事实。

优先生成原生可加载的 SKILL.md、Workflow 脚本或 MCP Server；需要打包多模块时使用现有 .claude-plugin/plugin.json 格式。生成行为必须经过独立的 Capability Builder 任务与真实测试；AI 只是作者，不得自行声明“已验证”或提升权限。

## 四、经验记忆的具体规则（强制）

**目标：记住做事的规则与方法，不记录每天做过什么。**

经验不是日志摘要。每条 Experience 至少包含：
key（语义去重）、title、scenario、principle、procedure、applicability、invalidWhen、verification、evidenceRefs、tags、revision、status。

规则：
1. 捕捉候选时必须从成功/失败的实际任务产出提炼规范和步骤。
2. 候选条目必须写出“何时可用”和“何时不适用”，禁止空泛建议。
3. evidenceRefs 使用真实测试/文件/提交/成果标识，不能由模型自报验证通过。
4. 仅 approved 状态参与主动召回；pending/retired 不参与。
5. 同 key 重复提议应返回已有条目或新修订候选，不能制造流水账。
6. 来源变化或版本升级时进入 recheck/retired，证据冲突时保留审计信息并要求复核。
7. 当某一模式被多次成功验证，优先生成 Skill/Workflow/工具单测，形成比纯记忆更强的可执行资产。
8. 每次召回只选当前任务相关、版本适用且有证据的少量条目，避免上下文污染。

**条目示例：**

标题：视频剪辑中变帧率字幕对齐规范
场景：输入素材为可变帧率，已生成字幕且将被重定时。
原则：对齐以统一时间基准为准，防止帧号与时间戳直接混用。
复用步骤：检查时间基准→规范化素材时基→重映射字幕→核查首中尾三段→导出 QA 报告。
不适用：素材本来为恒定帧率且字幕已基于最终时间轴。
验证：三段样本与导出视频时间戳核对；证据为实际测试及修订文件。
反例：仅修改首帧时间偏移造成后段逐渐漂移。

## 五、可验证的端到端场景

### A：能力目录
项目里配置一个 MCP 服务器、一个本地 SKILL.md 和一个插件：读取 capabilities.list，核对 UI 和 CLI 来源一致；禁用 MCP 后 status 正确变化；无私钥泄漏。

### B：经验提炼
在项目 X 提出经验候选：缺少场景/步骤/证据时拒绝；候选不会被检索成“已验证规范”；审核后可跨会话匹配；禁用/撤销后不再召回；项目 Y 访问被拒绝。

### C：动态团队交接
开发成员改变接口后发依赖事件，UI 成员确认并重新生成工作项，测试成员获得对应验收项；重启后投递不会丢失和重复处理。

### D：自创扩展
任务缺少字幕工具→自动构建 MCP→隔离测试→待授权→发布→能力目录刷新→UI 自动展示参数→执行真正的视频样本→失败版本回滚。

### E：多领域贯通
文案→设计→素材→视频剪辑→字幕→审核→导出；调研→来源核验→可编辑报告；开发→PR→CI→UI 适配→测试。每个结果都要打开验证、记录版本和来源。

### F：长任务
暂停、进程关闭、模型限额、工具权限拒绝、任务超预算、工作树被删除；均具有明确可恢复状态，不重复外部操作。

## 六、验收证据表

每个交付都登记：
feature、source path、test command、CI workflow/run URL、commit SHA、平台、测试通过数/失败数、实网/模拟属性、最终状态、后续未完成项。

测试要点：
- 单测：Schema、过滤、去重、写入锁、状态迁移、版本范围、路径安全。
- 桌面协议：成功/错误调用、会话分离、刷新、请求/回复匹配。
- UI：真实数据驱动、参数表单、权限回传、加载失败、交互。
- 安装版：Linux Xvfb + Windows/macOS 原生启动与控制；真实模型按用户授权运行。
- 失败恢复：进程崩溃、超限、已发生外部副作用、插件冲突。

**本次实施记录**：方案已归档；第一批目标是 A + B 的基础服务和真实目录视图。其余事项保持可测的交付清单，任何一项没有代码与测试证据都标记为待实施，不以文档作为功能完成证明。


## 七、2026-11-07 开发记录（仅列已经提交的真实代码）

> 当前实施范围：原型第一批基础设施，不等于 3.0 全部功能完成。验收基准为各项最新 SHA 及 Actions 原始记录。

| 模块 | 已提交路径 | 本轮完成的实际能力 | 当前验收边界 |
| --- | --- | --- | --- |
| 方案 | docs/superagents-3.0-product-architecture.zh-CN.md | 通用任务、动态团队、统一能力、自创扩展、知识规范及 UI 的完整目标与架构 | 设计文件已落库 |
| 经验规范 | src/services/agentCenter/experienceMemory.ts | 持久候选→人工核验→批准→按场景召回→废弃；内容包含规范、步骤、适用与失效条件、证据引用，跨项目隔离 | 不把原始任务日志当长期经验；证据内容最终由人工审核 |
| AI 使用经验 | src/tools/ExperienceTool/ExperienceTool.ts | 两种智能体模式均可检索已批准规范，或主动提交待审核经验候选；模型无审批接口 | 自动从任意 Job 归纳和复核的流水线仍待实施 |
| 能力目录 | src/services/agentCenter/capabilityCatalog.ts | 统一发现原生 Tool、Skills、Plugin、Workflow 与 MCP 配置，投影状态和来源 | 目录只读；完整插件自动安装和可执行健康检查仍待实施 |
| 自创技能候选 | src/services/agentCenter/skillWorkshop.ts | 创建候选 SKILL.md、浏览、独立授权发布到原生项目技能目录、刷新缓存，保护既有文件和软链接路径 | AI 自动完成完整工具测试、插件打包、升级及回滚仍待实施 |
| 团队交接 | src/services/agentCenter/teamHandoffs.ts | 结构化项目交接、稳定消息编号、幂等投递、本地持久状态、认领/产物/验收状态机与跨项目隔离 | 当前桌面接线可创建、查看、重试；成员自动确认与总控跨团队调度仍需接线 |
| 桌面接口 | src/services/desktop/protocol.ts / gateway.ts；desktop/electron/main.ts | 能力查询和刷新、经验候选、人工审核、技能候选与发布、任务交接；所有入口过白名单 | 仍需最新提交的真实安装版验证 |
| 桌面 UI | desktop/src/App.tsx | 能力中心、经验规范及审核、技能候选发布与版本展示基础、团队交接状态区 | Grok Bot 式群聊主视图、专业多模态预览、动态表单尚未完成 |

### 测试文件和验收

- tests/experience-memory.test.ts：经验验证字段、幂等、候选审核、失效/项目隔离。
- tests/experience-tool.test.ts：模型只能提议候选，不能自行批准。
- tests/capability-catalog.test.ts：能力来源去重、冲突检测。
- tests/skill-workshop.test.ts：候选、发布、保护现有文件、路径越界防护。
- tests/superagents-capability-protocol.test.ts：原生桌面调用完整路径、技能注册/刷新、经验审核状态。
- tests/team-handoffs.test.ts：投递失败重试、同号去重、状态顺序、交付和审核。
- desktop/src/App.test.tsx：更新能力中心真实导航选择器；保留既有 UI 全量回归。
- package.json 与 .github/workflows/desktop-communication.yml：新测试进入已有 Bun 核心和桌面 CI。
- 按需调度限制要求全部测试通过统一入口，因此移除了另建的重复 CI 工作流，避免 CI 规则出现第二套不一致逻辑。

**已获得的真实验证：** GitHub Actions 运行 42380715065，在 SHA ff49825df5eb6bceb90360272a7bcd9ccc104f9b 的既有基础版本上：4 个 Bun 文件 12/12，通过；Electron 接口契约 10/10，通过；React UI 49/49，通过；桌面类型检查、生产构建通过。该验证早于新增交接、模型记忆工具及后续路径安全完善，不能用它冒称最新 SHA 的全部回归已通过。

**需要继续独立核对：** 最新 SHA 的 6 个 Bun 新增文件、桌面通信、React 安装版及原有全仓类型门禁。原有权限迁移相关的五条 TypeScript 诊断属于另一个门禁整改范围；按提交差异明确归因，最终合并前仍须解决。此次不启用定时监控、外部云服务或自动派生子智能体。

### 后续设计不能丢失的完整目标

- 长期 Agent 身份与按任务动态角色调配；
- 项目总控可主动监测已授权事件、发现缺口、协调跨团队依赖、纠偏并独立复核；
- 从能力缺口到自建 MCP Tool、Skill、Plugin、Workflow、受限测试、审核、动态 UI 配置、升级与回滚的完整生命周期；
- 群聊式桌面主界面与可折叠任务/成果侧栏；
- 通用文案、视频、设计、研究、代码产物与编辑/预览/导出闭环；
- 长期记忆从候选提炼为可验证规范，关联可靠证据与失效规则，能跨会话和授权项目复用。

实施仍以本文件第一至六节确定的完整验收表为准；上述任一欠缺未取得真实证据前状态均为“待实施/待验收”。
