# Source Extraction Notice

This directory contains the source code of `@anthropic-ai/claude-code@2.1.88`, extracted from the published npm package's source map (`cli.js.map`).

## How the source was obtained

```sh
npm pack @anthropic-ai/claude-code@2.1.88
tar xzf anthropic-ai-claude-code-2.1.88.tgz
# Extract sources from cli.js.map into src/ and native/
node -e '
const fs = require("fs"), path = require("path");
const map = JSON.parse(fs.readFileSync("cli.js.map", "utf8"));
for (let i = 0; i < map.sources.length; i++) {
  if (map.sourcesContent[i] == null || map.sources[i].includes("node_modules")) continue;
  const rel = map.sources[i].replace(/^\.\.\//g, "");
  const out = rel.startsWith("vendor/")
    ? path.join("native", rel.slice("vendor/".length))
    : rel;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, map.sourcesContent[i]);
}'
```

## Usage

The bundled `cli.js` is self-contained and runs directly with Node.js >= 18:

```sh
node cli.js --version          # 2.1.88 (Claude Code)
node cli.js --help             # show all options
node cli.js -p "hello world"   # non-interactive one-shot
node cli.js                    # interactive REPL
```

Or install globally / symlink:

```sh
npm install -g @anthropic-ai/claude-code@2.1.88
# or
ln -s "$(pwd)/cli.js" /usr/local/bin/claude
```

## 独立源码重建（333 工程）

本仓库已经建立直接从 `src/entrypoints/cli.tsx` 构建 CLI 的流程。
原始 `cli.js` 仅用于基线对照和提取缺失的发行资源，不进入新程序的构建或运行链路。

**环境：** Node.js 18+、Bun 1.4.4+、Git 和 npm。构建时需要网络下载公开依赖；后续由 `build/public-dependencies.lock.json` 固定版本及完整性校验。

```sh
git clone https://github.com/sy220284/333.git
cd 333
git switch rebuild/bun-from-src
npm run rebuild
bun dist/cli.js --version
node dist/launcher.cjs --help
npm run test:parity
npm run test:release
```

执行 `npm run rebuild` 会校验原版技能资源、从 `cli.js.map` 还原冻结依赖快照、按锁文件安装完整 npm 依赖、编译 `src/` 并生成包含平台二进制资源的 `dist/` 发行目录。
`dist/integrity.json` 保存发行文件的 SHA-256 校验清单。CI 验证原版与重建版公开命令和参数是否一致。

**当前边界：** 从源代码重建并通过版本号、CLI 帮助、公开参数差分与发行文件完整性验证；涉及账户鉴权、真实模型请求、原生平台能力和全面端到端行为的验收另行核对。原代码中存在只有特定编译功能开关才能启用的内部功能；构建时严格拒绝无法实现的禁用模块残留。

## Directory layout

```
src/               # 1,902 个提取的 TypeScript / TSX 应用源码文件
native/            # 4 个原生模块 TypeScript 适配文件
vendor/            # macOS / Linux / Windows 预编译辅助程序
build/             # 依赖恢复、独立编译、发行打包与版本锁
tests/             # CLI 原版差分和独立发行完整性验收
.github/workflows/ # GitHub Actions 自动编译与验收
dist/              # 新版独立发行产物，按需生成（不入库）
cli.js             # 2.1.88 原发行可执行文件，仅供行为基线
cli.js.map         # 2.1.88 原始源码映射与冻结依赖数据
sdk-tools.d.ts     # 发布版 SDK 类型声明
package.json       # 构建命令及原版包元数据
bun.lock           # 原始发布文件的 Bun 锁
README.md          # 本文档
LICENSE.md         # Anthropic 原始法律与许可告知
```

---

# Claude Code

![](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square) [![npm]](https://www.npmjs.com/package/@anthropic-ai/claude-code)

[npm]: https://img.shields.io/npm/v/@anthropic-ai/claude-code.svg?style=flat-square

Claude Code is an agentic coding tool that lives in your terminal, understands your codebase, and helps you code faster by executing routine tasks, explaining complex code, and handling git workflows -- all through natural language commands. Use it in your terminal, IDE, or tag @claude on Github.

**Learn more at [Claude Code Homepage](https://claude.com/product/claude-code)** | [Documentation](https://code.claude.com/docs/en/overview)

<img src="https://github.com/anthropics/claude-code/blob/main/demo.gif?raw=1" />

## Get started

1. Install Claude Code:

```sh
npm install -g @anthropic-ai/claude-code
```

2. Navigate to your project directory and run `claude`.

## Reporting Bugs

We welcome your feedback. Use the `/bug` command to report issues directly within Claude Code, or file a [GitHub issue](https://github.com/anthropics/claude-code/issues).

## Connect on Discord

Join the [Claude Developers Discord](https://anthropic.com/discord) to connect with other developers using Claude Code. Get help, share feedback, and discuss your projects with the community.

## Data collection, usage, and retention

When you use Claude Code, we collect feedback, which includes usage data (such as code acceptance or rejections), associated conversation data, and user feedback submitted via the `/bug` command.

### How we use your data

See our [data usage policies](https://code.claude.com/docs/en/data-usage).

### Privacy safeguards

We have implemented several safeguards to protect your data, including limited retention periods for sensitive information and restricted access to user session data.

For full details, please review our [Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms) and [Privacy Policy](https://www.anthropic.com/legal/privacy).
