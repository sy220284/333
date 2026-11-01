# Claude Code 2.1.88 全量源码映射研究库

本目录从仓库根目录的原版 `cli.js.map`（SHA-256：`7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657`）**无损提取并索引**。这是独立的只读研究材料，不改变 `src/`、`build/`、发行程序或已启用的功能。

## 目录内容

| 路径 | 数据 |
|---|---|
| `dependencies/node_modules/` | 完整复制映射包含的 2,850 个第三方与内部依赖源码文件；共 316 个包；16,915,042 字节 |
| `dependencies/packages.json` | 各包的源码文件、文件数、字节数和映射源索引 |
| `features/feature-index.json` | 90 种功能开关、引用次数、涉及文件、当前主线编译状态 |
| `features/all-972-references.jsonl` | 972 处 `feature('...')` 引用的原始文件、行、列和周围代码 |
| `environment/variables.json` | 469 个环境变量名称、引用次数与相关文件 |
| `environment/all-references.jsonl` | 1,452 处 `process.env.NAME` 的逐位置引用 |
| `environment/bracket-references.jsonl` | 另外统计的 `process.env['NAME']` 引用：13 个名称、16 处，单独保留以免遗漏 |
| `mappings/mappings.vlq` | 原版映射中完整的 10,951,046 字符 Base64 VLQ 映射正文 |
| `mappings/decoded-segments.tsv.gz` | 解码后的 **2,068,722 条**源码位置映射（完整压缩表，无抽样） |
| `mappings/generated-line-index.jsonl` | 16,666 行生成代码的映射偏移、每行段数 |
| `mappings/coverage.json` | 完整性、生成代码行数和映射覆盖统计 |
| `sources.jsonl` | 4,756 个原始源码文件的顺序索引、SHA-256、字节数和覆盖范围 |
| `summary.json` 与 `MANIFEST.json` | 总数以及所有生成研究文件的哈希清单 |
| `generate.py` | 基于固定原版源码映射的可重复全量提取、校验程序 |
| `ASSESSMENT.md` | 与当前主线的可用性、依赖缺口、启用优先级和限制分析 |

**统计口径：** 2,068,722 是逐段成功解码的真实位置记录数。简单地把逗号和分号都计作一条会把空映射行误算进去，得到略高的估算值。源位置行列以 1 为起点，生成代码列以 0 为起点；`names` 为空。

## 重现与验证

从仓库根目录运行：

```bash
python3 research/claude-code-2.1.88/generate.py --verify
```

程序从原始 `cli.js.map` 再次完整提取并解码，在内存中逐个核对 Git 中的依赖源码、索引和映射文件，**不会修改已提交数据**。如需重新生成：

```bash
python3 research/claude-code-2.1.88/generate.py
```

位置数据使用制表符分隔：`generated_line / generated_column / source_index / original_line / original_column`。可以用 `gzip -dc research/claude-code-2.1.88/mappings/decoded-segments.tsv.gz` 查看，`source_index` 对应 `sources.jsonl` 的 `index`。源文件正文已保存在本目录下相应依赖路径；项目自己的 1,902 份源码和 4 份原生适配源码已经位于仓库既有 `src/`、`native/`。

第三方源码来自打包时被保留的具体模块，**不包含完整的 npm 发行包元数据、没有覆盖整个上游包的所有文件**。本目录应当用于代码审计、依赖分析、功能恢复研究；禁止将其当作可独立 `npm install` 的完整项目。
