# M1 / F034 NotebookEdit：2.1.310 目标源码实证与真实链路验收

## 取证来源

- 原始来源：资料库 `/反编译/Claude-Code-2.1.310-Linux-x64-完整反编译包.tar.zst`。
- 包内文件：`package/04_逐模块可阅读JavaScript/chunk-j0tbz6ra.js`，解出文件 SHA-256：`88fc270754ef1e97387c35238cef2bf32176a850e7406f318abbcf7b12693019`。
- **纠正旧错误锚点**：原任务索引中的 `chunk-j0tbz6ra.js:52347` 是权限判定说明中的编辑操作文字，不能作为 Notebook 工具实现来源。
- 真实锚点：`58095–58097` 为最大文件长度、Notebook 数据格式和 `cell-N` 解析；`58154–58192` 为 Read 将 cell source 和输出转为用户可见内容；`83810–83828` 为 NotebookEdit 正式 Schema 与工具入口；`83828–83868` 为权限/格式/旧快照/单元格定位；`83868–83965` 为 Notebook 原位修改、恢复旧内容、最大写入检查及写入后的状态登记。

## 本次从目标版直接核实的行为

1. Read 在会话中读取过 Notebook 才允许编辑，编辑后的再次 Read 必须显示更新内容。
2. 当单元格有真实 `id` 时优先使用真实 ID，否则允许按 `cell-N` 索引；insert 插入在指定单元格后，无 ID 时插入首位。
3. 目标版输出 `old_source`：替换/删除时回传原单元格源代码；插入后为空。代码单元格修改后清除旧输出和执行次数；`83821–83822` 的自动权限分类入口向分类器发送操作类型、单元格 ID、`adds` 或 `ignored_source`，不能返回空值跳过审查。
4. nbformat 4.5+ 插入单元格使用 `randomUUID().slice(0, 8)` 形式的八位 ID；早期版本允许无真实 ID。
5. 目标版限制 Notebook 读入和修改后输出均为 104857600 字节；对无效 cell source 内容拒绝修改。
6. 目标版写入由按路径串行机制与可重复检查的文件读写操作包裹；必须在后续关单中复验并发编辑、符号链接、非普通文件、文件历史及失败恢复。
7. 目标版允许 `metadata` 缺失，仅要求 `cells` 为数组、每个 cell 的 `source` 为字符串或字符串数组；本轮按这一真实格式条件调整初步验证。

## 官方 2.1.310 x64 同场景真实运行（已确认）

使用资料库官方 Linux x64 可执行程序（SHA-256 `b73676430af12f97316a798b8371f81d640f90a58bdcb8f3ce56a835bb47df56`），隔离 HOME/工作目录、禁用遥测，以 localhost 伪造 Anthropic SSE 模型响应并要求真实程序执行四次模型往返：

1. `Read` 读取 `e41.ipynb` 的 `stable-cell`，模型实际收到 `print(1)`。
2. 调用 `NotebookEdit` 将该单元格替换为 `print(2)`，工具真实返回 `Updated cell stable-cell with print(2)`。
3. 再次调用 `Read`，模型实际收到 `print(2)`，没有返回过期的 `file_unchanged`。
4. 模型最终返回测试标记，CLI 退出码 **0**；最终磁盘文件中同一 `stable-cell` 的源内容确实为 `print(2)`。

**注册条件复查**：常规模式下模型首轮可见 `ToolSearch` 与 `DeferredToolPlaceholder`，系统提示明确列出延迟可用的 `NotebookEdit`；简化模式 `CLAUDE_CODE_SIMPLE=1` 会省略该发现机制，直接请求 NotebookEdit 返回不可用。早期将简化模式的失败误当成正式发行包默认禁用，已经通过清除该变量的正例重新验证并纠正。虽然 `chunk-gmxe4kpt.js:663` 有硬编码关闭的 `RU()`，它只影响 `chunk-p8z8s65a.js:4192–4194` 的一条扩展工具装载路径，**不能据此推断正常模式的延迟工具不存在**。

