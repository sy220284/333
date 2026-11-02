# Claude API 内置技能：2.1.310 资源与迁移链路

## 来源与变更

- 目标包：资料库 `Claude-Code-2.1.310-Linux-x64-完整反编译包.tar.zst`，SHA-256 `7ea6528d27dd2a6ea05a4a27685616c19e53d9655245e3fb335e2e6d841f9cf9`。
- 资源映射与模型变量来自 `04_逐模块可阅读JavaScript/chunk-7kf9j3c4.js`；命令、模板选择和来源分类来自 `chunk-4wh6grjv.js`。`build/claude-api-2.1.310-manifest.json` 保存 106 个资源的原始位置和校验值。
- 替换 2.1.88 的 26 份旧资料为目标版的 106 份资料（含技能正文）；模型变量与目标版一致。原包中的 Ruby 工具说明以 UTF-16LE 保存，恢复为 UTF-8 后与原版运行时内容逐字核对。
- 内置技能按需解出资料，`/claude-api api-version` 通过 `shared/api-version-migration.md` 进入实际迁移指南。解压失败时不公布半成品目录，下一次调用可重试。

## 实际对照

- 使用安装包内 SHA-256 为 `b73676430af12f97316a798b8371f81d640f90a58bdcb8f3ce56a835bb47df56` 的 Linux x64 原版，与 333 独立构建版分别连接本机模拟模型。
- 两者均完成 `/claude-api api-version` → 生成技能正文及资料目录 → Read 读取迁移指南 → 将读取结果送回模型；读取内容包含目标 API 版本 `2026-10-21`。
- 两者的 **104 份可用运行时资料**逐份比较 SHA-256 一致。第 105 份 `shared/managed-agents-secure.md` 在 333 暂不解出：该子命令依赖的 `ant` 命令安全检查尚未恢复，调用时明确返回不可用。技能正文作为提示词单独加载，不属于这 105 份运行时文件。
- `tests/claude-api-version-parity.test.mjs` 执行上述模型与 Read 往返及资源比较；`tests/bundled-skill-extraction.test.mjs` 验证部分写入失败后可重试及路径越界拒绝；`tests/claude-api-prompt.test.mjs` 验证模板识别和来源分类。
- 可用 `node build/restore-claude-api.mjs --verify --source-dir <解包后的 package 目录>` 重新逐份核对已提交资源与反编译来源。

## 尚待完成

`managed-agents-secure` 的命令检查、完整安全链和正常执行仍需恢复并对照原版；目标版的参数补全、退役模型扫描及其他子命令的独立运行场景仍需核验。本记录只签收上述资源与 `api-version` 读取链路，不将整个 F051 或其他功能标为已完成。
