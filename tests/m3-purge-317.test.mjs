import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, stat, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { planPurge, executePurgeItem } from '../src/utils/purgeProject.mjs'

const session = '11111111-1111-4111-8111-111111111111'
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), '333-purge-'))
  const home = join(root, 'config'), project = join(root, 'work'), other = join(root, 'work-other')
  await mkdir(home); await mkdir(project); await mkdir(other)
  const dir = join(home, 'projects', project.replace(/[^a-zA-Z0-9]/g, '-'))
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${session}.jsonl`), JSON.stringify({ cwd: project }) + '\n')
  for (const path of [join(home, 'tasks', session), join(home, 'file-history', session), join(home, 'shell-snapshots'), join(home, 'backups')]) await mkdir(path, { recursive: true })
  await mkdir(join(home, 'debug')); await writeFile(join(home, 'debug', `${session}.txt`), 'debug')
  const history = [JSON.stringify({ project, display: 'remove' }), JSON.stringify({ project: other, display: 'keep' }), '{torn-json'].join('\n')
  await writeFile(join(home, 'history.jsonl'), history, { mode: 0o640 })
  try { await run({ root, home, project, other, dir }) } finally { await rm(root, { recursive: true, force: true }) }
}

test('project purge plans session state and exact config keys without deleting source files', async () => fixture(async ({ home, project, other, dir }) => {
  const plan = await planPurge(home, project, { projectKeys: [project, other] })
  assert.equal(plan.items.length, 6)
  assert.ok(plan.items.some(item => item.path === dir))
  assert.equal(plan.items.filter(item => item.kind === 'config-key').length, 1)
  assert.ok(plan.warnings.some(item => item.includes('shell-snapshots')))
  assert.ok(plan.warnings.some(item => item.includes('backups')))
  assert.ok((await readdir(dir)).length)
  const removed = []
  for (const item of plan.items) await executePurgeItem(item, { removeProject: async key => removed.push(key) })
  assert.deepEqual(removed, [project])
  await assert.rejects(stat(dir), { code: 'ENOENT' })
  assert.ok((await stat(project)).isDirectory())
  const history = await readFile(join(home, 'history.jsonl'), 'utf8')
  assert.ok(history.includes('keep')); assert.ok(history.includes('{torn-json')); assert.ok(!history.includes('remove'))
  // Windows exposes ACL-backed permissions, not reliable POSIX chmod bits.
  // Verify mode preservation on POSIX and data preservation on every host.
  if (process.platform !== 'win32') {
    assert.equal((await stat(join(home, 'history.jsonl'))).mode & 0o777, 0o640)
  }
}))

test('path-prefix collisions require transcript cwd ownership before planning deletion', async () => fixture(async ({ home, project, other }) => {
  const prefix = project.replace(/[^a-zA-Z0-9]/g, '-')
  const wrong = join(home, 'projects', `${prefix}-collision`)
  const nested = join(home, 'projects', `${prefix}-nested`)
  await mkdir(wrong); await mkdir(nested)
  await writeFile(join(wrong, `${session}.jsonl`), JSON.stringify({ cwd: other }) + '\n')
  await writeFile(join(nested, '22222222-2222-4222-8222-222222222222.jsonl'), JSON.stringify({ cwd: join(project, 'nested') }) + '\n')
  const plan = await planPurge(home, project)
  assert.equal(plan.items.some(item => item.path === wrong), false)
  assert.equal(plan.items.some(item => item.path === nested), true)
}))

test('history symlinks are refused and the linked file stays intact', async () => fixture(async ({ root, home, project }) => {
  const target = join(root, 'external-history')
  await writeFile(target, JSON.stringify({ project }) + '\n')
  await rm(join(home, 'history.jsonl')); await symlink(target, join(home, 'history.jsonl'))
  await assert.rejects(executePurgeItem({ kind: 'history-lines', path: join(home, 'history.jsonl'), matchPaths: [project] }), /regular file|symlink/)
  // JSON escapes Windows separators, so compare the parsed path exactly.
  assert.equal(JSON.parse((await readFile(target, 'utf8')).trim()).project, project)
}))

test('all-project purge includes history but preserves settings and credentials', async () => fixture(async ({ home, project }) => {
  await writeFile(join(home, 'settings.json'), '{"model":"custom"}')
  await writeFile(join(home, '.credentials.json'), '{"secret":"keep"}')
  const plan = await planPurge(home, undefined, { all: true, projectKeys: [project] })
  const removed = []
  for (const item of plan.items) await executePurgeItem(item, { removeProject: async key => removed.push(key) })
  assert.deepEqual(removed, [project])
  await assert.rejects(stat(join(home, 'history.jsonl')), { code: 'ENOENT' })
  assert.ok((await readFile(join(home, '.credentials.json'), 'utf8')).includes('keep'))
  assert.ok((await stat(join(home, 'shell-snapshots'))).isDirectory())
  assert.ok((await stat(join(home, 'backups'))).isDirectory())
}))

test('all-project cleanup retains recent staging files and reports them for a later retry', async () => fixture(async ({ home }) => {
  const { utimes } = await import('node:fs/promises')
  const old = join(home, '.1111111111111111.tmp'), recent = join(home, '.2222222222222222.tmp')
  await writeFile(old, 'old'); await writeFile(recent, 'active')
  const before = new Date(Date.now() - 120_000); await utimes(old, before, before)
  await assert.rejects(executePurgeItem({ path: join(home, 'history.jsonl'), kind: 'history-siblings' }), /Recent history staging files remain/)
  await assert.rejects(stat(old), { code: 'ENOENT' })
  assert.equal(await readFile(recent, 'utf8'), 'active')
}))

test('project transcript symlinks never cause deletion in another storage directory', async () => fixture(async ({ root, home, project }) => {
  const external = join(root, 'external'); await mkdir(external)
  await writeFile(join(external, 'keep'), 'keep')
  await symlink(external, join(home, 'projects', project.replace(/[^a-zA-Z0-9]/g, '-') + '-external'), 'dir')
  const plan = await planPurge(home, project)
  for (const item of plan.items) if (item.kind !== 'config-key') await executePurgeItem(item)
  assert.equal(await readFile(join(external, 'keep'), 'utf8'), 'keep')
}))

test('canonical project aliases share a purge plan without crossing the path boundary', async () => fixture(async ({ root, home, project, dir }) => {
  const alias = join(root, 'alias'); await symlink(project, alias, 'dir')
  const plan = await planPurge(home, alias, { projectKeys: [project, alias] })
  assert.ok(plan.items.some(item => item.path === dir))
  assert.equal(plan.items.filter(item => item.kind === 'config-key').length, 2)
  const history = plan.items.find(item => item.kind === 'history-lines')
  assert.ok(history.matchPaths.includes(alias))
  assert.ok(history.matchPaths.includes(project))
  const canonical = await realpath(project)
  assert.deepEqual(new Set(history.matchPaths), new Set([alias, project, canonical]))
}))


test('purging a filesystem-root project does not match every other project history', async () => fixture(async ({ home, project }) => {
  const { parse } = await import('node:path')
  const root = parse(project).root
  const history = join(home, 'history.jsonl')
  await writeFile(history, JSON.stringify({ project: root, display: 'root-only' }) + '\n' + JSON.stringify({ project, display: 'keep' }) + '\n')
  const plan = await planPurge(home, root)
  const item = plan.items.find(item => item.kind === 'history-lines')
  assert.ok(item)
  assert.match(item.reason, /^1 prompt/)
  await executePurgeItem(item)
  const saved = await readFile(history, 'utf8')
  assert.ok(saved.includes('keep')); assert.ok(!saved.includes('root-only'))
}))
