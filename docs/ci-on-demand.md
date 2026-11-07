# CI 按需检查与 PR 待审验收

## 触发规则

- Draft PR：每次提交通过 `ci-on-demand.yml` 执行基础检查，按受影响文件并行启动专项。已有 28 个专项工作流保留，改由 `workflow_call` 调度。
- Draft → Ready for review：执行所有专项、全量测试矩阵、六宿主发行及原版对照。之后 Ready 状态的新提交继续重新完整验收，保证最新代码被检查。
- Ready → Draft：取消过期全量验收，下次按增量模式运行。
- `main` 分支 push：保留原工作流的主分支检查。原有 `workflow_dispatch` 入口继续可手动运行。
- 同一 PR 的新提交只保留最新调度，所有被取消检查的提交改动由下一次计划累计验收。

## 累计提交与并行处理

`build/ci-impact.mjs` 通过 Actions 运行记录选择最近成功的检查提交作为基线。若连续提交导致前次检查被取消，则回溯首次未完成检查的父提交，并用 `git diff` 合并期间所有改动。首次没有有效基线时从 PR 与主分支的共同祖先重新检查，优先保证无遗漏。

执行计划只由文件路径决定专项：桌面、模型、企业网关、Agent/团队、GitHub、SDK、UI、隐私、Runner、构建、类型迁移等各自独立并行。常规提交跳过六架构、全量分片和官方原版大规模回归；待审查时全部启用。

`ci-on-demand.yml` 统一汇总本次所有已选任务的结果，形成稳定的 `统一验收结果` 检查。各专项保持唯一并发组，避免复用工作流中多个检查互相取消。

## 验证和维护

- `node --test tests/ci-routing.test.mjs tests/ci-test-discovery.test.mjs`
- `node build/ci-gate-audit.mjs`
- 更新专项路径时，同时更新 `build/ci-impact.mjs` 的 `SPECIALISTS`。未知生产代码与测试变更仍会进入通用质量检查。
- 成功验收以**最新 PR 提交**上的 `统一验收结果` 为准。不能直接引用旧提交已完成的结果代替 Ready 状态全量验收。

## 企业网关专项与遥测边界

- `m6-gateway-providers-317.yml` 为独立可复用专项：当 `src/cli/gateway/**`、相关企业策略、M6 网关测试等发生改动时，Draft 阶段立即运行；转 Ready 时与其余专项一并全量验收。
- 协议作业运行网关上游模型、OIDC/设备授权、CRI、预算、SSE、遥测测试；另一个作业启动一次性 PostgreSQL 16 服务，验证设备/凭据/撤销及审计事务。两个作业并行执行，结果统一纳入 `统一验收结果`。
- 企业网关遥测默认 `telemetry.forward_to: []`，不转发到第三方。若管理员显式设置 `logs`/`metrics`/`traces` 目的地，网关将原始请求数据转发到该地址；专项测试验证这一隐私边界与失败审计。外部遥测地址需由部署方主动配置和审查。
- 验证入口：`node --test tests/ci-routing.test.mjs`、`node build/ci-gate-audit.mjs`，以及 CI 中的企业网关协议和 PostgreSQL 作业。
