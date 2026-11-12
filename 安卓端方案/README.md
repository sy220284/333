# 333 安卓端方案（2026-11-12，V1）

## 目标与边界
基于 333 仓库固定基线 `19a73bc7274832fc1dbff6fb084031537dab51c5`（DeepSeek Harness 官方 `e8f7b93a344964de3dca1ace9e72b6e4d6de87cb`），开发原生 Android 客户端和可独立启动的本机 Host。核心与 GUI 分离：复用 Host Agent/Session/Tools/LLM，不重新写智能体引擎，Android 端采用 Jetpack Compose。保留同一 Remote 协议的本机和远程连接能力。

## 代码审查事实
- GitHub tree：21160 个文件、538 个 packages/*/* 包目录（含不一定独立发布的目录）、apps 1610 文件；本次根据包清单、Remote 实现、Web Client、SDK、启动链和 777 工具链审查。
- Host 可供原生 Client 使用 `POST /api/<namespace>/<method>`、`/api/remote.mux` WebSocket、`/connect` 身份交换、文件二进制上传。
- `packages/api/remotes/src/client/index.ts` 统一装配 30 个 Remote 贡献；`@Remote` 声明才是实际可访问方法。
- 现有 `packages/subprocess/subprocess-local` 与 `packages/sandbox/sandbox-local` 未提供 Android 完整后端；单纯识别 Node 的 `android` 平台不足以运行核心。
- 333 未包含独立 Android Gradle 工程。本目录新增客户端、规范和验收门禁，不扰动上游 TypeScript 主架构。

## 目录
- `docs/01-源码与功能审计.md`：源代码功能与责任划分。
- `docs/02-UI-交互设计.md`：设计 2.4 原则、页面、状态、组件与动态行为。
- `docs/03-安卓架构与独立运行.md`：运行时、认证、安全、文件、终端、MCP 和独立运行的实施合同。
- `docs/04-开发与验收.md`：版本、CI、质量、测试矩阵、交付定义。
- `docs/05-777-工具链迁移.md`：777 源版本、可复用能力、不可照搬的约束。
- `contracts/feature-map.json`：入口—Remote—状态—回包—测试追踪。
- `design/`：颜色/字号/尺寸/组件与动效设计 Token。
- `assets/icons/`：原创单色 SVG，可转换为 Compose VectorDrawable。
- `android-app/`：独立 Gradle / Jetpack Compose Android 客户端工程。
- `tools/`：固定 777 版本清单与静态校验。
- `../.github/workflows/android-plan-ci.yml`：专门的安卓构建门禁，按目录触发；不改原主线流水线。

## Figma
[333 安卓端完整设计系统与交互方案 V1](https://www.figma.com/design/4jjCSjiLxKQadiiG2gJR3U)。设计文件已建立；因 Starter MCP 限额，画板层尚未写入。本目录 SVG、tokens、页面规格是可落地源数据，不能把空白 Figma 文件当成完成稿。

## 进度口径
版本清单、契约、设计和代码提交后标记“落库”；CI 通过后才标记“可构建”；真实 Android 设备上完成独立 Host 运行、进程管理、模型调用、子进程/沙箱/PTY 与重启恢复后才标记“独立运行完成”。两项由不同证据控制。禁止将远程连接演示当成本机独立运行。
