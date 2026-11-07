# 333 PR #19：ChatGPT 账号授权与 Codex 源码、OpenAI 官方文档核对（2026-11-06）

## 结论

333 的 `chatgpt/` 表示使用用户自己的 **ChatGPT 账号**完成 Sign in with ChatGPT 授权，可选地获准消耗其 ChatGPT 套餐用量。登录后使用官方公开 `https://api.openai.com/v1/models` 与 `POST https://api.openai.com/v1/responses`。不复用 Codex 内建 OAuth 客户端，也不使用 `chatgpt.com/backend-api/codex`。独立 `openai/` 仍使用用户自己的 API Key。

Codex CLI 也允许 ChatGPT 账号登录，但它的客户端令牌用途、OAuth 参数和后台入口专属于 Codex 产品。应参考它的 PKCE、安全刷新、账号隔离、断连恢复设计，不能直接复制其 `/oauth/authorize`、`/oauth/token`、`api.connectors.*` 授权字段或其专属后台。

## 源码证据

用户 2026-11-06 上传的 `codex-main.zip`：
- `codex-rs/login/src/server.rs`：`{issuer}/oauth/authorize`、`openid profile email offline_access api.connectors.read api.connectors.invoke`、Codex 专用 `codex_cli_simplified_flow` 等参数；
- `codex-rs/login/src/auth/manager.rs`：内建刷新入口 `https://auth.openai.com/oauth/token`；
- `codex-rs/model-provider/src/chatgpt_base_url.rs`：Codex 原生默认 `https://chatgpt.com/backend-api/`；它不属于 333 独立 OAuth 路线；
- `codex-rs/login/src/oauth_session_request.rs`：请求绑定授权身份、401 后有界刷新恢复，可借鉴。

333 PR #19：
- `src/services/auth/chatgptOAuth.ts`：动态 `client_id=dynamic_agent_client`、`ext_agent_host_id`、浏览器 PKCE、OIDC ID Token 验证、独立注册 `client_id`、刷新与失效处理、多账号、注册保存、退出后保留注册。
- `src/services/api/multimodel/registry.ts`：`chatgpt/` 走公开模型目录，并按官方 `models[] / visibility=list / slug` 显示套餐授权可见模型；`openai/` 保持普通 API Key 目录的 `data[] / id`。
- `src/services/api/multimodel/transport.ts`：`POST /v1/responses`、OAuth Bearer、`store:false`、`stream:true`，客户端工具通过 `additional_tools` 输入项发送。
- `src/services/api/client.ts`：同一模型客户端跨请求及令牌刷新绑定到同一账号注册身份，检测切换并要求重新建立客户端。
- `tests/chatgpt-oauth-accounts.test.ts`、`tests/chatgpt-oauth-refresh.test.ts`、`tests/multimodel-provider.test.ts`：对应动态注册、多账号、撤销、目录、协议及失败场景。

## OpenAI 官方规范（2026-11-06 检索）

1. [开源用户登录与动态注册](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)：新注册使用 `dynamic_agent_client`，授权后保存签发的客户端 ID；固定主机标识；验证签名、issuer、audience、nonce 和授权范围。
2. [账户与令牌管理](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)：多账户独立保存，退出时撤销刷新令牌并保留注册；同一会话序列化轮换。
3. [模型与推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)：模型目录 `models[]`、`visibility=list`、`slug`；调用 `POST https://api.openai.com/v1/responses`。
4. [预览能力边界](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)：HTTP 流式、`store:false`、`stream:true`；不支持的请求字段和服务端工具需在客户端过滤。
5. [错误与恢复](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)：区分身份/额度/套餐授权/账号策略/服务暂时不可用，保留请求标识，避免 401/403/429 无意义重复登录。
6. [Codex app-server 的第三方 ChatGPT 账号用法](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)：通过该开源 OAuth 获得的凭据也可配置 Codex app-server 使用公开 Responses API，无须冒充 Codex 身份。

## 适配差异和本次修复

- 源码原有 `chatgpt/` 目录兼容普通 API Key 的 `data[]` 及无 `visibility` 的模型条目，无法据此确认该 ChatGPT 账号是否获准显示这些模型。已更改为严格按官方 `models[]`、`visibility=list`、`slug` 选择；对 `openai/` 的 API Key 模型发现保留其原格式。相应正反例已加入 `tests/multimodel-provider.test.ts`。
- 当前工作区隔离同时使用签发的 `client_id` 与已验证身份；Codex 风格的可选 workspace claim 是附加信息。实际独立授权权限以签发的注册 ID 和当次 `scope` 为准。
- 本次没有把 Codex 专属 `/oauth/*` 登录、`backend-api` 请求或 `api.connectors.*` scope 混入 333。

## 验收区分

- 模拟测试：检查注册、PKCE 状态、签名、双账号分离、退出/刷新、模型目录、正式 Responses 流式工具等。以每次最新 SHA 的 CI 结果为准。
- 真正账户验收：需要用户通过系统浏览器完成自己的 ChatGPT OAuth 授权，然后分别执行可见模型列表、首轮流式推理、工具回合、账号切换、到期刷新、额度不足与断连场景；不可用静态源码检查代替。
- CI、源码与真实 OAuth 状态独立记录；未运行真实用户账号前，不能宣称已完成真人登录的端到端验收。
