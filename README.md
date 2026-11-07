# 摇摇车 · 本地 AI 智能体工作台

摇摇车面向本地项目中的代码阅读、开发、测试和交付，提供终端与桌面入口，包含两种协作模式。

## 智能体模式

**主智能体 + 子智能体**：主智能体负责目标拆解、分工与复核；子智能体使用现有 AgentTool、任务生命周期、后台执行及 Git Worktree 隔离能力完成独立工作。

**Super Agents 团队协作**：复用 Team、SendMessage、Workflow 与 Coordinator，增加按项目保存的 Mission 和执行工作项。用户可显式启动单项、最多三项并行或在当前桌面宿主中持续派发队列。SDK 原生工具审批持续有效；成功后进入人工审核，失败、重试和中断均保留尝试历史。退出本地宿主后由用户核查并手动恢复。

桌面端提供真实团队成员名册、工作项状态、SDK 会话、跨会话权限申请、结果审核以及停止控制。模型接入、项目数据和执行记录遵循仓库既有本地化策略。

## 功能与扩展

- 模型：OpenAI/ChatGPT、DeepSeek、Qwen、Kimi、智谱 GLM、MiniMax 及现有 Claude 接入，支持会话恢复与模型能力管理。
- 工具：文件读写、代码搜索、终端、LSP、Git、测试、代码审查及权限控制。
- 协作：AgentTool、Teams、Workflow、Coordinator、Mission 队列、工作项审核与执行历史。
- 扩展：MCP、插件、技能、Hook、本地记忆和诊断。

## 开发与验收

```bash
npm install
npm run rebuild
npm run test:all
npm run dev:typecheck
npm run dev:lint
```

终端入口：`dist/launcher.cjs`。桌面程序源代码：`desktop/`；独立桌面宿主：`dist/desktopHost`（Windows 为 `desktopHost.exe`）。

- [Super Agents 架构和持续派发控制](docs/superagents-desktop-architecture.zh-CN.md)
- [桌面权限与 SDK 通信协议](docs/desktop-protocol.md)
- [按需 CI 与验收门禁](docs/ci-on-demand.md)

完整完成状态以**最新提交**的跨平台构建、专项测试和原版行为差分结果为依据。
