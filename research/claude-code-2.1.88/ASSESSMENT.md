# 源码映射研究：与 333 主线的可用性核查

## 结论

**全量提取已完成，研究数据可直接用于定位源码和定位功能恢复线索。** 现有 333 主线已经恢复源码映射的 1,902 个业务源码文件、4 个原生适配文件，构建期还可从固定的 `cli.js.map` 中恢复 2,850 个依赖模块。此次将依赖的原始内容直接永久收录在 `research/`，并创建精确索引与全部 2,068,722 条可检索位置记录。

研究目录本身是**静态资料**，不会改变生产 CLI 的功能开关或安全权限。请区分“原文可用”“已纳入编译”“真实功能通过端到端测试”三个等级。

## 1. 当前已经能用、无需再恢复的材料或实现

| 项目 | 实际情况 | 结论 |
|---|---|---|
| 2,850 份冻结依赖源码 | 本次永久保存原文；现有 `build/restore-dependencies.mjs` 能从映射重建依赖快照 | **直接可用于查阅、逐行对照和新编译器解析** |
| 10,951,046 字符 VLQ 映射 | 原文完整保存，另生成 2,068,722 行解码位置 | **可用于定位打包代码的原始文件、行、列** |
| 90 种开关、972 处调用 | 有全量源码路径和精确行列索引 | **可直接筛选模块开关及其所有调用点** |
| 469 个环境变量、1,452 处点式调用 | 有变量名、位置及上下文；另保存 16 处括号式引用 | **可直接进行配置分析、安全审计及模式排查** |
| `TRANSCRIPT_CLASSIFIER` | 主线 `build/rebuild.mjs` 明确传入编译 features | **已编译；该开关的专属业务行为仍需专项验收** |
| `KAIROS_BRIEF` | 主线明确传入编译 features | **已编译；主动工作相关完整链路仍需专项验收** |
| `BUILDING_CLAUDE_APPS` | 主线明确传入编译 features；26 份原始技能文档已恢复、校验并测试进入新产物 | **已编译，文档入包已实测通过** |
| 标准 CLI 本地工具 | Read、Edit、Write、Glob、Grep 在三平台通过模拟模型调用链差分验收 | **已通过现有场景，不能代替全部权限、MCP 与原生功能验收** |

在当前 Bun 构建参数中，90 个映射开关里**明确传入 3 个，其余 87 个没有传入编译器**。后者即使具有源码，也不会因此自动开放功能。每个开关的完整路径和状态见 `features/feature-index.json`。

## 2. 源码存在，可以优先逐项尝试恢复的能力

这些功能有明确源码入口和引用位置，具备立刻开展**代码级评估**的条件；尚未满足“启用即可正常使用”的证明标准：

| 开关/能力 | 出现次数 | 核心用途及下一步必要核验 |
|---|---:|---|
| `ULTRAPLAN` | 10 | 深度规划，核对命令/提示词/执行入口与权限 |
| `EXPERIMENTAL_SKILL_SEARCH` | 21 | 技能发现与搜索，检查索引生成、命令入口及搜索结果 |
| `MCP_SKILLS` | 9 | MCP 技能整合，实测本地 MCP 服务和协议交互 |
| `TEMPLATES` | 6 | 模板能力，核实模板数据与选择流程 |
| `BASH_CLASSIFIER` | 49 | Bash 命令分类，核对权限判定和执行语义 |
| `TOKEN_BUDGET` | 9 | 上下文和预算限制，需完整 token 流程测试 |
| `COMMIT_ATTRIBUTION` | 12 | 代码提交归因，需检查 Git 工作流一致性 |
| `PROMPT_CACHE_BREAK_DETECTION` | 9 | Prompt 缓存异常识别，需模拟多轮请求 |
| `QUICK_SEARCH` | 5 | 快速搜索，需查索引和原生搜索程序路径 |
| `FORK_SUBAGENT` | 5 | 派生任务能力，需测试任务权限、隔离与回收 |
| `VERIFICATION_AGENT` | 4 | 验证代理，需检查工具及代理定义是否齐备 |
| `REVIEW_ARTIFACT` | 4 | 审查结果输出，需验证生成/读取链路 |
| `COORDINATOR_MODE` | 32 | 多代理协调，需验证通信、状态及失败恢复 |
| `TEAMMEM` | 53 | 团队任务记忆，需验证状态持久化和并发 |
| `FILE_PERSISTENCE` | 3 | 文件保存与恢复，需做真实写入与会话恢复测试 |
| `TREE_SITTER_BASH` | 3 | Bash 语法分析，需检查解析器和平台依赖 |

以上优先级基于**源码可调查性与潜在复用价值**，尚未运行逐开关的新构建和行为对照。当前独立程序里仍按原本三项 features 构建，没有未经核验地开启其他 87 项。

## 3. 需要外部环境、原生组件或私有系统才能闭环

