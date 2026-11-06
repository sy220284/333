# 本地能力与高级功能

正式构建直接提供 MCP 技能发现、快捷文件搜索、简报模式，以及已接通的工具搜索、任务工作流和监控能力。

## 统一设置

在交互终端输入 `/features` 查看高级能力的当前状态。

- `/features on auto-memory`：自动整理本地记忆。每次整理会额外调用模型，默认关闭；原有手动记忆不受影响。
- `/features on scheduled-tasks`：开启本机定时任务工具。创建任务仍需要用户确认，默认关闭。
- `/features on agent-teams`：管理团队协作能力，现已默认开启；`off` 可按需关闭。

把 `on` 换成 `off` 即可关闭；本地配置会保存，后续会话继续生效。

对于脚本和自动化执行，也可通过环境变量 `CLAUDE_CODE_ENABLE_LOCAL_MEMORY_EXTRACTION=1` 和 `CLAUDE_CODE_ENABLE_CRON=1` 显式启用对应能力。设置 `CLAUDE_CODE_DISABLE_CRON=1` 可强制停止本地调度入口。

## 本地优先原则

跨会话发现和消息发送使用本机有效会话及 UDS 通信；不依赖 Claude.ai 的账号会话目录或 CCR 远程控制。历史实验缓存不再决定功能授权。用户凭证仍仅用于明确选择的模型提供商和所需 API。

## 智能体两种模式

`/agents` 打开完整智能体管理界面，复用现有智能体定义编辑器、后台任务和工作流历史界面。

- `/agents mode master`：主智能体与子智能体模式。
- `/agents mode super`：超级智能体协调模式，自动注册 Worker 定义；按明确任务要求执行分工。
- `/agents list`：查看本机可通信的子智能体、团队成员和会话。
- `/agents team-create <团队名>` 与 `/agents team-delete`：管理本会话团队；清理时会检查是否仍有运行中的成员。

以上模式配置在本地保存，用户下次进入新会话时生效；同一会话切换时工具池同步刷新。开启功能不会自行创建后台任务或子智能体。

## 超级智能体长期任务簿

借鉴 DeepSeek Super Agent 的任务与执行记录拆分：每个任务有独立 ID、目标、当前阶段、状态以及关联 Agent/Workflow。数据保存在本机 `agent-missions/` 目录，使用文件锁与原子写入保证跨会话读写可靠。

- `/agents mission new <任务目标>`：明确创建长期任务并选择超级智能体模式。
- `/agents missions`：查看任务列表；`/agents mission show`：查看当前档案。
- `/agents mission note <阶段记录>`：存储可恢复的进度摘要；`/agents mission use <ID>`：切换目标。
- `/agents mission pause|resume|done`：控制任务记录的生命周期；`/agents mission clear`：取消当前选择，保留档案。
- `/agents mission attach <agent|team|workflow> <任务ID> <标题>`：关联已有执行；新启动的后台 Agent 和 Workflow 将自动关联当前有效任务。

模式切换、任务档案读取本身不会创建工作进程或定时任务。继续执行需要用户授权和本机可用的模型运行环境。
