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
5. 执行 node tools/dev/toolchain.mjs verify-runtime 核实实际 Node/Bun，再运行对应构建与六架构验收。

核心工作流通过 node tools/dev/toolchain.mjs gha-env 注入 GitHub Actions 环境变量，再供 setup-node、setup-bun、setup-python 使用，避免 CI 独立写死版本。

当前标准运行时：Node 26.13.0、Bun 1.4.4、Python 3.12；生产 TypeScript 7.0.2；需要旧式 JavaScript AST 的独立解析器为 TypeScript 5.9.3。

## 离线一致性

Linux/WSL 的 bootstrap 在无 Node 环境仍可以使用生成的 Shell 配置读取版本。已有 Node 时，入口会校验清单与派生配置。离线 Artifact 元数据加入 TOOLCHAIN_LOCK_SHA256，安装时校验权威清单身份；可携带开发工具包会验证清单哈希、npm lock 和归档哈希。

历史兼容测试可能有意使用不同 Node/Python 版本，它们属于测试条件。七条持续维护的开发、构建、依赖治理及发行工作流由权威清单统一约束。

离线 bootstrap 目录独立校验：node tools/dev/toolchain.mjs check-bootstrap。这个模式只核对 bootstrap 自身携带的权威清单、派生环境与 npm 锁，不依赖尚未下载的完整仓库工作流和发行依赖文件；进入源码仓库后再运行完整 check。
