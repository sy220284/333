# 333｜Claude Code 源码重建与 2.1.317 功能对齐

> **工程性质：** 基于 Claude Code 2.1.88 发行包源码映射建立的非官方 TypeScript/Bun 源码重建工程，当前以官方 2.1.317 为功能对齐基准。
> **状态基准：** 2026-11-05；以仓库最新提交、Pull Request 与 Actions 实际结果为准。

## 工程构成

仓库由五个层次组成，每层有独立的证据与验收入口：

| 层次 | 内容 |
| --- | --- |
| 源码层 | `src/` 下 2.1.88 恢复源码与 2.1.317 对齐实现同树共存；入口 `src/entrypoints/cli.tsx` |
| 对照层 | `cli.js` / `cli.js.map` 为官方 2.1.317 发行程序与源码映射；`research/` 保留 2.1.88 全量映射研究库与 317 原样取证 |
| 资源层 | 官方 2.1.317 的 101 项嵌入资源按 `build/official-embedded-assets-2.1.317.json` 台账登记 SHA-256，入包前逐项校验 |
| 构建层 | Bun 编译 → `dist/` 发行目录（`cli.js` 与 `launcher.cjs`）；构建前校验资源与冻结依赖，运行不依赖官方 `cli.js` |
| 验收层 | `tests/` 回归与差分、`.github/workflows/` 三平台构建、开发质量与升级验收工作流 |

**版本口径：** 默认分支 `main` 的 `package.json` 为 **2.1.317**，六层二十条功能链的对齐实现已合入主线（PR #7，2026-11-05）。功能对齐状态以 `docs/upgrade/` 下的签收记录与实际测试为准；官方 2.1.317 Linux x64 实际行为为最终对照依据。

## 快速开始

建议使用 **Node.js 24、Bun 1.4.4、npm 和 Git**。源码构建按锁定版本恢复公开依赖，首次构建可能需要联网下载；Linux、macOS、Windows 均有 CI 构建验证。

```bash
git clone https://github.com/sy220284/333.git
cd 333

# 校验资源、恢复依赖、从 TypeScript 重建并运行基础回归
npm run verify

# 运行 333 重新构建的 CLI
bun dist/cli.js --version
node dist/launcher.cjs --help
```

更多常用命令：

| 命令 | 作用 |
| --- | --- |
| `npm run rebuild` | 资源校验、冻结依赖恢复、Bun 编译、发行打包 |
| `npm run test:all` | 运行已配置的回归测试（需先生成构建产物） |
| `npm run verify` | 完整重建并执行回归 |
| `npm run dev:bootstrap` | 安装独立开发检查工具 |
| `npm run dev:doctor` | 检查开发环境与工具版本 |
| `npm run dev:verify` | 开发工具的规范、类型、覆盖率和原生能力检查 |
| `npm run dev:typecheck:all` | 全仓严格 TypeScript 诊断 |
| `npm run dev:security` | 依赖安全公告检查；需要联网 |

完整配置、跨平台差异和工具作用见 [开发与质量验收](docs/DEVELOPMENT.md) 与 [开发工具链](docs/DEVELOPMENT_TOOLCHAIN.md)。

### 发行版与对照基准的区别

- **333 重建版**：入口为 `dist/cli.js` 或 `dist/launcher.cjs`；由仓库源码编译生成。
- **官方 2.1.317 对照基准**：`cli.js` / `cli.js.map` 供取证与差分，不是 333 的运行入口。
- **正式 Anthropic Claude Code**：使用其[官方安装与文档](https://code.claude.com/docs/en/overview)。本仓库的构建与官方发行渠道相互独立。

需要在线模型交互、账户授权或外部服务时，还需具备对应可用的认证和运行环境；基础模拟模型测试无法覆盖这些真实场景。

## 六层二十条功能链

功能对齐按六层组织，每条链从用户/系统触发入口到错误、取消、恢复全部接通；优先直接移植官方实现，无法移植时依据官方 x64 真实行为重写：

| 层 | 范围 |
|---|---|
| 构建基础 | 原版资源、依赖、启动、构建/发行 |
| 核心决策 | 模型、提示词/压缩、权限安全 |
| 执行能力 | 工具、Hooks/SDK、CLI、网络 |
| 任务运行 | Agent/团队/后台、会话保存恢复 |
| 扩展能力 | 技能、插件、MCP、Monitor、附件 |
| 用户和云端 | UI、IDE、远程、企业/Runner、外部应用 |

配套机制：

- `build/compare-317.mjs` 自动代码检查；`build/upgrade-coverage.mjs` 功能场景覆盖检查
- 功能与场景基线及签收记录见 `docs/upgrade/`（功能链路签收、场景签收、对齐进度）
- 366 条版本更新作为独立专项追踪，见 [推进方案](docs/upgrade/2.1.317-366条更新功能链路推进方案.md)

## 目录概览

```text
src/                  2.1.88 恢复源码与 2.1.317 对齐实现
native/               原生模块适配
vendor/               平台辅助程序（ripgrep 等）
build/                依赖/资源恢复、编译、校验与打包脚本
tests/                CLI 差分、工具调用、发行与功能回归
tools/dev/            开发工具、环境检测与离线安装
docs/upgrade/         2.1.317 功能链基线、任务卡与签收记录
research/             2.1.88 源码映射研究库与 317 原样取证
.github/workflows/    三平台构建、开发质量及升级验收工作流
dist/                 本地生成的发行产物（不入库）
cli.js / cli.js.map   官方 2.1.317 发行程序与源码映射
```

## 来源、许可与项目边界

本仓库源自 `@anthropic-ai/claude-code@2.1.88` 发行包的 `cli.js.map` 源码映射。原始程序、源映射及恢复的素材仍受其对应权利、许可与使用条款约束，详见 [LICENSE.md](LICENSE.md) 和 [Anthropic 官方条款](https://www.anthropic.com/legal/commercial-terms)。

本仓库为独立研究与重建工程，**与 Anthropic 官方发行版、官方 npm 安装命令及官方问题反馈渠道分开**。上游产品的文档与更新见 [Claude Code 官方文档](https://code.claude.com/docs/en/overview) 和 [官方代码仓库](https://github.com/anthropics/claude-code)。
