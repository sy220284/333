import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, lstatSync } from 'node:fs'
import { resolve, relative, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(resolve(root, 'build/claude-api-2.1.317-manifest.json')))
const baseline = JSON.parse(readFileSync(resolve(root, 'docs/upgrade/m1-evidence/target-release.json')))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const blob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const skillRoot = resolve(root, 'src/skills/bundled/claude-api')
function list(dir) {
  return readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const file = join(dir,entry.name)
    return entry.isDirectory() ? list(file) : [relative(skillRoot,file).split(sep).join('/')]
  })
}
const safe = path => typeof path === 'string' && path.length > 0 &&
  !path.startsWith('/') && !path.includes('\\') && !path.split('/').some(p => !p || p==='..' || p==='.')

test('317 原版技能资源清单必须匹配独立已校验的官方二进制', () => {
  assert.equal(manifest.version, '2.1.317')
  assert.equal(baseline.target_version, manifest.version)
  assert.equal(manifest.native_executable_sha256, baseline.verified_x64_sha256)
  assert.match(manifest.mapping_module_sha256, /^[a-f0-9]{64}$/)
  assert.ok(manifest.mapping_module)
  assert.equal(manifest.files.length, 107)
})
test('317 资源内容、原始校验、Git 对象及路径集合全部一致', () => {
  const known = new Set()
  for (const entry of manifest.files) {
    const path = entry.stored_path ?? entry.path
    assert.ok(safe(path) && safe(entry.path), 'unsafe path: '+path)
    assert.ok(!known.has(path), 'duplicate path: '+path)
    known.add(path)
    const file = resolve(skillRoot,path)
    assert.equal(lstatSync(file).isFile(),true,path)
    const bytes = readFileSync(file)
    assert.equal(sha256(bytes),entry.sha256,path+': differs from official resource')
    assert.equal(sha256(bytes),entry.source_sha256,path+': source digest differs')
    assert.equal(blob(bytes),entry.git_sha,path+': Git binary content differs')
    if (entry.bytes !== undefined) assert.equal(bytes.length,entry.bytes,path)
  }
  assert.deepEqual(list(skillRoot).sort(), [...known].sort(), 'resource tree drift')
  for (const path of known) assert.ok(!path.endsWith('.mjs.txt') && !path.endsWith('.py.txt'),path)
})

test('317技能注册入口的107条静态导入与完整清单逐一吻合', () => {
  const code = readFileSync(resolve(root, 'src/skills/bundled/claudeApiContent.ts'), 'utf8')
  const references = [...code.matchAll(/^import file\d+ from '\.\/claude-api\/([^']+)'$/gm)].map(match => match[1])
  assert.equal(references.length, manifest.files.length, 'bundled imports are incomplete')
  const manifestPaths = manifest.files.map(entry => entry.stored_path ?? entry.path)
  assert.deepEqual(references.sort(), manifestPaths.sort(), 'stale bundled import (e.g. old .txt aliases)')
  for (const path of references.filter(path => /\.(mjs|py)$/.test(path))) {
    assert.ok(code.includes(`from './claude-api/${path}' with { type: 'text' }`),
      path + ': executable source must be embedded as data, not imported as code')
  }
  for (const file of manifest.files) {
    if (file.path === 'SKILL.md') continue
    assert.ok(code.includes(JSON.stringify(file.path)+': file'), file.path+': missing registry key')
  }
})
