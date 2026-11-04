# 333｜Claude Code 源码重建与 2.1.317 功能升级

> **工程性质：** 基于 Claude Code 2.1.88 发行包源码映射建立的非官方 TypeScript/Bun 源码重建与升级项目。  
> **升级目标：** 在已有可独立构建的工程上，逐项对齐 Claude Code **2.1.317** 的适用功能、组件资源和实际运行行为。  
> **状态基准：** 2026-11-04；以仓库最新提交、Pull Request 与 Actions 实际结果为准。

## 项目现状

| 范围 | 已核实状态 |
| --- | --- |
| 2.1.88 源码恢复 | 已从 `cli.js.map` 恢复 1,902 份应用源码和 4 份原生适配源码；保留原始程序与源码映射用于取证和差分 |
| 独立构建与发行 | `src/entrypoints/cli.tsx` → Bun 构建 → `dist/` 发行目录；校验文件完整性，运行不依赖原始 `cli.js` |
| 基础功能回归 | 主线已完成 Linux、macOS、Windows 的构建、独立启动和模拟模型文件工具调用回归 |
| 内置资源 | 已恢复 2.1.88 原版 Claude API 技能资源，并建立资源原文校验与入包检查 |
| 开发与质量工具 | 已具备冻结依赖、离线工具链、调试、类型检查、代码规范、安全审计及 CI；历史诊断与依赖风险仍须逐项治理 |
| 2.1.317 功能升级 | **进行中**：升级代码及差分测试主要见 PR #7；尚未完成所有新版能力的端到端验收 |

**版本说明：** 默认分支 `main` 仍以 **2.1.88** 为可构建基线；PR #7 的 `package.json` 已标注 **2.1.317** 目标版本，但完整功能与运行验收尚未签收，不能据此认定已经等价。官方 2.1.317 Linux x64 的已验证样本作为目标对照，2.1.310 原版记录仅供历史溯源。

