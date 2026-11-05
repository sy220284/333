#!/usr/bin/env node
/**
 * 历史 2.1.310 及以前变更记录校验：保留原始 Git Blob 身份和 6313 行索引，
 * 供当前 2.1.317 研究基准复用，不影响新版本的行为验收目标。
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = name => JSON.parse(readFileSync(join(root, name), 'utf8'))
const provenance = read('docs/upgrade/m1-evidence/source-provenance.json')
const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--changelog') {
  throw new Error('用法：node build/m1-verify.mjs --changelog /path/to/v2.1.310/CHANGELOG.md')
}
const file = readFileSync(resolve(args[1]))
const blob = createHash('sha1').update('blob ' + file.length + String.fromCharCode(0))
  .update(file).digest('hex')
if (provenance.reference_release !== 'anthropics/claude-code@v2.1.310' ||
    blob !== provenance.official_changelog_blob) {
  throw new Error(`历史官方 CHANGELOG Git Blob 不符：期待 ${provenance.official_changelog_blob}，实际 ${blob}`)
}
const lines = file.toString('utf8').split(/\r?\n/)
const seen = new Set()
let total = 0
for (const group of provenance.change_groups) {
  const data = read('docs/upgrade/m1-evidence/' + group.file)
  if (data.source_blob !== blob || data.indexed_count !== group.count ||
      data.records.length !== group.count) {
    throw new Error(`历史变更索引文件与原始 Blob 不一致：${group.file}`)
  }
  for (const record of data.records) {
    if (seen.has(record.id) || !Number.isInteger(record.source_line) ||
        record.source_line < 1 || record.source_line > lines.length ||
        typeof record.source_text !== 'string' ||
        record.source_text.length !== record.source_length) {
      throw new Error(`历史行索引存在重复、无效长度或越界：${record.id}`)
    }
    seen.add(record.id)
    const original = lines[record.source_line - 1].trim()
    // 同行可能有 Markdown 项目标记，正文必须逐字落在已核验的 Git Blob 中。
    if (!original.includes(record.source_text)) {
      throw new Error(`历史源文件行内容不符：${record.id} 第 ${record.source_line} 行`)
    }
    total++
  }
}
if (total !== provenance.change_count || seen.size !== total) {
  throw new Error(`历史变更条数不符：${total} / ${provenance.change_count}`)
}
console.log(`官方 v2.1.310 Git Blob ${blob} 已核对；${total} 条历史记录的唯一编号、行号及原文匹配`)
