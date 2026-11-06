import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
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

test('PR 全量测试按每个实际作业核对权威工具版本，新增作业自动纳入', () => {
  const content = readFileSync(join(root, '.github/workflows/ci-test-matrix.yml'), 'utf8')
  const jobsBody = content.split(/^jobs:\s*$/m)[1]
  assert.ok(jobsBody, '全量测试工作流必须声明 jobs')
  const jobs = jobsBody.split(/^  (?=[a-z][\w-]*:)/m).filter(section => section.trim())
  const nodeJobs = jobs.filter(section => section.includes('actions/setup-node@'))
  const bunJobs = jobs.filter(section => section.includes('oven-sh/setup-bun@'))
  assert.ok(nodeJobs.length > 0, '至少需要一项 Node 测试作业')
  assert.ok(bunJobs.length > 0, '至少需要一项 Bun 测试作业')
  for (const job of nodeJobs) {
    const label = job.split(':', 1)[0]
    assert.equal((job.match(/node tools\/dev\/toolchain\.mjs gha-env/g) ?? []).length, 1,
      `${label}: 应由唯一权威清单导出工具链版本`)
    assert.equal((job.match(/node-version: \$\{\{ env\.TOOLCHAIN_NODE_VERSION \}\}/g) ?? []).length, 1,
      `${label}: Node 版本必须引用权威配置`)
  }
  for (const job of bunJobs) {
    const label = job.split(':', 1)[0]
    assert.equal((job.match(/bun-version: \$\{\{ env\.TOOLCHAIN_BUN_VERSION \}\}/g) ?? []).length, 1,
      `${label}: Bun 版本必须引用权威配置`)
  }
  assert.match(content, /typescript@\$\{TOOLCHAIN_AST_TYPESCRIPT_VERSION\}/)
  assert.doesNotMatch(content, /typescript@5\.9\.3|node-version: ['"]26['"]/)
})

test('bootstrap 脱离完整仓库仍能校验权威清单和锁文件', () => {
  const temp = mkdtempSync(join(tmpdir(), '333-toolchain-bootstrap-'))
  const directory = join(temp, 'tools/dev')
  mkdirSync(directory, { recursive: true })
  try {
    for (const name of ['toolchain.mjs', 'toolchain.lock.json',
      'package.json', 'package-lock.json', 'toolchain-versions.env', 'toolchain-components.env']) {
      cpSync(join(root, 'tools/dev', name), join(directory, name))
    }
    const checked = spawnSync(process.execPath, [join(directory, 'toolchain.mjs'), 'check-bootstrap'], {
      cwd: temp, encoding: 'utf8', timeout: 10000,
    })
    assert.equal(checked.error, undefined)
    assert.equal(checked.status, 0, checked.stderr)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
