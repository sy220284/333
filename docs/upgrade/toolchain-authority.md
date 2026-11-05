# 333 工具链权威依赖清单

权威文件：**tools/dev/toolchain.lock.json**。开发、构建、运行时以及离线安装器的版本和完整性信息集中保存在这里。

发行程序的运行依赖继续由 build/public-dependencies.lock.json 管理；docs/upgrade/latest-stable-dependencies.json 保留公共依赖升级版本清单。工具链会核验两者共享的开发依赖版本。

## 统一管理范围

| 范围 | 权威字段 | 应用 |
| --- | --- | --- |
| Node、Bun、Python、actionlint | runtimes | 核心 CI、构建、开发命令与离线工具 |
| TypeScript、Biome、Node/React/Bun 类型 | development.packages | tools/dev/package.json 与 npm package-lock |
| JavaScript AST 分析解析器 | development.typescriptAstParser | 治理扫描、Ink、语言检查，独立于 TypeScript 7 的生产类型检查 |
| actionlint 哈希、源码映射哈希和依赖快照规模 | integrity | 源码完整性和离线 Artifact 验证 |
| build/full 组件与分片参数 | artifacts | 离线打包、校验和重新安装 |

## 变更流程

1. 修改 tools/dev/toolchain.lock.json 中对应版本、哈希或组件。
2. 执行 node tools/dev/toolchain.mjs sync 生成两个 Shell 配置和 tools/dev/package.json。
3. 开发 npm 包版本变动时，执行 npm install --prefix tools/dev --package-lock-only --ignore-scripts --no-audit --no-fund 并提交 tools/dev/package-lock.json。
4. 执行 node tools/dev/toolchain.mjs check；它会检查派生文件、精确 npm 锁、包完整性和七条主 CI 的版本读取方式。
5. 执行 node tools/dev/toolchain.mjs install-ast 安装独立 JS AST 解析器；执行 node tools/dev/toolchain.mjs verify-runtime 核实实际 Node/Bun，再运行对应构建与六架构验收。

核心工作流通过 node tools/dev/toolchain.mjs gha-env 注入 GitHub Actions 环境变量，再供 setup-node、setup-bun、setup-python 使用，避免 CI 独立写死版本。

当前标准运行时：Node 26.13.0、Bun 1.4.4、Python 3.12；生产 TypeScript 7.0.2；需要旧式 JavaScript AST 的独立解析器为 TypeScript 5.9.3。

## 离线一致性

Linux/WSL 的 bootstrap 在无 Node 环境仍可以使用生成的 Shell 配置读取版本。已有 Node 时，入口会校验清单与派生配置。离线 Artifact 元数据加入 TOOLCHAIN_LOCK_SHA256，安装时校验权威清单身份；可携带开发工具包会验证清单哈希、npm lock 和归档哈希。

历史兼容测试可能有意使用不同 Node/Python 版本，它们属于测试条件。七条持续维护的开发、构建、依赖治理及发行工作流由权威清单统一约束。

离线 bootstrap 目录独立校验：node tools/dev/toolchain.mjs check-bootstrap。这个模式只核对 bootstrap 自身携带的权威清单、派生环境与 npm 锁，不依赖尚未下载的完整仓库工作流和发行依赖文件；进入源码仓库后再运行完整 check。

## PR13 升级成果保护（随 PR14 生效）

- 历史基准：`docs/upgrade/pr13-upgrade-protection-baseline.json`。保存 PR13 已合并的 **107 项直接依赖、510 条已安装依赖（含传递依赖）**及 `integrity`、`resolved`；同时保存独立开发工具链的 38 条依赖记录。
- 原始公开依赖锁：`build/public-dependencies.lock.json`；只读历史快照与当前锁分离。任何重新生成锁文件引起的解析来源、完整性哈希或版本变化，都进入变更审批。
- 能力索引：`docs/upgrade/2.1.317-功能与场景源数据.json`，现存 137 个功能编号与 137 个场景编号不得遗漏；20 条主功能链与 366 项增量更新继续沿用既有专项清单，不能仅按数量宣称全部验收。
- MCP v2：锁定 `@modelcontextprotocol/client`、`server`、`core` 的 v2 版本；以现有 `m5-mcp-dual-era`、`m5-sdk-mcp-factory`、`m3-mcp-auth` 实际协议测试保护新版能力。官方 2.1.317 的 v1 行为用于比较用户可见结果，不能直接替换 PR13 的 v2 接口。
- 复用证据：基准记录 PR13 已通过的构建、官方差分、六架构和屏幕阅读器 Actions URL。它们用于判断哪些旧测试可复用；新改动触及的路径，必须按影响面重新运行。

### 固定检查

```bash
node build/check-upgrade-protection.mjs
node --test tests/upgrade-protection.test.mjs
node tools/dev/toolchain.mjs check
```

`toolchain.mjs check` 已包含升级成果保护门禁；每个主线 PR 由 `.github/workflows/upgrade-protection.yml` 再执行工具链契约与 MCP v2 联合验收。中文界面专项读取同一版本清单，避免 Node 22/26 和 AST 冻结解析器版本漂移。

### 确需升级、替换或移除依赖时

先查明原因、识别所有上游调用方、验证新的协议和业务能力覆盖，写入 `approvedChanges` 审批记录。字段为 `scope`、`key`、`before`、`after`、`technicalBasis`、`replacementCoverage`、`tests` 和 `evidence`；证据必须指向实际通过的测试运行。完整锁文件变化还需登记 `release-lock` 记录并说明可复现构建结果。审核通过后保留原始 PR13 基准值，持续检查有意升级后的实际版本；涉及新增直接或传递依赖的变化同样登记。全新批准记录不等同于通过测试，合并仍以当前提交最新 CI 结果为准。
