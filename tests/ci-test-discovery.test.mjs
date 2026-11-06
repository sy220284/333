import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { discoverUnregisteredTests, workflowRunCommands } from '../build/run-unregistered-tests.mjs'

test('不再把历史分支工作流和 PR 文件过滤路径当作测试执行', () => {
  const root = mkdtempSync(join(tmpdir(), '333-gate-inventory-'))
  try {
    mkdirSync(join(root, 'tests'))
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
    for (const name of ['script', 'pr-run', 'old-only', 'filter-only', 'orphan'])
      writeFileSync(join(root, 'tests', name + '.test.mjs'), 'export const fixture = true\n')
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      scripts: { 'test:focus': 'node --test tests/script.test.mjs' }
    }))
    writeFileSync(join(root, '.github/workflows/legacy.yml'),
      "on:\n  push:\n    branches: [upgrade/2.1.310-m1-evidence]\njobs:\n  old:\n    steps:\n      - run: node --test tests/old-only.test.mjs\n")
    writeFileSync(join(root, '.github/workflows/active.yml'),
      "on:\n  pull_request:\n    paths:\n      - 'tests/filter-only.test.mjs'\njobs:\n  run:\n    steps:\n      - run: |\n          node --test tests/pr-run.test.mjs\n")
    const { registered, pending } = discoverUnregisteredTests(root)
    assert.deepEqual(registered, ['tests/pr-run.test.mjs','tests/script.test.mjs'])
    assert.deepEqual(pending, ['tests/filter-only.test.mjs','tests/old-only.test.mjs','tests/orphan.test.mjs'])
    const workflowOnly = discoverUnregisteredTests(root, { workflowOnly: true })
    assert.deepEqual(workflowOnly.pending, ['tests/pr-run.test.mjs'])
    assert.equal(workflowOnly.registered.length + workflowOnly.pending.length, workflowOnly.tests.length)
    const supplemental = discoverUnregisteredTests(root, { ciSupplemental: true })
    assert.deepEqual(supplemental.pending, ['tests/filter-only.test.mjs','tests/old-only.test.mjs','tests/orphan.test.mjs','tests/pr-run.test.mjs'])
    assert.deepEqual(supplemental.registered, ['tests/script.test.mjs'])
    assert.equal(supplemental.registered.length + supplemental.pending.length, supplemental.tests.length)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('同时解析单行与多行 run，忽略普通 YAML 文本', () => {
  const content = "jobs:\n  verify:\n    name: tests/mislabeled.test.mjs\n    steps:\n      - run: node --test tests/one.test.mjs\n      - run: |\n          bun test tests/two.test.ts\n"
  const commands = workflowRunCommands(content)
  assert.match(commands,/tests\/one\.test\.mjs/)
  assert.match(commands,/tests\/two\.test\.ts/)
  assert.doesNotMatch(commands,/mislabeled/)
})

test('ChatGPT 账号测试在全量回归与专项门禁中统一隔离执行', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const modelCommand = manifest.scripts['test:multimodel']
  const suites = [
    'tests/multimodel-provider.test.ts',
    'tests/chatgpt-oauth-accounts.test.ts',
    'tests/chatgpt-oauth-refresh.test.ts',
    'tests/independent-local-features.test.ts',
  ]
  assert.ok(manifest.scripts['test:bun'].includes('npm run test:multimodel'))
  for (const suite of suites) {
    assert.ok(modelCommand.split(' && ').includes(`bun test ${suite}`),
      `${suite} must use a separate Bun process`)
  }
  const workflow = readFileSync(new URL('../.github/workflows/independent-models.yml', import.meta.url), 'utf8')
  assert.match(workflow, /run: npm run test:multimodel/)
})

test('官方二进制对照只在专用任务执行，补充测试可排除重复', () => {
  const source = readFileSync(new URL('../build/run-unregistered-tests.mjs', import.meta.url), 'utf8')
  assert.match(source, /--ci-oracle/)
  assert.match(source, /--exclude-oracle/)
  assert.match(source, /Official parity cannot run without verified/)
})

