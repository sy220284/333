# 333 独立化功能精简与统一入口验收表

## 用户确认移除
- 官方贴纸、移动 App 推广二维码、年度回顾、Claude Desktop 广告。
- Claude 官方 GitHub/Slack App 安装、私有项目发送、Guest Passes、额外用量购买及额度引流。
- 官方 Ultrareview 云端付费审查、单独 CLI 命令和弹窗。
- 向 Anthropic First-Party Event Logging 和 Datadog 发送的官方事件、GrowthBook 远程实验获取；配置以本地显式覆盖和默认值为准。
- 不再向 Claude 官方上传反馈或完整对话；/feedback 生成仅存于本机的 0600 权限 JSON 诊断文件。
- 内部调试命令源码保留在仓库中，正式对话菜单不注册。

## 统一入口
| 入口 | 使用示例 | 保留底层能力 |
| --- | --- | --- |
| /review | /review、/review deep、/review security、/review deep 123 | 本地 Git diff、PR 差异与安全审计 |
| /status | /status | 概览、各模型 token/费用、上下文、历史统计 |
| /plan | /plan、/plan open、/plan advisor <模型>、/plan advisor off | 原规划模式与顾问模型 |
| /tasks | /tasks、/tasks active、/tasks history | 后台命令、Agent、工作流、历史任务 |

## 安全约束
- 本地诊断不采集消息正文或 API 密钥；事件计数仅存内存。反馈描述由用户明确输入，分享由用户自行控制。
- 模型统计来自本地会话账本，不从 Claude 订阅 API 查询。模型上下文限制和服务商请求额度分别展示，未采集的服务商额度不推测。
- 不改变 MCP v2、TypeScript 7、Node/Bun 或核心工具与 Agent 运行时。
- 删除功能视为明确的产品化调整，不更改官方 2.1.317 原始基准文件及 PR14 已保护的新版本依赖。

## 检查方式
执行 `node --test tests/independent-product-cleanup.test.mjs`，再做全量类型检查、构建和正式终端交互验证。