| 源码包或开关 | 提取证据与限制 | 判定 |
|---|---|---|
| `@ant/claude-for-chrome-mcp` | **8 个源码文件**；本次检查其内部相对导入未发现缺失，但完整能力仍需要 Chrome 扩展、消息传输端和权限连接 | **源码可用于研究，实际浏览器操作待验证** |
| `@ant/computer-use-mcp` | **10 个源码文件**；`src/mcpServer.ts` / `src/toolCalls.ts` 还依赖映射中缺失的 `executor.js`，`src/index.ts` 依赖缺失的 `subGates.js` | **有部分实现，完整电脑操作链路存在明确源码缺口** |
| `@ant/computer-use-input` 与 `@ant/computer-use-swift` | 各 **1 个 JS 适配文件**；实际输入/Swift 系统调用还需相应原生组件 | **适配层可读，不等于原生执行能力恢复** |
| `VOICE_MODE`（49 次） | 与音频设备、权限及平台二进制有关 | **需实机验证** |
| `WEB_BROWSER_TOOL`（4 次）、`CHICAGO_MCP`（16 次） | 需要浏览器或电脑操作服务 | **需连接端和工具协议测试** |
| `BRIDGE_MODE`（29 次）、`DIRECT_CONNECT`（5 次） | 含外部连接与服务端配置 | **需完整通信链路** |
| `AGENT_TRIGGERS`（11 次）、`WORKFLOW_SCRIPTS`（10 次） | 定时/工作流相关路径，还需业务数据和回调条件核验 | **当前编译未启用，研究不创建任何定时任务** |
| `PROACTIVE`（37 次）、`KAIROS`（156 次） | 主动任务与特定运行环境密切相关 | **需要核对运行入口、服务依赖和真实回调** |
| `@anthropic-ai/sandbox-runtime` | 映射提供 **14 个源码文件**，但沙盒依赖平台命令/权限与系统限制 | **可查逻辑，原生隔离效果必须实测** |

## 4. 明确无法直接通过该映射补足的内容

以下是之前 333 构建脚本主动排除的七个**源文件**。它们的文件名在源码映射里没有对应的完整 `sourcesContent`，不能简单开启相关开关：

`VerifyPlanExecutionTool/VerifyPlanExecutionTool.js`、`compact/snipCompact.js`、`components/agents/SnapshotUpdateDialog.js`、`assistant/AssistantSessionChooser.js`、`commands/assistant/assistant.js`、`compact/cachedMicrocompact.js`、`contextCollapse/index.js`。

尤其要单独核查 `HISTORY_SNIP`（16 次）、`CACHED_MICROCOMPACT`（12 次）、`CONTEXT_COLLAPSE`（23 次）的编译入口。当前映射提供引用，但无法证明对应完整模块已恢复。其他关闭开关也可能遇到上游服务、包元数据或原生库缺口。

## 5. 环境变量：可立即用于审计，不能等同于开关

重要路径例子（次数以研究索引为准）：

- `USER_TYPE`（357）：内部/外部发行用户模式；现有构建明确设为 `external`。
- `NODE_ENV`（43）：开发/生产行为；现有构建定义为 `production`。
- `CLAUDE_CODE_ENTRYPOINT`（41）、`CLAUDE_CODE_REMOTE`（27）：入口与远端工作环境。
- `ANTHROPIC_API_KEY`（16）、`ANTHROPIC_BASE_URL`（13）：模型鉴权及地址。
- `CLAUDE_CODE_USE_BEDROCK`（14）、`CLAUDE_CODE_USE_VERTEX`（13）、`CLAUDE_CODE_USE_FOUNDRY`（9）：多云模型接入选择。

变量名称出现在源码，说明存在对应读取逻辑；是否支持相应服务仍取决于构建入口、认证、依赖和真实测试。研究资料不会读取或存储用户的环境变量值、令牌或密钥。

## 6. 位置映射的直接用途

`mappings/mappings.vlq` 保存 **100% 原始 VLQ 字符序列**，`mappings/decoded-segments.tsv.gz` 保存 **100% 解码段**。配合 `sources.jsonl`，能把正式 `cli.js` 生成位置反向指向 `src/` 或 `dependencies/node_modules/` 源文件的行列，适合差分排错、源实现溯源和评估 bundler 剪枝。该数据包含约 206.9 万段位置引用，但不是额外的 206.9 万份新功能源码。

映射没有原项目完整 Git 历史，`names` 数组为空；映射保留的依赖文件仅覆盖进入发布包的部分，不能据此声称获得全部 upstream npm 包或缺失的七个内部模块。

## 结论与恢复顺序

**已经能直接使用：** 全部静态研究数据、三项现有编译开关、已通过基础验收的本地 CLI 工具。

**下一步最有价值：** 先以 `ULTRAPLAN`、技能搜索、MCP 技能、Bash 分类、缓存/上下文控制等为候选；逐项做源码依赖闭合检查，再独立构建并使用原版差分测试决定能否启用。对 `@ant/claude-for-chrome-mcp` 先验证连接器与扩展协议，对 `@ant/computer-use-mcp` 先补齐被引用但映射缺失的源码，避免误报完成。

**明确不应直接启用：** 尚未补足依赖的电脑操作、语音/原生服务、云端/远端工作流，以及七个源码缺失模块所覆盖的内部实现。本次研究只提取、索引和分析，不修改产品的权限策略、用户数据或功能默认状态。
