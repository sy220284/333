import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = path => readFileSync(join(root, path), 'utf8')
const release = JSON.parse(read('docs/upgrade/m1-evidence/target-release.json'))
const native = JSON.parse(read('build/official-native-317.json'))
const pkg = JSON.parse(read('package.json'))

test('官方317 x64 原件、反编译与候选构建共享同一目标版本和二进制SHA', () => {
  assert.equal(release.target_version, pkg.version)
  assert.equal(native.version, release.target_version)
  assert.equal(native.platform, 'x64-linux')
  assert.equal(native.binary_sha256, release.verified_x64_sha256)
  assert.match(release.verified_x64_sha256, /^[a-f0-9]{64}$/)
  assert.match(release.verified_x64_commit_sha, /^[a-f0-9]{40}$/)
})

test('x64行为对照从统一基准取证并保留真实版本与来源提交校验', () => {
  const probe = read('build/m1-x64-reference-probe.mjs')
  assert.match(probe, /target-release\.json/)
  assert.match(probe, /official-native-317\.json/)
  assert.match(probe, /version_verbose/)
  assert.match(probe, /TARGET_COMMIT/)
  assert.match(probe, /reference_sha256:hash/)
  assert.doesNotMatch(probe, /b73676430af12f97316a798b8371f81d640f90a58bdcb8f3ce56a835bb47df56/)
})

test('官方安装工作流固定源文件身份且使用支持TypeScript源码模式的Node', () => {
  const workflow = read('.github/workflows/m1-official-x64-installed-parity.yml')
  assert.ok(workflow.includes(release.verified_x64_sha256))
  assert.match(workflow, /node-version: '24'/)
  assert.match(workflow, /--allow-candidate-diff false/)
})
