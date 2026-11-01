# 333 独立治理：类型质量与第三方依赖安全

目标：恢复可复现的完整类型诊断证据，按根因修复类型环境与真实源码问题，针对全部实际发行调用链修复高危依赖，确保新旧 CLI 语义保持一致。

治理基线：2.1.88 源码映射恢复项目；原来的公开依赖锁 `build/public-dependencies.lock.json` 保留 Git 历史以便复核。构建/CI 应持续验证锁文件与清单一致。

## 证据收集

`.github/workflows/governance-audit.yml` 在每个 PR 变化后生成 Artifact `333-governance-evidence`，包括全量 TypeScript 逐条诊断、按错误码/文件/共同文本分组和 npm 审计的所有公告及依赖传播路径。

## 安全边界

- 发行包与工作区 npm 安装依赖可能不同；最终需检查 `dist/cli.js` 内真实依赖及条件分支。
- 对于 Zod v3 和 v4 混用，必须验证解析结果、默认值、错误路径、MCP/DXT 清单、沙盒配置与 API JSON Schema。
- 对于 Sharp，必须验证图像/PDF 降采样和平台原生组件。
- 对于 OpenTelemetry，必须验证 Prometheus HTTP、OTLP HTTP/GRPC 组合。
- 对于 tmp，必须逐层检查 MCPB → Inquirer → editor → tmp 的运行入口以及恶意路径处理。
- 审计工作流保留报告不表示漏洞已修复；最后应以高危告警为零和跨平台行为回归为验收依据。

## 实际类型诊断根因

首次运行获得 1786 条错误，分布于 623 个源文件；其中 TS2307 缺少模块 787 条、TS2339 属性缺失 333 条、TS2304 名称缺失 177 条、TS2367 字面量比较 103 条、TS2305 导出缺失 89 条、TS2868 Bun 名称缺失 59 条。

第一轮结构修复：使用官方 @types/bun 1.4.4、按构建定义精确声明 MACRO 常量、ES2023 标准库。其余问题保留每项诊断和原因，不用任意 any 或忽略指令掩盖。

## 真实缺失源码的治理

CI 现从完整 TypeScript 诊断恢复具体导入路径，并与旧版 `cli.js.map` 的 `sources`、`sourcesContent` 核对，保存 `missing-sources.json`。
优先恢复有明确源文件与原始内容的模块；对于源映射无法恢复的纯类型模块，需要按照实际调用契约重建并编写行为测试，严禁空模块、任意 `any` 或忽略指令掩盖错误。
治理关单检查对全量 TypeScript 非零错误明确失败，避免历史兼容门禁被误当成完整验收。
