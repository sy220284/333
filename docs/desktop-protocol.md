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
| `agents.overview` | 无 | 当前项目的模式、已选任务、任务簿、多团队和活动任务数量 |
| `agents.setMode` | `mode: master\|super` | 显式切换本地宿主进程的协作模式，不自动创建 Worker |
| `missions.list` | 无 | 当前项目任务簿及已选任务 ID |
| `missions.get` | `missionId` | 读取本项目任务详情；跨项目 ID 拒绝 |
| `missions.create` | `objective` | 本地创建并选中长期任务，切换为超级智能体模式；执行仍须用户命令授权 |
| `missions.select` | `missionId` 或 `null` | 选择本项目任务或清除选择 |
| `missions.updateStatus` | `missionId`、`status` | 用户主动暂停、恢复或完成任务，沿用任务簿状态门禁 |
| `missions.checkpoint` | `missionId`、`checkpoint` | 将已核实进度记录在本地任务簿 |
| `missions.jobs.list` | `missionId` | 本项目长期任务的持久工作项及执行历史 |
| `missions.jobs.enqueue` | `missionId`、`title`、`instruction` | 创建排队工作项，关联原 Mission；仅记录指令 |
| `missions.jobs.start` | `missionId`、`jobId` | 显式抢占工作项并打开真实 SDK 会话，返回 session/turn |
| `missions.jobs.runBatch` | `missionId`、可选 `limit`（1–3） | 用户一次明确授权后并行启动最多三个待执行工作项，逐项返回成功/失败及剩余队列 |\n| `missions.jobs.runQueue` | `missionId` | 用户显式启动当前宿主的事件驱动队列派发，最多三个工作项并行，终态释放槽位后派发下一项 |
| `missions.jobs.haltQueue` | `missionId` | 停止分配新工作项；已运行的 SDK 会话不受影响 |
| `missions.jobs.queueStatus` | `missionId` | 查询本宿主是否仍在连续派发 |
| `missions.jobs.approve` | `missionId`、`jobId` | 人工审核成功结果，解除 Mission 完成门禁 |
| `missions.jobs.retry` | `missionId`、`jobId` | 重新排队失败/中断/待审核工作项，不立即执行 |
| `missions.jobs.recover` | `missionId`、`jobId` | 对已退出宿主的遗留运行项进行人工确认后的中断修复 |
| `missions.jobs.cancel` | `missionId`、`jobId` | 撤销未运行中的工作项并解除完成门禁 |
| `tasks.list` | `sessionId` | 当前或保存的任务索引 |
| `tasks.stop` | `sessionId`, `taskId` | SDK `stop_task` 控制 |
| `tasks.resume` | `sessionId`, `taskId`，可选 `prompt` | 从原会话恢复任务上下文；仅带用户明确提供的 `prompt` 时发起继续执行 |
| `sessions.close` | `sessionId` | 清理子进程、订阅、权限回调和未完成任务状态 |

## 主动推送

`mission.job.updated` 推送持久工作项队列、执行、审核与恢复状态；`missions.jobs.start` 不会自行批准模型操作，所有工具与宿主权限仍须通过 SDK 原生审批。单个 Mission 至多三个工作项同时执行，成功后进入待审核而非自动确认；人工恢复前先核查外部副作用。\n\n`session.state` 推送 running、requires_action、completed、cancelled、failed、closed 等；`session.message` 保留 SDK 原文（含工具调用、部分消息、使用统计、Agent 事件）；`permission.request` / `permission.resolved` 同步确认请求生命周期；`agent.progress` 从 SDK `tool_progress`、`task_started`、`task_progress`、`task_notification` 转出；`task.updated` 记录任务状态；`session.error` 反馈模型流或保存过程的失败。

任务簿继续使用已有的 `agent-missions` 本地存储和项目选择键，桌面与 CLI 读取同一份状态；不同项目的任务 ID 不能跨项目操作。`agents.setMode` 控制当前本机宿主进程的模式，各会话仍各自管理 SDK 执行和权限；本接口不会在读取任务、创建任务或切换模式时自动启动智能体或定时器。\n\n任务索引按工作区 SHA256 分类保存在本机 `~/.yaoyaoche/desktop`，支持使用 `--data-dir` 设置根目录。索引仅存任务 ID、进度和状态，不存模型上下文和工具授权密钥。重启时旧运行任务标记为 interrupted，保留终态记录；原对话上下文由 SDK 的持久化历史恢复。已取消或结束的任务需用户明确选择继续，系统不会自动重启旧 Agent 进程。

独立桌面入口运行在受信任的本机子进程中，请勿将 stdin/stdout 通信直接暴露为无鉴权网络服务。桌面 UI 应从主进程调用此接口，并为外部文件操作保留工具审批弹窗。

## 桌面主进程调用示例

`src/services/desktop/client.ts` 提供类型化客户端，负责关联并发请求、接收主动事件、断线后拒绝待完成请求。桌面主进程启动安装包内的 `desktopHost`，把子进程 stdout 作为输入、stdin 作为输出传入：

```ts
import { spawn } from 'node:child_process'
import { createDesktopClient } from './services/desktop/client.js'

const child = spawn('/应用安装目录/desktopHost', ['--cwd', '/项目目录'], {
  stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
})
const desktop = createDesktopClient(child.stdout, child.stdin)
desktop.onEvent(event => {
  // session.message, agent.progress, permission.request, task.updated 等
})
const { sessionId } = await desktop.openSession()
await desktop.send(sessionId, '检查项目源码')
// 后续由事件回调更新桌面视图
```
