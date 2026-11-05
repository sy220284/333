import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

test('后缀为js的未知压缩字节仍按源码检查并拒绝', () => {
  const r = inspect('unknown.min.js', Buffer.from('28b52ffd00000000', 'hex'))
  assert.equal(r.status, 1)
  assert.match(r.stderr, /syntax/)
})

test('原版已锁定SHA的压缩脚本作为资源核验，不误报源码语法错误', () => {
  const r = spawnSync(process.execPath, ['tools/localization/check-code-integrity.mjs',
    'src/skills/bundled/artifact-design/assets',
    'src/skills/bundled/artifact-diagramming/assets',
    'src/skills/bundled/data-visualization/assets',
  ], { cwd: resolve('.'), env: process.env, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /已核验 3 份原版压缩资源/)
})


test('被修改的原版压缩资源必须以校验和错误失败', () => {
  const dir = mkdtempSync(join(tmpdir(), '333-original-script-check-'))
  const asset = 'src/skills/bundled/artifact-design/assets/hljsBundle.generated.min.js'
  try {
    for (const file of ['tools/localization/check-code-integrity.mjs', 'build/official-embedded-assets-2.1.317.json', asset]) {
      const destination = join(dir, file)
      mkdirSync(resolve(destination, '..'), { recursive: true })
      copyFileSync(resolve(file), destination)
    }
    const bytes = readFileSync(join(dir, asset))
    bytes[bytes.length - 1] ^= 1
    writeFileSync(join(dir, asset), bytes)
    const result = spawnSync(process.execPath, ['tools/localization/check-code-integrity.mjs', 'src'], {
      cwd: dir, env: process.env, encoding: 'utf8',
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /original resource checksum mismatch/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
