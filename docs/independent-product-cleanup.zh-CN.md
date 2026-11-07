# 333 独立化功能精简与统一入口验收表

## 用户确认移除
- 官方贴纸、移动 App 推广二维码、年度回顾、Claude Desktop 广告。
- 移除 Claude 官方 Slack App 推广、私有项目发送、Guest Passes、额外用量购买及额度引流。GitHub 授权、仓库选择、Actions、PR 和密钥管理保留并改为通用能力；卸除 Anthropic Action 与 Claude 登录硬绑定。
- 官方 Ultrareview 云端付费审查、单独 CLI 命令和弹窗。
- 向 Anthropic First-Party Event Logging 和 Datadog 发送的官方事件、GrowthBook 远程实验获取；配置以本地显式覆盖和默认值为准。
- 不再向 Claude 官方上传反馈或完整对话；/feedback 生成仅存于本机的 0600 权限 JSON 诊断文件。
- 内部调试命令源码保留在仓库中，正式对话菜单不注册。

## 统一入口
| 入口 | 使用示例 | 保留底层能力 |
| --- | --- | --- |
| /review | /review、/review deep、/review security | 本地 Git 证据采集、差异校验、三类本地审查 |
| /status | /status | 概览、各模型 token/费用、上下文、历史统计 |
| /plan | /plan、/plan open、/plan advisor <模型>、/plan advisor off | 原规划模式与顾问模型 |
| /tasks | /tasks、/tasks active、/tasks history | 后台命令、Agent、工作流、历史任务 |
| /github | /github auth、/github repos、/github setup owner/repo、/github review owner/repo 18 extreme | GitHub 独立授权、仓库管理、Actions 工作流与密钥、安全生成配置 PR、多模型远程审查 |

## GitHub 独立集成
- GitHub 通过本机 GitHub CLI OAuth 授权，与模型认证分开；检查权限、选择仓库、创建分支、工作流文件、配置 PR。
- 执行 /github setup owner/repo 生成安装 PR，合并后添加 GitHub Secret THREE333_MODEL_API_KEY 和变量 THREE333_MODEL_NAME、THREE333_MODEL_PROVIDER；可选 THREE333_MODEL_BASE_URL。
- Actions 运行在用户自己仓库，通过受支持的模型直连 API（包括 OpenAI、Anthropic）审查；Claude 仅为可选服务商。授权用户 @333 评论可以触发自动回复。
- Slack 通用接入可使用 https://mcp.slack.com/mcp（Streamable HTTP），但需注册具备 MCP 权限的 Slack App，配置固定的 OAuth Client ID/Secret 和回调地址，并获得工作区管理员许可；不需要 Claude 账号或 Anthropic API。可另行开发 Slack App 机器人，用 Events API 收取消息并回传任务结果。

## 安全约束
- 本地诊断不采集消息正文或 API 密钥；事件计数仅存内存。反馈描述由用户明确输入，分享由用户自行控制。
- 模型统计来自本地会话账本，不从 Claude 订阅 API 查询。模型上下文限制和服务商请求额度分别展示，未采集的服务商额度不推测。
- 不改变 MCP v2、TypeScript 7、Node/Bun 或核心工具与 Agent 运行时。
- 删除功能视为明确的产品化调整，不更改官方 2.1.317 原始基准文件及 PR14 已保护的新版本依赖。

## 检查方式
执行 `node --test tests/independent-product-cleanup.test.mjs`，再做全量类型检查、构建和正式终端交互验证。

## 官方 2.1.317 的有意产品差异
- C20 云端 Slack/Ultra 审查链路经用户明确取消，改为 /review 三模式本地审查。上游原始参考保留在 research/ 和历史文件；项目版六层映射更新为有效入口 src/commands/review.ts。
- 旧官方 Feedback.tsx 已退出正式程序；中文回归检查本地诊断导出文案。
- TypeScript 严格迁移检查将已退役的云审查协议模块替换为新模式解析模块，并继续保留检查总量和生产类型约束。

## 本地与官方 CLI 差异检查
- 原版 2.1.317 CLI 帮助快照保留；仅从 333 的命令对照中减去已退役的 `ultrareview`。其他主命令、选项及子命令继续严格与原版快照比较。
- 已退役云审查的命令和结果协议测试调整为本地审查模式测试，确保退役入口不可见且 `/review` 可用。

- 内部诊断命令在正式命令模块不再装载（包括原 Ant 限定命令、/heapdump、测试模拟限流等）；开发源码及既有专项测试不改。
