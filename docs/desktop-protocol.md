# 桌面通信接口（v1）

本接口供本机桌面主进程调用。桌面主进程启动正式构建中的 `dist/desktopHost --cwd /项目路径`（Windows 为 `dist/desktopHost.exe`，无需安装 Bun），通过子进程 stdin/stdout 交换 **UTF-8 JSON Lines**。无需运行 Ink，也不需要独立 HTTP 服务。源码开发时也可用 `npm run desktop:serve -- --cwd /项目路径` 启动同一入口。

通信层复用 SDK 已实现的 `--input-format stream-json --output-format stream-json`、`initialize` 模型列表、`control_request/can_use_tool`、`interrupt`、`stop_task` 和会话 `--resume`。接收的 SDK 消息以原始结构随 `session.message` 事件传递；任务进度另外同步为桌面友好的事件。

## 线协议

桌面发出请求，每条占一行：

```json
{"id":"1","method":"sessions.open"}
```

桌面收到相关响应，每条占一行：

```json
{"id":"1","ok":true,"result":{"sessionId":"<UUID>","resumed":false,"models":[],"agents":[],"tasks":[]}}
```

异步 SDK 事件没有请求 ID：

```json
{"event":"session.message","sessionId":"<UUID>","turnId":"<UUID>","message":{"type":"..."}}
```

请求出错时响应 `{"id":"1","ok":false,"error":{"code":"REQUEST_FAILED","message":"..."}}`；无效帧返回 `INVALID_REQUEST`，重复审批、过期审批会被拒绝。所有请求在桌面侧使用唯一 `id`，按 ID 匹配响应；同一连接支持并发未完成请求。

## 指令

| 方法 | 参数 | 结果 / 行为 |
|---|---|---|
| `hello` | 无 | 协议版本与能力 |
| `models.list` | 可选 `sessionId` | SDK 初始化返回的 `models`、`agents`；未指定会话时以临时 SDK 会话查询 |
| `sessions.open` | 可选 `model` | 打开新会话，返回 ID、模型、Agent 和任务快照 |
| `sessions.resume` | `sessionId` | 校验当前工作区真实历史，使用 SDK `--resume` 打开原会话，加载任务快照 |
| `sessions.list` | 可选 `limit`、`offset` | SDK 本地会话列表 |
| `sessions.history` | `sessionId`，可选分页参数 | SDK 持久化会话消息 |
| `sessions.send` | `sessionId`, `message` | SDK 用户消息（字符串或 SDKUserMessage），返回 `turnId`；后续通过事件流更新 |
| `sessions.interrupt` | `sessionId` | 取消待审批项并向 SDK 发中断控制请求 |
| `sessions.status` | `sessionId` | 当前状态快照 |
| `sessions.setModel` | `sessionId`, `model` | SDK `set_model` 控制 |
| `sessions.setPermissionMode` | `sessionId`, `mode` | SDK 权限模式控制；绕过授权需由桌面主进程显式允许 |
| `permissions.list` | `sessionId` | 当前等待确认的工具列表 |
| `permissions.decide` | `sessionId`, `permissionId`, `decision` | SDK 原生 `allow/deny` 结构，支持更新输入和永久权限更新 |
| `tasks.list` | `sessionId` | 当前或保存的任务索引 |
| `tasks.stop` | `sessionId`, `taskId` | SDK `stop_task` 控制 |
| `tasks.resume` | `sessionId`, `taskId`，可选 `prompt` | 从原会话恢复任务上下文；仅带用户明确提供的 `prompt` 时发起继续执行 |
| `sessions.close` | `sessionId` | 清理子进程、订阅、权限回调和未完成任务状态 |

## 主动推送

`session.state` 推送 running、requires_action、completed、cancelled、failed、closed 等；`session.message` 保留 SDK 原文（含工具调用、部分消息、使用统计、Agent 事件）；`permission.request` / `permission.resolved` 同步确认请求生命周期；`agent.progress` 从 SDK `tool_progress`、`task_started`、`task_progress`、`task_notification` 转出；`task.updated` 记录任务状态；`session.error` 反馈模型流或保存过程的失败。

任务索引按工作区 SHA256 分类保存在本机 `~/.yaoyaoche/desktop`，支持使用 `--data-dir` 设置根目录。索引仅存任务 ID、进度和状态，不存模型上下文和工具授权密钥。重启时旧运行任务标记为 interrupted，保留终态记录；原对话上下文由 SDK 的持久化历史恢复。已取消或结束的任务需用户明确选择继续，系统不会自动重启旧 Agent 进程。

独立桌面入口运行在受信任的本机子进程中，请勿将 stdin/stdout 通信直接暴露为无鉴权网络服务。桌面 UI 应从主进程调用此接口，并为外部文件操作保留工具审批弹窗。
