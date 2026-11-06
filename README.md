# Reforge（重铸）

基于 Claude Code 2.1.88 发行包源码映射建立的独立 TypeScript/Bun 重建工程，以官方 2.1.317 为功能对齐基准。

## 项目概况

- **源码级重建**：从官方 `cli.js.map` 恢复 1,902 份应用源码与 4 份原生适配源码，构成完全可读、可改、可构建的独立代码基线。
- **独立构建与发行**：`src/entrypoints/cli.tsx` 经 Bun 编译产出 `dist/` 发行目录（`cli.js` 与 `launcher.cjs`），构建前校验资源完整性与冻结依赖，运行不依赖官方 `cli.js`。
- **功能对齐**：按六层二十条功能链对齐官方 2.1.317，每条链从触发入口到错误、取消、恢复全部接通；优先直接移植官方实现，无法移植时依据官方 x64 真实行为重写。
- **资源治理**：官方 2.1.317 的 101 项嵌入资源按台账登记 SHA-256，入包前逐项校验。
- **质量设施**：冻结依赖、离线工具链、类型检查、代码规范、安全审计与 Linux / macOS / Windows 三平台 CI。

## 架构

仓库由五个层次组成，每层有独立的证据与验收入口：

| 层次 | 内容 |
| --- | --- |
| 源码层 | `src/` 下 2.1.88 恢复源码与 2.1.317 对齐实现同树共存；入口 `src/entrypoints/cli.tsx` |
| 对照层 | `cli.js` / `cli.js.map` 为官方 2.1.317 发行程序与源码映射，供取证与差分；`research/` 保留 2.1.88 全量映射研究库 |
| 资源层 | 官方嵌入资源按 `build/official-embedded-assets-2.1.317.json` 台账登记 SHA-256 |
| 构建层 | Bun 编译 → `dist/` 发行目录；构建前校验资源与冻结依赖 |
| 验收层 | `tests/` 回归与差分、`.github/workflows/` 三平台构建与对齐验收工作流 |

### 目录概览

```
├── src/                    应用源码（QueryEngine、commands、services、components、hooks 等）
├── cli.js / cli.js.map     官方 2.1.317 发行程序与源码映射（对照基准，非运行入口）
├── build/                  资源台账与构建配置
├── docs/                   开发、工具链与升级对齐文档
├── research/               2.1.88 源码恢复研究库
├── tests/                  回归与差分测试
├── native/                 原生适配源码
├── vendor/                 冻结依赖
├── tools/                  工具脚本
└── .github/workflows/      构建与验收工作流
```

## 来源与许可

本工程基于官方发行包的公开映射信息建立，用于源码研究与独立重建，不附带官方专有分发许可；第三方来源与权利归属见 `SOURCE_NOTICES.md`。工程构建与官方发行渠道相互独立；正式 Anthropic Claude Code 请使用其[官方安装与文档](https://code.claude.com/docs/en/overview)。
