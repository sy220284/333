import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

function inspect(filename, source) {
  const dir = mkdtempSync(join(tmpdir(), '333-chinese-source-'))
  try {
    writeFileSync(join(dir, filename), source)
    const result = spawnSync(process.execPath, [
      'tools/localization/check-code-integrity.mjs', dir,
    ], {cwd: resolve('.'), env: process.env, encoding: 'utf8'})
    assert.equal(result.error, undefined)
    return result
  } finally {
    rmSync(dir, {recursive: true, force: true})
  }
}

test('中文界面正文和语言词典键可以保留', () => {
  const r = inspect('correct.tsx', `const languages = { 日本語: 'ja' }
const element = <Text>正在重新连接服务器</Text>
void languages
void element
`)
  assert.equal(r.status, 0, r.stderr)
})

test('中文化误改程序变量名立即失败', () => {
  const r = inspect('broken.tsx', 'const handleFlagged关闭 = () => null\n')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /translated identifier handleFlagged关闭/)
})

test('中文标点破坏 TypeScript 类型语法立即失败', () => {
  const r = inspect('syntax.tsx', 'function example(输入： string) { return 输入 }\n')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /syntax/)
})
