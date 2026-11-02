import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

let tipModule = {}
try {
  tipModule = await import('../src/services/tips/customTips.mjs')
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
}
function makeProvider(overrides, extra = {}) {
  assert.equal(typeof tipModule.createCustomTipProvider, 'function', 'custom tip provider must exist')
  return tipModule.createCustomTipProvider({
    getOverride: source => overrides[source],
    isEnabled: () => true,
    remotePolicyHasTipsFile: () => false,
    warn: () => {},
    ...extra,
  })
}

test('trusted settings merge in priority order and project settings contribute only plain tips', async () => {
  const provider = makeProvider({
    policySettings: { label: ' Team\nOps ', tips: [{ id: 'shared', text: ' Policy\u001b[31m tip\u001b[0m ', priority: 24, cooldownSessions: 2001 }] },
    flagSettings: { label: 'Flag', tips: [{ id: 'shared', text: 'duplicate' }, 'flag tip'] },
    userSettings: { excludeDefault: true, tips: ['user tip'] },
    projectSettings: { label: 'Injected', excludeDefault: false, tips: [{ id: 'inject', text: 'bad' }, 'project\n tip'] },
  })
  const { tips, trustedCount } = await provider.collect()
  assert.equal(trustedCount, 3)
  assert.deepEqual(tips.map(t => t.id), ['org-tip:shared', 'custom-tip-2', 'custom-tip-3', 'custom-tip-5'])
  assert.deepEqual(await Promise.all(tips.map(t => t.content())), ['Policy tip', 'flag tip', 'user tip', 'project tip'])
  assert.deepEqual(tips.map(t => t.label), ['Team Ops', 'Team Ops', 'Team Ops', 'Tip'])
  assert.equal(tips[0].priority, 10)
  assert.equal(tips[0].cooldownSessions, 1000)
  assert.equal(provider.suppressDefault(), true)
})

test('only trusted configuration can suppress defaults, with the highest setting winning', async () => {
  let provider = makeProvider({
    policySettings: { excludeDefault: false },
    userSettings: { excludeDefault: true, tips: ['hello'] },
    localSettings: { excludeDefault: true, tips: ['project'] },
  })
  assert.equal(provider.suppressDefault(), false)
  provider = makeProvider({ projectSettings: { excludeDefault: true, tips: ['project'] } })
  assert.equal(provider.suppressDefault(), false)
  assert.equal((await provider.collect()).trustedCount, 0)
})

test('drops invalid or empty entries, strips control characters, and caps text and count', async () => {
  const provider = makeProvider({
    userSettings: { label: '\u0007', tips: ['', '\u200b', 'X'.repeat(501), { id: '../bad', text: 'invalid' }, { id: 'valid-1', text: ' A\t\nB\u200b ' }, ...Array.from({ length: 205 }, (_, i) => `t${i}`)] },
  })
  const { tips, trustedCount } = await provider.collect()
  assert.equal(tips.length, 200)
  assert.equal(trustedCount, 200)
  assert.equal(tips[0].id, 'org-tip:valid-1')
  assert.equal(await tips[0].content(), 'A B')
  assert.equal(tips[0].label, 'Tip')
})

test('loads a trusted local tips file once per process and ignores project file paths', async t => {
  const dir = await mkdtemp(join(tmpdir(), '333-tips-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'tips.json')
  await writeFile(file, JSON.stringify({ tips: ['file one', { id: 'file-id', text: 'file two', priority: -99 }] }))
  const provider = makeProvider({
    userSettings: { tipsFile: file, label: 'Org' },
    projectSettings: { tipsFile: file, tips: ['project'] },
  })
  const first = await provider.collect()
  assert.deepEqual(first.tips.map(t => t.id), ['org-tip:file:0', 'org-tip:file-id', 'custom-tip-0'])
  assert.equal(first.trustedCount, 2)
  assert.equal(first.tips[1].priority, -10)
  await writeFile(file, JSON.stringify(['changed']))
  assert.deepEqual(await Promise.all((await provider.collect()).tips.map(t => t.content())), ['file one', 'file two', 'project'])
})

test('does not load remote-managed, relative, or overlarge tips files', async t => {
  const dir = await mkdtemp(join(tmpdir(), '333-tips-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'tips.json')
  await writeFile(file, JSON.stringify(['remote']))
  const remote = makeProvider({ policySettings: { tipsFile: file } }, { remotePolicyHasTipsFile: () => true })
  assert.equal((await remote.collect()).tips.length, 0)
  const relative = makeProvider({ userSettings: { tipsFile: 'tips.json' } })
  assert.equal((await relative.collect()).tips.length, 0)
  await writeFile(file, 'x'.repeat(262145))
  const large = makeProvider({ userSettings: { tipsFile: file } })
  assert.equal((await large.collect()).tips.length, 0)
})

test('disabled settings sources do not contribute tips or suppress defaults', async () => {
  const provider = makeProvider({ userSettings: { excludeDefault: true, tips: ['disabled'] } }, { isEnabled: source => source !== 'userSettings' })
  assert.deepEqual((await provider.collect()).tips, [])
  assert.equal(provider.suppressDefault(), false)
})

test('a trusted file symlink resolves to the same local tip content', async t => {
  const dir = await mkdtemp(join(tmpdir(), '333-tips-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'tips.json')
  const link = join(dir, 'link.json')
  await writeFile(file, JSON.stringify(['linked']))
  try {
    await symlink(file, link)
  } catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') return
    throw error
  }
  const { tips } = await makeProvider({ userSettings: { tipsFile: link } }).collect()
  assert.equal(await tips[0].content(), 'linked')
})
