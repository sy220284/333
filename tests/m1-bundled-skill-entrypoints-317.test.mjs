import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS = ['src/skills/bundled/design-sync', 'src/skills/bundled/claude-test-conversation']
const ENTRIES = [
  'src/skills/bundled/design-sync/package-capture.mjs',
  'src/skills/bundled/design-sync/storybook/compare.mjs',
  'src/skills/bundled/design-sync/storybook/probe.mjs',
  'src/skills/bundled/claude-test-conversation/scripts/ct-auth.mjs',
]
function scripts(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const full = join(path, entry.name)
    return entry.isDirectory() ? scripts(full) :
      (entry.isFile() && extname(entry.name) === '.mjs' ? [full] : [])
  })
}
const moduleSpecifier = /^\s*(?:import|export)\s+(?:[^\n]*?\s+from\s+)?['"](\.{1,2}\/[^'"\n]+)['"]/gm

test('317 内置技能的静态相对模块引用全部能解析', () => {
  const missing = []
  let count = 0
  for (const skill of SKILLS) for (const file of scripts(join(ROOT, skill))) {
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(moduleSpecifier)) {
      count++
      const target = resolve(dirname(file), spec)
      if (!existsSync(target) || !statSync(target).isFile()) missing.push(`${file}: ${spec}`)
    }
  }
  assert.ok(count >= 35, 'Unexpectedly few imports inspected')
  assert.deepEqual(missing, [])
})

test('317 内置技能所记录的可执行入口存在', () => {
  for (const entry of ENTRIES) assert.ok(existsSync(join(ROOT, entry)), entry)
})

test('317 内置技能启动能进入参数验证', () => {
  for (const entry of ENTRIES) {
    const run = spawnSync(process.execPath, [join(ROOT, entry)], {
      cwd: ROOT, encoding: 'utf8', timeout: 8000,
    })
    assert.equal(run.error, undefined, `${entry}: ${run.error?.message}`)
    assert.ok(run.status === 0 || run.status === 2, `${entry}: ${run.stderr}`)
    assert.doesNotMatch(`${run.stderr}${run.stdout}`, /ERR_MODULE_NOT_FOUND|Cannot find module/)
    assert.match(`${run.stderr}${run.stdout}`, /usage:/i)
  }
})

test('317 发行资源清单包含规范目录下的全部技能执行入口', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT,
    'build/official-embedded-assets-2.1.317.json'), 'utf8'))
  const paths = new Set(manifest.resources.map(record => record.path))
  for (const entry of ENTRIES) assert.ok(paths.has(entry), entry)
  assert.ok(paths.has('src/skills/bundled/design-sync/storybook/http-serve.mjs'))
})
