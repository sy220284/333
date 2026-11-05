import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { checkToolchain, projections, readToolchain } from '../tools/dev/toolchain.mjs'

const root = resolve(import.meta.dirname, '..')
const source = join(root, 'tools/dev/toolchain.lock.json')

test('权威清单锁定运行时版本并核对开发类型依赖的主版本', () => {
  const data = checkToolchain()
  assert.equal(data.runtimes.node.split('.')[0], data.development.packages['@types/node'].split('.')[0])
  assert.equal(data.runtimes.bun, data.development.packages['@types/bun'])
  assert.equal(data.artifacts.schema, 2)
})
test('全部开发依赖与 npm 精确锁文件及 integrity 一致', () => {
  const data = checkToolchain()
  const lock = JSON.parse(readFileSync(join(root, 'tools/dev/package-lock.json'), 'utf8'))
  assert.deepEqual(lock.packages[''].devDependencies, data.development.packages)
  for (const [name, version] of Object.entries(data.development.packages)) {
    const pkg = lock.packages[['node_modules/', name].join('')]
    assert.equal(pkg.version, version)
    assert.match(pkg.integrity, /^sha512-/)
  }
})
test('单一权威文件生成的派生配置和 CI 输出必须对应', () => {
  const data = readToolchain()
  for (const [path, content] of projections(data)) {
    assert.equal(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'), content)
  }
  const result = spawnSync(process.execPath, [join(root, 'tools/dev/toolchain.mjs'), 'gha-env'], {
    cwd: root, encoding: 'utf8', timeout: 10000,
  })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stderr)
  for (const [name, version] of Object.entries({
    TOOLCHAIN_NODE_VERSION: data.runtimes.node,
    TOOLCHAIN_BUN_VERSION: data.runtimes.bun,
    TOOLCHAIN_PYTHON_VERSION: data.runtimes.python,
    TOOLCHAIN_ACTIONLINT_VERSION: data.runtimes.actionlint,
    TOOLCHAIN_AST_TYPESCRIPT_VERSION: data.development.typescriptAstParser,
  })) assert.ok(result.stdout.split('\n').includes([name, version].join('=')))
})
test('修改权威版本会更新派生配置，同时保持原件不变', () => {
  const canonical = readFileSync(source, 'utf8')
  const data = JSON.parse(canonical)
  const original = projections(data)
  data.runtimes.node = '27.0.0'
  data.development.packages['@types/node'] = '27.0.0'
  const changed = projections(data)
  for (const file of ['toolchain-versions.env', 'package.json']) {
    const name = join(root, 'tools/dev', file)
    assert.notEqual(changed.get(name), original.get(name))
  }
  assert.equal(readFileSync(source, 'utf8'), canonical)
})
test('离线包与安装和回装流程使用同一权威清单 SHA', () => {
  const files = [
    ['tools/dev/install.sh', /TOOLCHAIN_LOCK_SHA256/],
    ['tools/dev/package-artifacts.sh', /TOOLCHAIN_LOCK_SHA256/],
    ['tools/dev/lib.sh', /toolchain.mjs.*check/],
    ['tools/dev/portable.mjs', /toolchainSha256/],
    ['tools/dev/dev.mjs', /toolchain.mjs.*check/],
    ['tools/dev/test-runtime-archives.sh', /NODE_VERSION/],
  ]
  for (const [file, pattern] of files) {
    assert.match(readFileSync(join(root, file), 'utf8'), pattern, file)
  }
})
