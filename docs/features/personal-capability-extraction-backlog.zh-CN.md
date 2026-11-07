# 个人版功能增强：企业能力可复用清单（待分配）

> 状态：**待分配／未实施**；本文仅完成源码能力评估和拆解。原始企业代码在历史提交 [`5c2352a7848e8547f879cabb43e94754f9bd8cea`](https://github.com/sy220284/333/tree/5c2352a7848e8547f879cabb43e94754f9bd8cea) 可追溯，后续可按模块提取实现，避免将已退役企业入口带回个人版。

## 评估基线

- 基线：PR19 源码提交 `5c2352a7848e8547f879cabb43e94754f9bd8cea`。原 PR20 已关闭且用于 README 品牌重写，此清单由新的独立 PR 承载。
- 个人版已具备：多模型直连和模型选择；会话级预算参数及费用估算；本地工具审批、沙盒/MCP 规则；按项目持久化任务与桌面任务恢复；本地诊断。
- 缺口核心：**分层预算、跨 Agent 模型路由、可复用任务权限模板、自有机器执行池、跨会话统一审计**。已有的基础能力不重新造轮子。
- 产品边界：本地优先；用户主动选用 API/自有服务；不引入企业 OIDC、PostgreSQL 常驻网关、远程组织策略、收费席位和外部遥测依赖。
- 任务默认负责人：**待分配**；各任务可以独立评审与验收；不要将“已登记”误当作“已实现”。

## 待分配任务

### PERSONAL-001｜按项目／智能体分层硬预算与流式计费

- **优先级**：P0；**责任人**：待分配；**状态**：待分配；**依赖**：现有个人版代码与单项测试。
- **现有能力**：src/main.tsx 已支持单次会话 --max-budget-usd；src/utils/modelCost.ts 和 src/services/api/multimodel/pricing.ts 已支持模型费用估算与用户本地价格配置；src/commands/cost/cost.ts 已支持查看当前费用。
- **待补强缺口**：缺少跨会话的项目、智能体、模型分层预算，以及并发任务原子扣额与超额阻断。
- **原始可复用源码（固定提交）**：[`src/cli/gateway/gatewaySpendMeter317.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/gateway/gatewaySpendMeter317.ts)、[`src/cli/gateway/gatewaySpendStore317.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/gateway/gatewaySpendStore317.ts)、[`src/cli/gateway/gatewayAdmin317.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/gateway/gatewayAdmin317.ts)。
- **建议落地方式**：把请求前额度检查、SSE token 最终计费、日周月预算及失败状态抽象为个人本地存储的 budget engine；保留用户设置、手动解锁/重置，支持跨会话；移除组织/RBAC/管理员接口、PostgreSQL 强依赖和 Anthropic 专用头。
- **验收标准**：1. 同一项目多个并发 Agent 不得突破预算上限；额度达到时在模型发请求前拒绝并给出可操作提示；2. 含流式中断、缓存 Token、不同模型单价和跨周/月边界的计费测试；3. 没有后台企业服务、组织账号或网络遥测时仍可工作。

### PERSONAL-002｜按智能体／任务设定模型选择和故障降级

- **优先级**：P0；**责任人**：待分配；**状态**：待分配；**依赖**：现有个人版代码与单项测试。
- **现有能力**：src/services/api/multimodel/registry.ts 和 providerFields.ts 已支持独立模型及官方字段适配；src/commands/model/model.tsx 已支持交互选模型；src/services/desktop/gateway.ts 已公开模型/Agent 入口。
- **待补强缺口**：个人版需要将模型选择落到每一个 Agent/任务，而不依赖统一企业网关和额外转换代理。
- **原始可复用源码（固定提交）**：[`src/cli/gateway/gatewayConfig317.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/gateway/gatewayConfig317.ts)、[`src/cli/gateway/gatewayForward317.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/gateway/gatewayForward317.ts)、[`src/cli/gateway/gatewayProviders317.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/gateway/gatewayProviders317.ts)。
- **建议落地方式**：将企业网关的模型映射/候选选择规则提炼为本地可配置的 Agent 模型档案，复用现有多模型 transport 和能力探测，按权限、成本、上下文和可用性选择候选与降级序列；模型 API Key 继续保存在本地凭据库。
- **验收标准**：1. 用户可对主智能体、子智能体、团队成员分别配置首选模型和备选模型；2. 能力不足或超出预算时显示原因并按明确规则切换，禁止偷偷改走其他服务商；3. CLI、桌面端和恢复会话取得同样的模型决策结果。

### PERSONAL-003｜个人智能体／项目权限模板与强制继承

- **优先级**：P0；**责任人**：待分配；**状态**：待分配；**依赖**：现有个人版代码与单项测试。
- **现有能力**：src/services/conversation/toolAuthorization.ts 已处理 CLI/SDK/桌面审批；src/services/mcp/config.ts 已包含 MCP allow/deny 与本地重连审查；src/utils/settings/types.ts 已提供允许/拒绝规则和插件/Hook 配置。
- **待补强缺口**：不同智能体重复配置审批权限；缺少可选择的个人安全模板及跨任务强制继承证据。
- **原始可复用源码（固定提交）**：[`src/cli/gateway/gatewayManaged317.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/gateway/gatewayManaged317.ts)、[`src/utils/settings/mdm/settings.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/utils/settings/mdm/settings.ts)。
- **建议落地方式**：保留已有本地权限执行链，把企业层叠合并和禁止降权的原则转为个人项目级模板；继承优先级清晰，用户在本机管理模板，子智能体不得扩大任务的文件/工具权限。
- **验收标准**：1. 按项目、Agent、工具/MCP/路径配置模板，且更严格的父任务权限不会被下级放宽；2. 跨 CLI/桌面/SDK 结果一致，已有权限拒绝和沙盒测试无回退；3. 本地配置可导出导入，不依赖组织账号、MDM、远程策略。

### PERSONAL-004｜个人多设备任务执行池（本地或自有机器）

- **优先级**：P1；**责任人**：待分配；**状态**：待分配；**依赖**：现有个人版代码与单项测试。
- **现有能力**：src/services/agentCenter/missionJobs.ts 已有同项目任务队列与领取/终态；src/services/desktop/gateway.ts 已能查询、停止、恢复任务；src/services/conversation/headlessSession.ts 已支持无终端 SDK 会话。
- **待补强缺口**：现有任务队列主要面向当前本地宿主，跨设备工作分配、设备注册、断线恢复与可观测性仍需个人化。
- **原始可复用源码（固定提交）**：[`src/cli/selfHostedRunner/runnerAdmin317.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/selfHostedRunner/runnerAdmin317.ts)、[`src/cli/selfHostedRunner/runnerHost317.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/selfHostedRunner/runnerHost317.ts)、[`src/cli/selfHostedRunner/orchestrator317.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/selfHostedRunner/orchestrator317.ts)、[`src/cli/selfHostedRunner/endpointPolicy.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/selfHostedRunner/endpointPolicy.ts)。
- **建议落地方式**：提炼 Runner 的心跳、领取、重试、会话/机器管理，接入现有 missionJobs；仅访问用户主动配对的本机/局域网/自有 HTTPS 节点，采用最小权限凭据；按需启动而非内置企业平台服务。
- **验收标准**：1. 单机优先；用户显式添加第二台自有节点后可分配并追踪任务；2. 断电/断线、重复领取、取消、恢复与路径隔离有可重复实测；3. 所有模型凭据与用户项目数据默认留在授权设备，不向官方云上传。

### PERSONAL-005｜本地任务／工具／预算审计时间线

- **优先级**：P1；**责任人**：待分配；**状态**：待分配；**依赖**：现有个人版代码与单项测试。
- **现有能力**：src/services/analytics/localDiagnostics.ts 已有私有本地事件日志；src/utils/telemetry/localMetricsExporter.ts 仅汇总本地数值指标；src/services/desktop/taskJournal.ts 已保存部分任务状态。
- **待补强缺口**：难以在一个界面按项目复盘谁执行了什么、为何拒绝、花费多少以及如何恢复。
- **原始可复用源码（固定提交）**：[`src/cli/gateway/gatewayStore317.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/gateway/gatewayStore317.ts)、[`src/cli/gateway/gatewaySpendMeter317.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/gateway/gatewaySpendMeter317.ts)。
- **建议落地方式**：借鉴企业审计事件结构，将任务、工具审批、失败、预算变动写入本地按项目索引，默认最小元数据，绝不自动记录提示词、密钥、原始工具内容；桌面和 CLI 共用查询。
- **验收标准**：1. 按项目/Agent/时间筛选并关联任务和费用，明确记录拒绝原因；2. 隐私禁用时不写本地诊断；保护文件权限、数据留存和清理可配置；3. 零外部联网、零设备/账号指纹，故障可按事件定位。

### PERSONAL-006｜本地多模型健康检查与统一策略检查页

- **优先级**：P1；**责任人**：待分配；**状态**：待分配；**依赖**：现有个人版代码与单项测试。
- **现有能力**：src/services/api/multimodel/catalog.ts 与 capabilityProbe.ts 已有模型能力信息；src/commands/model/model.tsx 和 src/services/desktop/gateway.ts 已有模型/状态入口。
- **待补强缺口**：普通用户要在多个命令里逐个检查模型配置、可用性、费用、权限和任务执行机器。
- **原始可复用源码（固定提交）**：[`src/cli/gateway/gatewayConfig317.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/gateway/gatewayConfig317.ts)、[`src/cli/gateway/gatewayDevice317.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/gateway/gatewayDevice317.ts)、[`src/cli/gateway/gatewayForward317.ts`](https://github.com/sy220284/333/blob/5c2352a7848e8547f879cabb43e94754f9bd8cea/src/cli/gateway/gatewayForward317.ts)。
- **建议落地方式**：使用现有模型能力档案及本地配置，设计一页自检：凭据是否存在、模型上下文/工具/图像能力是否确认、预算状态与可执行设备；不移植企业 OIDC 或设备授权。
- **验收标准**：1. 首次配置和切换模型都能显示确定参数、未公开参数与探测失败原因；2. 无模型密钥、离线、欠费、模型权限缺失分别给出可操作提示；3. 全部检测按用户操作触发，避免后台偷偷请求模型与产生费用。

## 清退范围及保护边界

1. 企业专属：统一服务端网关入口、组织身份 OIDC/CRI、设备授权、企业成员/分组强制策略、组织限额与数据库计费、远程企业配置拉取、组织管理员接口，以及依赖这些业务的测试与 CI，按实现依赖清除。
2. 保留个人通用：用户自己设置的本地模型与 API Key、本地 MCP/工具授权、单次预算、本地诊断、个人任务与桌面执行、通用模型 provider 适配；个人版增强按上述任务重建。
3. 自托管 Runner 的个人使用价值较高，先在历史源码定位可移植的执行、心跳、重试原语。企业管理协议仍应与个人执行链分离。
4. 本清单必须随删除操作以前的 Git SHA 保留永久引用，避免以后反复从反编译包寻找原实现。

## 分配顺序

P0 优先：PERSONAL-001 → PERSONAL-002 → PERSONAL-003；之后 PERSONAL-004、PERSONAL-005、PERSONAL-006 可按实际需要并行排期。实际排期以用户后续明确指令为准。
