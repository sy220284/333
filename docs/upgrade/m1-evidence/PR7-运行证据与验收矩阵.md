# PR7 运行证据与正式验收分离机制

目标：102 项能力、84 个端到端场景逐项建立“源码入口 → 执行结果 → 官方 2.1.310 x64 同场景差分 → 验收状态”的可追踪关系，避免把文档、测试数量或静态接线误当作功能完成。

**唯一的正式验收状态来源**：`docs/upgrade/upgrade-coverage.json`。新增 `verified-runtime-evidence.json` 只登记可复查的单项测试及未覆盖边界；`runtime-acceptance-matrix.json` 由脚本生成。代码按功能编号关联，不推断其余能力已通过。

运行：`node build/m1-evidence/generate-runtime-acceptance.mjs`；校验：`node build/m1-evidence/generate-runtime-acceptance.mjs --check`。校验检查总数、无效能力编号、无效场景关联、证据来源和生成产物的一致性。

现有证据起点：F032 Bash sed -i 实际写回测试及三平台 CI；F034 Notebook 官方 x64 E41 读取→编辑→读取、候选版 E41 与三平台 CI。两项仅专项验证，不将全功能状态由 `UNVERIFIED` 改为完成。Monitor、Workflow、ListAgents、无障碍终端及剩余功能须补官方 x64 真实同条件运行证据后逐条签收。

当前总验收卡点：运行时缺失契约、完整类型检查、异常/取消/断连/恢复场景，以及 102 项与 84 场景的 M10 最终逐项回归。历史 440 条诊断与 76 项缺失契约对应此前提交，后续需按新提交 CI 实数更新。
