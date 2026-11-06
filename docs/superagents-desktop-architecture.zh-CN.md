# 摇摇车 Super Agents 工作台：统一身份、长期任务和可靠执行

## 已有实现与本轮补强

摇摇车保留两种协作方式：主智能体委派子智能体，以及协调者管理 Team/Workflow。底层继续使用 2.1.317 反编译版的 AgentTool、SendMessage、TaskStop、TeamCreate/Delete、Workflow、SDK 会话控制和权限回调，避免重新实现模型循环和工具授权。

本轮新增持久的 **Mission Job**：将一次任务的“用户授权、排队、执行尝试、结果复核和人工恢复”记录在磁盘上。创建 Mission 和入队只记录意图；用户明确调用 `missions.jobs.start` 才进入 SDK 执行器。已有 Mission 的状态/检查点、团队发现和 SDK 状态事件保持兼容。

| 核心概念 | 用户看到什么 | 真实存储/运行 |
| --- | --- | --- |
| 智能体 | 持久身份与责任，未来支持自定义形象和专属记忆 | 现有 agent definition 与 Team 成员配置 |
| 项目 Mission | 目标、范围、检查点、当前状态 | `agent-missions/*.json`，单项目隔离 |
| 工作项 Job | 待处理、执行中、待审核、失败、已中断、已完成 | `agent-mission-jobs/*.json`，跨会话持久化 |
| 执行 Attempt | 会话、轮次、次数、结果记录 | 一个 Job 可重试，最多 20 次，保留尝试历史 |
| 会话 Session | 模型选择、输出、工具和权限请求 | 2.1.317 SDK stream-json / 本机 desktopHost |
| Team / Workflow | 共享任务、分工、沟通、工作流恢复 | 保留现有工具及其生命周期 |

## 本轮实际完成的数据与执行路径

1. 用户创建 Mission，设置项目范围；通过 `missions.jobs.enqueue` 输入具体工作。入队同时把工作项关联进原 Mission，防止工作项待处理时误标记整个 Mission 完成。
2. 用户明确启动工作项 `missions.jobs.start`。工作项先以跨进程文件锁从 queued 切换到 running，记录宿主进程 ID、执行 ID 与次数；另一宿主对同一工作项的启动会被拒绝。
3. 用户可通过 `missions.jobs.runBatch` 一次启动最多三个排队工作项；每项仍使用自己的真实 SDK 会话、权限审批和持久执行记录。同一 Mission 的跨宿主并发占用由文件锁统一限制。\n4. 通过现有独立 SDK 创建实际会话，调用模型与 Agent/Team/Workflow 所需的既有工具，继续沿用工具审批和宿主权限申请。
5. SDK 返回成功结果后，工作项进入 **review（待人工审核）**。人工确认 `missions.jobs.approve` 才将工作项与 Mission 关联执行最终标记为完成。失败与异常中断保留明确信息，不自动产生另一次执行。
6. 人工可在查看产物与外部状态后调用 `missions.jobs.retry`；被意外关闭的宿主须由 `missions.jobs.recover` 确认其进程退出，再转 interrupted。重新执行始终要求明确的 start 命令。
7. 工作项回到 completed 或 cancelled 后，Mission 才能在既有完成门禁下终结。

这些操作用 SHA/ID 定位本地项目和文件，保存结果写入时采用同目录临时文件加原子替换；并发修改由文件锁顺序化。所有任务读取与恢复都不会偷偷运行模型。

## 桌面工作台的界面组织

参照 Grok Bot 的 Bot roster、专属空间和协作会话，以及 ChatGPT Dots 的 In progress / Scheduled / Completed 活动记录，界面按 **工作对象和下一步动作** 而非工具名组织：

- 左侧：项目选择、两种协作模式和智能体名单（负责人/成员/在线状态）；可在团队视图查看共享工作项和沟通。
- 中间：Mission 概览与工作项泳道；Queued、Running、Review、Blocked/Failed、Interrupted、Completed 一眼可辨。每张工作项卡片显示所属任务、最近执行记录、输出、模型成本和时间。
- 右侧：当前 SDK 会话、文件差异/产物/权限审批、Agent 消息流；支持停止、审核、要求修改、确认结果。
- 活动历史：按 Job 汇总 attempt、session ID、工具结果与上次验证证据；崩溃后明确标为“需检查并恢复”，不静默重复外部操作。
- 提醒中心：只有审批、失败、交付待审核等用户需要行动的时点才突出提示；常规内部进度放在任务卡片和事件时间线。

将动画用于状态变化和视线引导：队列转入运行态、成员交接、审批出现、结果回收；保持内容密度可控，提供关闭非必要动效与键盘快捷操作。页面材质、布局和动效交由桌面壳层实现，模型执行与任务簿仍集中于上述底座。

## 对照参考与取舍

- **Claude Code 2.1.317（当前反编译源码）**：复用 Coordinator 模式、AgentTool 子执行器、Team 的本地信箱、Workflow 阶段执行、SDK 事件和 Tool 权限。只增强协调与持久化，不重写已经验证的循环、工具与模型协议。
- **DeepSeek dsh-superagent-prototype**：参考 Ticket/Mandate/Assignment、待审核阶段、执行日志、原子持久化与中断恢复；把授权与模型判断分离，恢复先验证外部副作用。
  https://github.com/deepseek-ai/dsh-superagent-prototype/tree/main/docs
- **Grok Bot**：参考长期身份、独立工作空间、Bot 多方协作、可示范后复用的 Routine；先落地项目隔离与手工授权的持续协作，后续设计角色记忆和动作录制。
  https://x.ai/news/designing-grok-bot
- **ChatGPT Dots**：参考活动视图、人工审批/接管、跨会话持续工作与可控暂停。桌面端采用本地进程/本地 SDK，无需模拟云端常驻。
  https://help.openai.com/en/articles/20001530-getting-started-with-your-dot

## 安全边界与待补齐能力

- **已实现**：有状态队列、并发抢占、明确执行授权、人工审核、真实 SDK 启动、记录保存、失败和中断恢复入口、项目隔离、桌面通信接口。
- **下一层工程**：跨宿主状态事件订阅、多智能体身份/专属记忆、团队间任务自动交接、条件触发器、执行资源配额和预算、历史产物/文件差异追踪、完整桌面 GUI。
- **执行策略**：在现有授权外不启用自动计划任务。即使未来加入事件触发、周期工作和更强的无人值守调度，也必须分别由用户明确授权规则、成本/权限范围和退出条件，保留一键暂停与追踪记录。

## 端到端验收标准

- 并发启动同一个 Job：恰有一个成功，另一请求明确拒绝；不会调用两次模型。
- 入队后不触发 SDK 会话；暂停 Mission 后拒绝启动；跨项目 Job 与 Mission 被拒绝。
- 启动后产生真实 SDK session / turn；返回成功时进入 review 而非自动标为 completed。
- 人工确认使 Mission 关联任务进入 completed；Mission 可以正常完成。未审核工作项应阻止提前完成。
- 模型失败、进程中断、宿主关闭均留有可靠终态记录；不自动重试已可能产生外部副作用的操作。
- 用户确认旧进程退出并检查已产生的结果后，才可恢复或重试。重试次数与历史持续可查，旧轮结果不能覆盖新轮。
- 桌面工作台、SDK 流和本地磁盘三边状态一致；Node/Bun 核心测试、专项和发行构建按实际 CI 记录验收。