实测摘要见 [`F034-Notebook-官方x64-E41实测.json`](./F034-Notebook-官方x64-E41实测.json)。相同本地假模型/临时文件测试协议已沉淀为 [`tests/m1-notebook-e41-cli.mjs`](../../../tests/m1-notebook-e41-cli.mjs)，可对官方二进制与 333 重建后的 CLI 复跑。**重建版真实验收已通过**：在 [M1 专项 Actions #41435775007](https://github.com/sy220284/333/actions/runs/41435775007) 的 Linux job 中，对独立构建的 `dist/cli.js` 执行相同的 E41 脚本，记录 `passed: true`、`modelRequests: 4`、`sourceBefore: print(1)`、`sourceAfter: print(2)`，且 CLI 退出码为 0。该运行的 macOS/Windows 专项测试也都成功；三平台独立重建见 [#41435774957](https://github.com/sy220284/333/actions/runs/41435774957)，均为 success。

**仍存在注册差异**：官方发行版第一轮模型工具列表包含 `ToolSearch` / `DeferredToolPlaceholder`，NotebookEdit 由延迟发现进入调用；333 当前第一轮直接公开 `NotebookEdit`。本次证据确认了可观察 Notebook 读改读功能链一致，但工具发现的默认顺序和入口差异由在途 PR #7 负责补齐；M10 仍需验证完整权限、回退、符号链接和异常路径。

## 类型切换的官方真实行为补证

在正式 2.1.310 Linux x64 上，仍使用本地模拟模型按 `Read → NotebookEdit → Read` 四次模型往返，新增两个独立正例（真实进程退出码均为 0）：

- **代码 → Markdown**：`print(1)` 改成 `# Hello`，实际文件 `cell_type=markdown`，`execution_count=null`，`outputs=[]`；旧执行字段依然存在。
- **Markdown → 代码**：`# Heading` 改成 `value=1`，实际文件 `cell_type=code`，未生成新的 `execution_count` / `outputs` 字段。

代码规则据此从按转换后的类型处理，改为按转换前的类型先清理旧执行结果，再切换类型。重建版新增两项单元测试，并通过 `M1_NOTEBOOK_E41_MODE=convert` 在独立 CLI 测试中对照第一种转换；**扩展版本的测试状态等待其对应 Actions 结果，不能援引更早提交的通过记录**。

## 333 的实际代码修复与测试

- 正式工具入口仍为 `src/tools/NotebookEditTool/NotebookEditTool.ts`，通过 `notebookMutation.ts` 共享校验与实际修改逻辑。
- 恢复 `old_source`，统一真实单元格 ID 与索引解析，使用八位 ID；校验源格式，对齐官方代码/Markdown 类型转换的执行字段行为：先按原类型处理执行字段，再更换类型；代码转 Markdown 保留并清空旧字段，Markdown 转代码不自动补这些字段。
- 引入 100 MiB 文件大小限制，先检查源文件大小、再解码 Notebook；输出内容按编码及 CRLF 换行后字节数限制。
- 文件历史写入前后检测旧快照，并共享 `Read` 对 Notebook 的实际可见投影，核对正文内容防止相同文件时间戳的外部修改覆盖；通过 `src/utils/notebookFileLock.ts` 将同路径编辑的读取、校验、写入串行处理，失败也释放锁；失败回传明确错误。
- `tests/notebook-edit-parity.test.ts`：真实格式、字段、顺序、旧内容、目标 ID、错误路径、同一文件串行以及不同文件并行、失败后锁释放（15 项）。
- `tests/notebook-edit-write-integration.test.ts`：真正运行 `NotebookEditTool.call` 改写磁盘文件和恢复。
- `tests/notebook-read-edit-integration.test.ts`：真正通过 `FileReadTool.call` → `NotebookEditTool.validateInput/call` → `FileReadTool.call`，验证旧缓存不得掩盖新内容。
- `.github/workflows/m1-sed-preview-parity.yml`：Linux/macOS/Windows 执行专用测试与逐文件 Biome，Linux/macOS 额外运行 GNU/BSD sed 真实文件差分。

- `tests/notebook-edit-write-integration.test.ts` 验证自动分类器的两种正式模式：默认输出可读的编辑摘要，`CLAUDE_CODE_AUTO_MODE_EDIT_REMOVAL` 启用后发送结构化 `adds/ignored_source`；两个分支都参与审查。
- `src/utils/notebookCells.ts` 作为独立、无重型工具依赖的源数据契约，供 Read、NotebookEdit 共同复用。

## 准确状态

`F034` 已找到目标实现及实际消费者，部分合同有 333 修改和跨平台测试，可登记为 **CONTRACT_CONFIRMED + IMPLEMENTED + INTEGRATED + TESTED（所列子合同）**。333 重建版 CLI 的 E41 同场景端到端验收已通过；最后的 M10 **ACCEPTED** 仍需对 ToolSearch 延迟注册、跨工具文件锁/权限/软链/异常路径完成差分验收后签署；所有分支覆盖不能只依据此项新增测试认定完结。

此文记录可复跑的目标源码锚点和验收范围；状态统计以每次实际 GitHub Actions 通过结果为准。
