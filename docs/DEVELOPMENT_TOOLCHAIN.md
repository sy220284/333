# 333 开发工具链（沿用 777 的构建产物式安装）

本工具链保留 777 的 **版本锁定、build/full 组件组合、按需检测、分片 Artifact、SHA-256 校验、离线安装与完整自检**，替换掉 Android SDK、Gradle、JDK、Android 模拟器及其镜像。

333 对应的组件：

| 档位 | 组件 | 版本/来源 | 用途 |
| --- | --- | --- | --- |
| build | Node + npm | Node.js 24（内含 npm） | 依赖安装、资源恢复、测试与发行打包 |
| build | Bun | 精确 1.4.4 | 从 src/ 编译 TypeScript/TSX CLI |
| build | npm-public | build/public-dependencies.lock.json | npm ci --ignore-scripts 的完整缓存 |
| build | source-deps | 原始 cli.js.map SHA-256 固定 | 2,850 个依赖源码快照及清单 |
| full | Python | 3.12+ | 研究导出、源码映射只读验收 |
| full | actionlint | 1.7.12 | CI 工作流静态校验 |

运行时版本以 tools/dev/toolchain-versions.env 为唯一入口，组件以 toolchain-components.env 为清单。
仅 Linux/WSL x64 支持离线工具链安装。333 现有 rebuild.yml 继续验证 Linux/macOS/Windows 三平台。

## 实际使用

在仓库根目录执行：

\`\`\`bash
bash tools/dev/ai-toolchain.sh plan build
bash tools/dev/ai-toolchain.sh plan full
\`\`\`

第一次使用，请到本仓库 **Actions → 333 开发工具链 → 最新成功运行** 下载 bootstrap Artifact；按 plan 输出逐个下载缺失的组件 Artifact。如果提示 npm-public 的四个分片，需要全部下载。将下载结果解压成以下结构：

\`\`\`text
artifacts/
  333-toolchain-npm-public-part-01-latest/component.env
  333-toolchain-npm-public-part-01-latest/payload.part
  333-toolchain-npm-public-part-01-latest/SHA256SUMS
  ...
  333-toolchain-source-deps-latest/payload.tar.gz
  333-toolchain-source-deps-latest/component.env
  333-toolchain-source-deps-latest/SHA256SUMS
\`\`\`

执行离线安装、检查及全套验收：

\`\`\`bash
bash tools/dev/ai-toolchain.sh install build --artifacts-dir ./artifacts --configure-shell
bash tools/dev/ai-toolchain.sh check build
source "$HOME/.config/333/dev-toolchain.env"
npm run verify
\`\`\`

需要源码映射研究核验时安装 full，运行
\`python3 research/claude-code-2.1.88/generate.py --verify\`。

工具链会复用版本匹配的已有运行时和依赖缓存，不联网安装、不修改已有不匹配的根目录 node_modules。Artifact 元数据包含组件身份、架构、版本及冻结锁文件摘要；任一分片缺失、SHA 不符或版本不符都会立即拒绝安装。

## 自动验证

\`.github/workflows/dev-toolchain.yml\` 在工具链相关代码更新时，构建并上传组件，随后使用独立 runner 回装 build 和 full 环境、实际执行源码重建、完整测试及研究数据验收。**没有定时工作流**；现有 rebuild.yml 仍负责三平台功能重建。

工具链缓存仅供匹配当前 333 的冻结依赖快照使用；原始发行 CLI \`cli.js\` 仅用于既有行为对照，工具链不把它作为独立构建程序的一部分。仓库运行构建脚本时，依旧需要本项目自身的源码及发行资源。

## 开发套件 dev

`dev` 包含 `full`，增加独立的 TypeScript 5.9.3、Biome 2.6.3 和 Node/React 类型声明。
这些依赖放在 `tools/dev`，不混入原版 CLI 的冻结发行依赖。
Linux/WSL x64 通过同一 Artifact 安装器离线部署 `dev-tools`；macOS、Windows 可执行
`npm run dev:bootstrap` 安装平台对应的开发二进制，并使用相同的开发检查命令。

```bash
bash tools/dev/ai-toolchain.sh plan dev
bash tools/dev/ai-toolchain.sh install dev --artifacts-dir ./artifacts
npm run dev:verify
npm run dev:watch
npm run dev:typecheck:all
npm run dev:lint:all
npm run dev:security
npm run dev:sbom
```

开发工具说明见 [DEVELOPMENT.md](DEVELOPMENT.md)。
