# M1 / F034 NotebookEdit：2.1.310 目标源码实证与真实链路验收

## 取证来源

- 原始来源：资料库 `/反编译/Claude-Code-2.1.310-Linux-x64-完整反编译包.tar.zst`。
- 包内文件：`package/04_逐模块可阅读JavaScript/chunk-j0tbz6ra.js`，解出文件 SHA-256：`88fc270754ef1e97387c35238cef2bf32176a850e7406f318abbcf7b12693019`。
- **纠正旧错误锚点**：原任务索引中的 `chunk-j0tbz6ra.js:52347` 是权限判定说明中的编辑操作文字，不能作为 Notebook 工具实现来源。
- 真实锚点：`58095–58097` 为最大文件长度、Notebook 数据格式和 `cell-N` 解析；`58154–58192` 为 Read 将 cell source 和输出转为用户可见内容；`83810–83828` 为 NotebookEdit 正式 Schema 与工具入口；`83828–83868` 为权限/格式/旧快照/单元格定位；`83868–83965` 为 Notebook 原位修改、恢复旧内容、最大写入检查及写入后的状态登记。

## 本次从目标版直接核实的行为

1. Read 在会话中读取过 Notebook 才允许编辑，编辑后的再次 Read 必须显示更新内容。
2. 当单元格有真实 `id` 时优先使用真实 ID，否则允许按 `cell-N` 索引；insert 插入在指定单元格后，无 ID 时插入首位。
3. 目标版输出 `old_source`：替换/删除时回传原单元格源代码；插入后为空。代码单元格修改后清除旧输出和执行次数。
4. nbformat 4.5+ 插入单元格使用 `randomUUID().slice(0, 8)` 形式的八位 ID；早期版本允许无真实 ID。
5. 目标版限制 Notebook 读入和修改后输出均为 104857600 字节；对无效 cell source 内容拒绝修改。
6. 目标版写入由按路径串行机制与可重复检查的文件读写操作包裹；必须在后续关单中复验并发编辑、符号链接、非普通文件、文件历史及失败恢复。
7. 目标版允许 `metadata` 缺失，仅要求 `cells` 为数组、每个 cell 的 `source` 为字符串或字符串数组；本轮按这一真实格式条件调整初步验证。

## 333 的实际代码修复与测试

- 正式工具入口仍为 `src/tools/NotebookEditTool/NotebookEditTool.ts`，通过 `notebookMutation.ts` 共享校验与实际修改逻辑。
- 恢复 `old_source`，统一真实单元格 ID 与索引解析，使用八位 ID；校验源格式，覆盖代码/Markdown 类型转换后的冗余字段清理。
- 引入 100 MiB 文件大小限制，先检查源文件大小、再解码 Notebook；输出内容按编码及 CRLF 换行后字节数限制。
- 文件历史写入前后均检测旧快照是否过期，失败回传错误，避免正常情况下覆盖较新文件。
- `tests/notebook-edit-parity.test.ts`：真实格式、字段、顺序、旧内容、目标 ID、错误路径。
- `tests/notebook-edit-write-integration.test.ts`：真正运行 `NotebookEditTool.call` 改写磁盘文件和恢复。
- `tests/notebook-read-edit-integration.test.ts`：真正通过 `FileReadTool.call` → `NotebookEditTool.validateInput/call` → `FileReadTool.call`，验证旧缓存不得掩盖新内容。
- `.github/workflows/m1-sed-preview-parity.yml`：Linux/macOS/Windows 执行专用测试与逐文件 Biome，Linux/macOS 额外运行 GNU/BSD sed 真实文件差分。

## 准确状态

`F034` 已找到目标实现及实际消费者，部分合同有 333 修改和跨平台测试，可登记为 **CONTRACT_CONFIRMED + IMPLEMENTED + INTEGRATED + TESTED（所列子合同）**。最后的 M10 **ACCEPTED** 必须等目标版正式可执行程序同条件回归与锁/权限/软链/异常路径差分完成后签署；所有分支覆盖不能只依据此项新增测试认定完结。

此文记录可复跑的目标源码锚点和验收范围；状态统计以每次实际 GitHub Actions 通过结果为准。
