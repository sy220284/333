# ChatGPT 账号登录：OpenAI SIWC 官方规范与 Codex 源码对照（2026-11-06）

## 目标与来源

**目标是 333 独立应用通过 ChatGPT 账号登录后，使用账户明确授予的套餐额度调用模型，保留独立 OpenAI API Key 作为另一种可选支付路径。** 用户登录的是 ChatGPT 账号，Codex 仅用于源码参考；333 没有依赖 Codex 登录服务。

已核验以下官方文档：
- 开源客户端登记与授权：https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- 账号与会话：https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- 模型与推理：https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- Token 参考：https://developers.openai.com/siwc/token-sharing-open-source/token-reference
- 错误恢复：https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery
- Preview 能力限制：https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- Codex app-server 的 SIWC 配置：https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server

同日上传的 Codex 源码 `codex-main.zip` 已实际解压核查：
- `codex-rs/login/src/server.rs`
- `codex-rs/login/src/auth/manager.rs`
- `codex-rs/login/src/token_data.rs`
- `codex-rs/login/src/oauth/authorization.rs`
- `codex-rs/protocol/src/auth.rs`

## 结论：身份相同，客户端注册和 API 约束有明显差别

Codex 内置登录同样使用 ChatGPT 身份体系，但其 Codex 产品客户端包含自己预设的登录参数、客户端 ID 与后端协议。上面 Codex 源码的常见内置登录路径为 `/oauth/authorize`、固定注册 ID 和产品特定权限，例如 `api.connectors.read`、`api.connectors.invoke`；其内部后端路由也有独立身份上下文。直接将这些参数替换进 333，会破坏官方开放式 SIWC 客户端约定。

333 正确选用 OSS SIWC 动态注册：`/api/accounts/authorize`、首次 `client_id=dynamic_agent_client`、返回并持久化 `oaiapp_...` 签发 ID、`ext_agent_host_id`、`resource=https://api.openai.com/v1`、`chatgpt.tokens.use.direct`。模型推理由 `POST /v1/responses` 完成。**官方明确要求通过公共 API，不得改为 ChatGPT 私有 backend-api。**

Codex 同时支持由宿主传入 SIWC Token 并配置公有 Responses provider 的 app-server 模式；这是兼容 SIWC 的另一种集成路径，333 已经拥有 Agent 引擎，因此直接使用 Responses API 更简单。

## 逐环节验收契约

| 环节 | 333 生产文件 | 官方要求 | 当前实现状态 |
|---|---|---|---|
| Host 身份 | `src/services/auth/chatgptOAuth.ts` | 同一安装持久化稳定 `ext_agent_host_id` | 已接入 |
| OAuth 开始 | 同上 | 每次随机 state、nonce、PKCE；回环 `127.0.0.1`，同一路径 `/auth/callback` | 已接入 |
| 动态注册 | 同上 | 新用户 `dynamic_agent_client`，取回服务器颁发 `client_id`；再使用该 ID 换取 token | 已接入；可恢复中断登记 |
| 回访授权 | 同上 | 复用已签发客户端 ID，验证回调与签名；可带 `id_token_hint` | 已接入 |
| ID Token | 同上 | 校验签名、iss、aud、exp、nonce；以已验证 sub 和客户端 ID 标识注册 | 已接入；可选 workspace claim 仅供增强区分 |
| 套餐权限 | 同上 | 依据 `chatgpt.tokens.use.direct` 判断；拒绝时保留身份登录、关闭套餐推理 | 已接入 |
| 账号存储 | 同上 | 每个签发 ID 独立保存令牌、保护文件权限、换账号不覆盖原账户 | 已接入 |
| 刷新 | 同上 | form-encoded refresh，序列化刷新、保存新 refresh token | 已接入 |
| 永久刷新失效 | 同上 | `invalid_grant` 等清理当前用户失效凭据，保留签发 ID，重新授权 | **本次修复** |
| 临时刷新故障 | 同上 | 503、连接失败应保留凭据 | **本次增加实证回归** |
| 授权降级 | 同上 | 有有效身份但无套餐权限时，保留身份、禁用套餐调用 | **本次补齐刷新成功但权限消失的持久化** |
| 模型目录 | `multimodel/registry.ts`、`catalog.ts` | 同一 OAuth token 获取 `/v1/models`，优先可见模型条目；模型目录仅用于选择 | 已接入；成功推理才是可用性确认 |
| 推理协议 | `multimodel/transport.ts` | `/v1/responses`, `store:false`, `stream:true`, `input` 保存必要历史；本地函数通过 additional_tools | 已接入 |
| 流事件 | 同上 | 只有 `response.completed` 为成功，`response.incomplete` 与 `response.failed` 独立处理 | **本次修复并加负例测试** |
| 退出 | `chatgptOAuth.ts` | 根据 OIDC discovery 撤销 refresh token，再清理本地凭据，保留用户注册 | 已接入；撤销失败提示用户 |
| 外部工具 | `multimodel/transport.ts` | SIWC Preview 的 hosted MCP/tool_search 等能力受限，已有 333 本地工具可以通过受支持函数协议执行 | 已接入，真实账号仍待回归 |

## 本次新增测试与门禁

- `tests/chatgpt-oauth-refresh.test.ts`：失效清除、临时故障保留、授权降级后的刷新令牌轮换、正常刷新。
- `tests/multimodel-provider.test.ts`：新增套餐推理输出被截断和限额失败时不误报完成。
- `.github/workflows/independent-models.yml`：在 Linux、Windows、macOS 均纳入新 OAuth Refresh 测试。
- `package.json`：在默认 `test:bun` 和 `test:multimodel` 测试入口纳入新账号测试。

## 证据边界

完成的源码修复和回归测试已提交 PR #19；CI 成败需要按最后提交 SHA 检查。开发仓库的模拟身份/模型响应可以验证序列化、状态机与错误分支，但真正的用户授权、套餐额度、账户政策和实际推理能力，需要使用用户本人的 ChatGPT 账号授权完成真实 `response.completed` 对照。不得通过模拟成功替代真实授权验收。

保持独立 API Key 机制；不恢复已明确移除的模型供应商，也不接入 Codex 专用 OAuth 客户端或私有 backend-api。
