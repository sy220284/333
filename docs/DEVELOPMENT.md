# 333 开发质量与调试

## 安装及分工

推荐 Node.js 24、Bun 1.4.4、Git；Linux/WSL x64 离线使用 `bash tools/dev/ai-toolchain.sh install dev --artifacts-dir ./artifacts`。
macOS/Windows 先安装 Node 和 Bun，运行 `npm run dev:bootstrap`；构建依赖仍由 `npm run rebuild` 从冻结锁文件恢复。
开发工具单独安装在 `tools/dev/node_modules`，绝不改变 `build/public-dependencies.lock.json`。

## 日常命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev:doctor` | 版本与工具检查 |
| `npm run dev:lint` | Biome 检查变更文件和开发工具脚本 |
| `npm run dev:lint:all` | 全仓 Biome 诊断；用于清理原版源码既有问题 |
| `npm run dev:typecheck` | TypeScript 全项目扫描，阻断发生在本次变更文件中的类型错误，报告既有错误总数 |
| `npm run dev:typecheck:all` | 完整严格类型检查；存在既有错误时明确失败 |
| `npm run dev:coverage` | Node 内建覆盖率检查，当前对新增的开发逻辑设置 90% 行覆盖率门槛 |
| `npm run dev:native` | 检查原生文件头、实际启动 ripgrep、加载音频原生模块 |
| `npm run dev:verify` | 串行执行 doctor、lint、typecheck、coverage、native |
| `npm run dev:watch` | 监听源码改动，重建并刷新发行目录 |
| `npm run dev:format` | 仅格式化本次变更的源码文件 |
| `npm run dev:security` | 联网运行 npm 高风险漏洞审计，失败则报错 |
| `npm run dev:sbom` | 输出依赖 SBOM（CycloneDX） |

## 既有问题与验收口径

333 从发行源码映射恢复了大量 TS/TSX 文件，目前原版部分存在类型诊断问题。
`dev:typecheck` **真实执行全仓 TypeScript 扫描**，所有错误会计数，任何本次变更文件内的诊断都会令检查失败。
历史问题不会被静默清除，可用 `dev:typecheck:all` 获取全量失败详情，后续逐项修复。
同样 `dev:lint:all` 可检查整个仓库的历史规范问题，而日常门禁检查变更代码。

覆盖率目前严格限定在 `tools/dev/quality-core.mjs` 的独立单元测试，不等同于全业务覆盖率。
现有完整 CLI 行为差分仍由 `npm run verify` 与三平台 `rebuild.yml` 承担。

## 调试和平台

VS Code 可使用“333：调试重建 CLI（Bun）”启动配置，它会先执行 `npm run rebuild` 并启用源码映射。
`dev:watch` 监听 src、native、build，合并连续文件变更；任一构建失败都明确输出，下一次变更可继续重试。

开发质量工作流在 Linux、macOS、Windows 上执行版本检查、代码规范、类型诊断、开发工具覆盖率和平台原生模块检查。
Linux 离线安装还通过工具链的 `dev` 档单独验收。
安全检查需要访问 npm 漏洞数据库；已冻结的公开依赖可能存在上游漏洞，必须保存并审核实际报告，不通过删掉依赖掩盖。