主线构建验证记录：[源码独立重建验证（2026-11-02）](https://github.com/sy220284/333/actions/runs/41405780294)。这里通过的是该次主线工作流的检查，后续升级的验收要看对应分支与功能用例。

## 快速开始

建议使用 **Node.js 24、Bun 1.4.4、npm 和 Git**。源码构建会按锁定版本恢复公开依赖；首次构建可能需要联网下载。Linux、macOS、Windows 均有相应 CI 构建验证。

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
| `npm run test:all` | 运行已配置的基础回归测试（需先生成构建产物） |
| `npm run verify` | 完整重建并执行基础回归 |
| `npm run dev:bootstrap` | 安装独立开发检查工具 |
| `npm run dev:doctor` | 检查开发环境与工具版本 |
| `npm run dev:verify` | 执行开发工具的规范、类型、覆盖率和原生能力检查 |
| `npm run dev:typecheck:all` | 全仓严格 TypeScript 诊断；历史未清零时会报告失败 |
| `npm run dev:security` | 检查依赖安全公告；需要联网 |

首次使用开发检查命令可先运行 `npm run dev:bootstrap`。完整配置、跨平台差异和工具作用见 [开发与质量验收](docs/DEVELOPMENT.md)。

### 发行版与原始基准的区别

- **333 重建版**：入口为 `dist/cli.js` 或 `dist/launcher.cjs`；由仓库源码编译生成。
- **2.1.88 原始基准**：`node cli.js --version`、`node cli.js --help`；供对照原始发行行为，不是 333 的新版本运行入口。
- **正式 Anthropic Claude Code**：使用其[官方安装与文档](https://code.claude.com/docs/en/overview)。本仓库的构建命令与官方发行渠道相互独立。

需要在线模型交互、账户授权或外部服务时，还需具备对应可用的认证和运行环境；基础模拟模型测试无法覆盖这些真实场景。

## Claude Code 2.1.317 完整实现：六层任务

在 PR #7 内依据官方 2.1.317 的实际函数、状态、权限、消息语义和运行行为升级源码。优先移植原版；无法直接移植或内容缺失时用官方 Linux x64 原版执行验证函数逻辑后重写。每条链从入口到失败/恢复必须真正接通。

| 卡片 | 实现层 | 功能链 |
|---|---|---|
| M1 | 第0层：构建基础 | C19：原版资源、依赖、启动、构建/发行 |
| M2 | 第1层：核心决策 | C01、C02、C04：模型、提示词/压缩、权限安全 |
| M3 | 第2层：执行能力 | C03、C06、C11、C16：工具、Hooks/SDK、CLI、网络 |
| M4 | 第3层：任务运行 | C05、C07：Agent/团队、会话保存与恢复 |
| M5 | 第4层：扩展能力 | C08、C09、C10、C17、C18：技能、插件、MCP、Monitor/附件 |
| M6 | 第5层：用户和云端 | C12、C13、C14、C15、C20：UI、IDE、Remote Control、企业云、外部应用 |

六层共 **20 条完整功能链**。既有 102 功能/84 场景保留为回归检查下限，实际范围包含官方 2.1.317 所有适用的新功能、隐藏入口、跨端链路和异常分支。每张卡的源码候选、对齐策略、真实测试与签收门槛见 [六层总方案](docs/upgrade/2.1.317-六层完整实现升级方案.md)。

另一条 **366 条版本更新专项**独立推进、独立统计。其更新数量和完成情况不用于这六张实现卡签收。

- [PR #7：2.1.317 全功能源码升级与六层实现](https://github.com/sy220284/333/pull/7)：继续核实源码/资源/语义函数，真实 CI 和全部链路验收未正式完成。
- [PR #9：类型与依赖治理](https://github.com/sy220284/333/pull/9)：该分支上的修复须按其各自证据验收。

未合并内容仍以当前 PR SHA 的实际 Actions 和官方/重建版差分为准；旧版历史原始证据保留供技术回溯。

## 文档与复核入口

- [六层完整实现总方案](docs/upgrade/2.1.317-六层完整实现升级方案.md)：20条功能链、六张任务卡和源码/行为/语义验收路径。
- [六层机器链路表](docs/upgrade/2.1.317-六层完整功能链路.json)：M1–M6 对应每层的所有功能链和源码候选。
- [六层严谨验收要求](docs/upgrade/2.1.317-验收规则.md)：官方 x64、移植/语义重写、失败分支、外部宿主和签收证据。
- [功能链验收表](docs/upgrade/2.1.317-功能链路签收.json)：20条链逐条签收，当前静态覆盖不能替代实测。
- [历史功能回归数据](docs/upgrade/2.1.317-功能与场景源数据.json)：原102功能与84场景继续测试。
- [完整实现覆盖快照](docs/upgrade/upgrade-coverage.json)：六层/20链及所有历史功能的责任关联。
- [独立更新专项](docs/upgrade/2.1.317-366条更新功能链路推进方案.md)：366条更新单独跟踪，不纳入本方案的完成统计。
- [源码恢复研究库](research/claude-code-2.1.88/README.md)、[开发工具链](docs/DEVELOPMENT_TOOLCHAIN.md)、[开发质量验收](docs/DEVELOPMENT.md)。

## 目录概览

```text
src/                  原版 TypeScript/TSX 源码及升级中的功能实现
native/               原生模块适配
vendor/               原发行附带的平台辅助程序
build/                依赖/资源恢复、编译、校验与打包脚本
tests/                CLI 差分、工具调用、发行与新增功能回归
tools/dev/            开发工具、环境检测与离线安装
docs/upgrade/         2.1.317 升级目标、功能和场景基线及真实验收记录
research/             2.1.88 源码映射与研究资料
.github/workflows/    三平台构建、开发质量及升级验收工作流
dist/                 本地生成的重建发行产物（不入库）
cli.js / cli.js.map   原始 2.1.88 发行程序及源码映射
```

## 来源、许可与项目边界

本仓库源自 `@anthropic-ai/claude-code@2.1.88` 发行包的 `cli.js.map` 源码映射。原始程序、源映射及恢复的素材仍受其对应权利、许可与使用条款约束，详见 [LICENSE.md](LICENSE.md) 和 [Anthropic 官方条款](https://www.anthropic.com/legal/commercial-terms)。

本仓库为独立研究与重建工程，**与 Anthropic 官方发行版、官方 npm 安装命令及官方问题反馈渠道分开**。上游产品的文档与更新见 [Claude Code 官方文档](https://code.claude.com/docs/en/overview) 和 [官方代码仓库](https://github.com/anthropics/claude-code)。
