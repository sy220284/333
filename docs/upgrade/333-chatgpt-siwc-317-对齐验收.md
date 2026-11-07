# 333：OpenAI 官方 ChatGPT 登录与 Claude Code 2.1.317 保留功能对齐记录

更新时间：2026-11-06；审查与提交目标：PR #19。此文按实际源码及回归结果维护；「已有代码」和「已实测通过」分别记录。

## 确定的产品边界

- 保留直连：OpenAI API Key、ChatGPT 官方账号、DeepSeek、Qwen、Kimi、智谱 GLM、MiniMax；Claude API 和 Claude 账号为可选通道。
- 维持退役：Gemini、xAI/Grok、OpenRouter，以及官方 Ultrareview CLI、官方商业收费入口/营销/远程遥测。代码对照不得将用户主动退役功能标注为缺陷。
- 保留能力：代理、子代理（由最终用户按需触发）、并发/后台任务、工具与权限、Hook、MCP、插件、技能、会话恢复、IDE、SDK、TUI、PDF/附件、Agent 长任务，以及由原版能力迁移的通用入口。
- 以 `docs/upgrade/2.1.317-六层完整功能链路.json` 的六层 C01–C20 为结构性对照；C20 按 333 本地 /review 和 /github 的替代验收。

## OpenAI 官方来源（首次和回归应重新比对）

1. [OSS 注册与登录](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)：`dynamic_agent_client` 首次注册，固定主机标识；为每次登录生成新 state、nonce、PKCE；回调保留签发 `client_id`；相同注册后续复用客户端 ID；校验 ID Token；申请并检查套餐范围。
2. [账号与会话](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)：每注册独立凭据；多个账号和工作区相互隔离；保留已签发注册；切换及退出；发现端点的刷新令牌撤销。
3. [预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)：`store:false`、`stream:true`；每轮输入包含完整上下文；使用 `additional_tools` 或受支持的工具命名空间；移除预览拒绝的字段；收齐完整响应；不发送未支持的托管工具。
4. [Responses 输入协议](https://developers.openai.com/api/reference/resources/conversations/methods/create)：`additional_tools` 是输入项，`role:developer` 与函数的 `name/parameters` 一起传递。

## 本轮已实施的源码变更（等待 CI 最终验收）

| 需求 | 落点 | 回归检查 |
| --- | --- | --- |
| ChatGPT 与 API Key 的工具协议分流 | `src/services/api/multimodel/transport.ts` | `tests/multimodel-provider.test.ts` |
| 保留客户端动态注册；失败后重试用签发 ID | `src/services/auth/chatgptOAuth.ts` 的 pending registration | `tests/chatgpt-oauth-accounts.test.ts` |
| 维护多个账号、工作区、注册和套餐授权状态 | `src/services/auth/chatgptOAuth.ts`、`src/main.tsx` | 多账号注册、切换、身份绑定、授权范围 |
| 账号独立凭据（0600）；旧单账号迁移 | `src/services/auth/chatgptOAuth.ts` | 不同注册的令牌文件和索引脱敏 |
| 新安装登录专用锁文件 | `src/services/auth/chatgptOAuth.ts` | 首次注册和重新登录 |
| 官方模型 slug、展示名称、可见性及顺序 | `src/services/api/multimodel/registry.ts`、`catalog.ts` | `tests/multimodel-provider.test.ts` |
| 模型能力档案按 ChatGPT 账号绑定 | `src/services/api/multimodel/profiles.ts` | 同名模型的不同工作区能力隔离 |
| 套餐授权状态在 TUI 内可检查 | `src/commands/status/RuntimeStatusPanel.tsx` | `tests/independent-product-cleanup.test.mjs` |
| 本地 PR 审查的变更对象一致 | `src/commands/reviewPatch.ts`、`review.ts` | `tests/github-generic-review.test.mjs` |

## 已知验收要求

- 首次注册、原注册重新授权、中断交换恢复、双账号切换、失效/过期令牌、撤销与重新授权；Web 回调状态、JWT 签名、scope、工作区绑定均逐条核查。
- 三平台测试：`bun test tests/chatgpt-oauth-accounts.test.ts tests/multimodel-provider.test.ts tests/independent-local-features.test.ts`；独立化回归：`node --test tests/github-generic-review.test.mjs tests/independent-product-cleanup.test.mjs`；然后 TypeScript、Lint、六架构构建和真实终端交互。
- 官方真实账号授权与套餐调用需由具有账户授权的环境执行，记录 login -> models -> tool_use -> tool_result -> next turn -> token refresh -> logout 的完整往返，以及失败/恢复。
- 原版工具链（FileRead/FileEdit/Bash/Agent）、技能、插件、MCP、会话与 SDK 继续依据 C01–C19 逐函数比对入口、权限、事件、取消、超时与恢复；采用回归结果更新各链状态，不用文件存在情况直接判定完成。
- 第三方来源版权和发行许可单列为发行前审查项目。

## CI 状态记录原则

多个并行提交会取消旧 SHA 的 workflow。只将当前提交 SHA 的成功运行记为正式验收。取消、队列中、尚未开始和模拟测试不得填作通过。失败时读取 job 日志，修复根因后重新验证。
