import assert from 'node:assert/strict'
import { test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { rebindClaimedSessionDependencies317 } from '../src/bootstrap/claimRebind317.ts'
import { getGlobalClaudeFile } from '../src/utils/env.ts'
import { getClaudeConfigHomeDir } from '../src/utils/envUtils.ts'
import { enableConfigs, getGlobalConfig, getProjectPathForConfig } from '../src/utils/config.ts'
import { getSettingsForSource } from '../src/utils/settings/settings.ts'
import { getOriginalCwd, setOriginalCwd } from '../src/bootstrap/state.ts'

test('317 claimed session rebinds global config, project and settings ownership', async () => {
  const a = mkdtempSync(join(tmpdir(), '333-warm-owner-'))
  const b = mkdtempSync(join(tmpdir(), '333-claim-owner-'))
  const oldDir = process.env.CLAUDE_CONFIG_DIR
  const oldNodeEnv = process.env.NODE_ENV
  const oldCwd = getOriginalCwd()
  const configName = '.claude.json'
  try {
    writeFileSync(join(a, configName), JSON.stringify({ numStartups: 11 }))
    writeFileSync(join(b, configName), JSON.stringify({ numStartups: 29 }))
    writeFileSync(join(a, 'settings.json'), JSON.stringify({ env: { CLAIM_ID: 'warm' } }))
    writeFileSync(join(b, 'settings.json'), JSON.stringify({ env: { CLAIM_ID: 'accepted' } }))
    process.env.NODE_ENV = 'production'
    process.env.CLAUDE_CONFIG_DIR = a
    setOriginalCwd(a)
    getGlobalClaudeFile.cache.clear()
    getClaudeConfigHomeDir.cache.clear()
    enableConfigs()
    assert.equal(getGlobalConfig().numStartups, 11)
    assert.equal(getSettingsForSource('userSettings')?.env?.CLAIM_ID, 'warm')
    const oldPath = getProjectPathForConfig()

    // This mimics the accepted claim boundary: the new owner differs from
    // the context in which MDM, settings and config were first initialized.
    process.env.CLAUDE_CONFIG_DIR = b
    setOriginalCwd(b)
    await rebindClaimedSessionDependencies317()

    assert.equal(getGlobalClaudeFile(), join(b, configName))
    assert.equal(getClaudeConfigHomeDir(), b)
    assert.equal(getGlobalConfig().numStartups, 29)
    assert.equal(getSettingsForSource('userSettings')?.env?.CLAIM_ID, 'accepted')
    assert.notEqual(getProjectPathForConfig(), oldPath)
  } finally {
    setOriginalCwd(oldCwd)
    if (oldDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = oldDir
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = oldNodeEnv
    await rebindClaimedSessionDependencies317()
    rmSync(a, { recursive: true, force: true })
    rmSync(b, { recursive: true, force: true })
  }
})

test('317 new MDM reads cannot reuse pre-claim raw-read results', async () => {
  const { startMdmRawRead, getMdmRawReadPromise } =
    await import('../src/utils/settings/mdm/rawRead.ts')
  const { resetMdmRawReadForClaim317 } =
    await import('../src/utils/settings/mdm/rawRead.ts')
  startMdmRawRead()
  assert.ok(getMdmRawReadPromise())
  await getMdmRawReadPromise()
  resetMdmRawReadForClaim317()
  assert.equal(getMdmRawReadPromise(), null)
})
