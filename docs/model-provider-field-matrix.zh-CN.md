# 333 远程模型字段适配矩阵（2026-11-06）

本文件记录 PR #19 对各供应商官方 API 文档的适配依据。实际可用模型由账号对应的 \`/models\` 接口发现，不使用固定模型名称清单冒充实时可用性。所有推理服务均通过远程 API，Claude 官方模型继续由 Anthropic SDK 原有链路支持。Gemini 与 xAI/Grok 已按产品要求整体退役，包括通过 OpenRouter 模型名称进行选择的场景。

## 请求字段与模型代际

| 服务商 | 协议 | 模型字段 | 思考与历史 | 其他重要字段 |
| --- | --- | --- | --- | --- |
| OpenAI API | Responses | \`model\`, \`input\`, \`instructions\`, \`tools\`, \`max_output_tokens\` | \`reasoning.effort\`，\`store:false\`，完整回传 \`reasoning.encrypted_content\` | 工具调用 \`function_call\` / \`function_call_output\` 按 \`call_id\` 对齐 |
| ChatGPT 账号 | 授权范围内的 Responses | 动态注册 OAuth，当前账号动态发现可访问模型 | \`store:false\`、流式请求及受授权范围约束的字段 | 账号身份隔离、令牌刷新、避免将账号登录误认为通用 API Key |
| DeepSeek | Chat Completions | \`thinking:{type:enabled/disabled}\`；\`reasoning_effort:low/high/max\` | 工具轮次保留历史 \`reasoning_content\`；思考默认开启 | 思考模式仅接受 \`tool_choice:auto/none\`；仅在非思考模式使用强制工具选择 |
| Qwen（百炼） | OpenAI 兼容 Chat | \`enable_thinking\`；Qwen 3.8 \`reasoning_effort:low/medium/xhigh\` | Qwen 3.8 独立保留历史 \`reasoning_content\`，使用 \`preserve_thinking\` | 3.8 的 \`reasoning_effort\` 与 \`thinking_budget\` 不可同时设置；用量以服务商实际响应为准 |
| Kimi（直供） | Chat Completions | K3/K2.8 使用 \`reasoning_effort\`；K2.6/K2.7 使用 \`thinking\` | K2.x 已开启思考时保留历史，配置 \`keep:'all'\` | K3.1 当前仅允许 \`max\`；特定 K2 版本的强制工具选择需要转换或报告限制 |
| 智谱 GLM | OpenAI 兼容 Chat | GLM-5.3 \`thinking.type=enabled\`；\`reasoning_effort:low/high/max\` | GLM-5.3 禁止关闭思考；GLM-5.1/5.2 的推理档位单独映射 | 默认模型功能以账号实际返回、能力探测和官方文档为准 |
| MiniMax | Chat Completions | M3.1 \`reasoning_effort:low/medium/high/xhigh/max\` | M3.1 始终思考；M3 可使用 \`thinking.type:adaptive/disabled\` | M3.1 \`reasoning_split:true\`、\`max_completion_tokens\`；流式请求请求用量块 |
| OpenRouter | Chat Completions | \`reasoning:{effort}\`，\`include_reasoning:true\` | 原样保存和回传签名/加密 \`reasoning_details\`，分块按索引合并 | 模型标识可含嵌套 \`/\`；选择列表执行 Gemini/Grok 移除策略 |

## 实现位置

- \`src/services/api/multimodel/providerFields.ts\`：统一查询每个模型代际的字段能力以及构建合法供应商参数；复杂特殊字段集中到此处，避免散落于 Agent 业务代码。
- \`src/services/api/multimodel/convert.ts\`：Anthropic 消息语义与 Responses/Chat Completions 的工具、图像、历史推理转换。
- \`src/services/api/multimodel/transport.ts\`：供应商 SSE、流式工具调用、用量与推理详情往返。
- \`src/services/api/multimodel/registry.ts\`：账号授权后的实时模型发现；Gemini、Grok 退役过滤。
- \`tests/multimodel-provider.test.ts\`：字段限制、模型代际和协议往返回归测试。

## 官方依据

- OpenAI Responses： https://developers.openai.com/api/reference/resources/responses/methods/create
- OpenAI 推理续接： https://developers.openai.com/api/docs/guides/reasoning
- DeepSeek Chat Completions： https://api-docs.deepseek.com/api/create-chat-completion/
- DeepSeek 推理与工具： https://api-docs.deepseek.com/guides/thinking_mode/
- Qwen OpenAI 兼容： https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions
- Qwen 新字段公告： https://help.aliyun.com/zh/model-studio/api-compatibility-upgrade-notice
- Kimi 平台： https://platform.kimi.ai/
- Kimi 模型代际字段参考（腾讯云托管 API，需在直供 API 实测确认）： https://intl-sg.tencent-cloud.com/document/product/1300/80635
- 智谱 GLM 5.3 字段参考（百炼托管，同样需直供验证）： https://www.alibabacloud.com/help/en/model-studio/glm-zhipu.md
- MiniMax M3.1 字段参考（百炼托管；直供端点必须实测）： https://docs.bailian.console.aliyun.com/en/model-studio/minimax-api-by-minimax
- OpenRouter 推理跨轮续接： https://github.com/OpenRouterTeam/docs/blob/main/guides/best-practices/reasoning-tokens.mdx
- OpenRouter SSE 与用量： https://github.com/OpenRouterTeam/docs/blob/main/api_reference/streaming.mdx

## 验收门槛

1. 模拟 API：执行 \`bun test tests/multimodel-provider.test.ts tests/independent-local-features.test.ts\`，验证字段映射、重试、安全边界、流式工具多轮和账号隔离。
2. 静态和构建：执行 \`npm run dev:typecheck:all\` 与 \`npm run rebuild\`，检查独立发布文件结构及六平台差异。
3. 真实 API：至少分别以每个供应商的有效 API Key、ChatGPT 授权账号跑两次真实请求（首轮工具调用、第二轮返回工具结果）；验证输出、推理续接、取消、限流、账户隔离、用量与模型发现。
4. 每个模型以其官方能力为准，未知能力维持“待确认”；不将模拟接口结果当作真实请求通过。

## 许可证与来源

独立发行包采用 \`333\` 产品名，移除旧仓库级 \`LICENSE.md\` 和误导性的包级许可字段。原有第三方代码和内嵌资源的权利归属记录在 \`SOURCE_NOTICES.md\`；发行时仍需核查这些材料的实际分发授权，不能仅靠移除许可文件消除相关权利。
