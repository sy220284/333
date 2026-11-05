import assert from 'node:assert/strict'
import { test } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { rebindClaimedSessionDependencies317 } from '../src/bootstrap/claimRebind317.ts'
import { getGlobalClaudeFile } from '../src/utils/env.ts'
import { getClaudeConfigHomeDir } from '../src/utils/envUtils.ts'
import { enableConfigs, getGlobalConfig, getProjectPathForConfig, checkHasTrustDialogAccepted } from '../src/utils/config.ts'
import { getSettingsForSource } from '../src/utils/settings/settings.ts'
import { getOriginalCwd, setOriginalCwd, getSessionTrustAccepted, setSessionTrustAccepted } from '../src/bootstrap/state.ts'
import { getTranscriptPath, getProjectDir } from '../src/utils/sessionStorage.ts'
import { getSessionId } from '../src/bootstrap/state.ts'
import { ensureFastPathSettingsLoaded317 } from '../src/bootstrap/fastPathSettings317.ts'
import { getFeatureValue_CACHED_MAY_BE_STALE, resetGrowthBook } from '../src/services/analytics/growthbook.ts'

test('317 claimed session rebinds global config, project and settings ownership', async () => {
  const a = mkdtempSync(join(tmpdir(), '333-warm-owner-'))
  const b = mkdtempSync(join(tmpdir(), '333-claim-owner-'))
  const oldDir = process.env.CLAUDE_CONFIG_DIR
  const oldNodeEnv = process.env.NODE_ENV
  const oldCwd = getOriginalCwd()
  const previousTrustAccepted = getSessionTrustAccepted()
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
    // A warmed worker can have accepted a different workspace. Even when the
    // old trust check is latched, the claimed session must start untrusted.
    setSessionTrustAccepted(true)
    assert.equal(checkHasTrustDialogAccepted(), true)
    assert.equal(getGlobalConfig().numStartups, 11)
    assert.equal(getSettingsForSource('userSettings')?.env?.CLAIM_ID, 'warm')
    const warmPolicy = ensureFastPathSettingsLoaded317()
    await warmPolicy
    const oldPath = getProjectPathForConfig()
    // Warmed Storage V5 can cache both a project path and current transcript
    // before the new claim replaces CLAUDE_CONFIG_DIR.
    const warmProjectDir = getProjectDir(a)
    const warmTranscriptPath = getTranscriptPath()
    assert.ok(warmProjectDir.startsWith(join(a, 'projects')))
    assert.ok(warmTranscriptPath.startsWith(join(a, 'projects')))


    // This mimics the accepted claim boundary: the new owner differs from
    // the context in which MDM, settings and config were first initialized.
    process.env.CLAUDE_CONFIG_DIR = b
    setOriginalCwd(b)
    await rebindClaimedSessionDependencies317()

    assert.equal(getGlobalClaudeFile(), join(b, configName))
    assert.equal(getClaudeConfigHomeDir(), b)
    assert.ok(getProjectDir(a).startsWith(join(b, 'projects')),
      'same cwd must resolve through newly claimed config root')
    assert.notEqual(getProjectDir(a), warmProjectDir)
    assert.equal(getTranscriptPath(),
      join(getProjectDir(b), getSessionId() + '.jsonl'),
      'current transcript must not retain the warmed config owner')
    assert.notEqual(getTranscriptPath(), warmTranscriptPath)

    // Config reads must be gated again after a warm process switches owners.
    assert.throws(() => getGlobalConfig(), /Config accessed before allowed/)
    enableConfigs()
    assert.equal(getSessionTrustAccepted(), false,
      'the warmed session trust token must not carry across a claim')
    assert.equal(checkHasTrustDialogAccepted(), false,
      'old trust caches must not authorize the newly claimed workspace')
    assert.equal(getGlobalConfig().numStartups, 29)
    assert.equal(getSettingsForSource('userSettings')?.env?.CLAIM_ID, 'accepted')
    const claimPolicy = ensureFastPathSettingsLoaded317()
    assert.notEqual(claimPolicy, warmPolicy, 'reused previous session startup policy Promise')
    await claimPolicy
    assert.notEqual(getProjectPathForConfig(), oldPath)
    // A delayed event on the old file must not leak its contents into
    // the accepted owner's cache after handoff.
    writeFileSync(join(a, configName), JSON.stringify({ numStartups: 77 }))
    await new Promise(resolve => setTimeout(resolve, 1300))
    assert.equal(getGlobalConfig().numStartups, 29)
  } finally {
    setOriginalCwd(oldCwd)
    setSessionTrustAccepted(previousTrustAccepted)
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


test('317 claimed preloader resets feature-flag targeting for the new environment', async () => {
  const beforeUserType = process.env.USER_TYPE
  const beforeOverrides = process.env.CLAUDE_INTERNAL_FC_OVERRIDES
  try {
    process.env.USER_TYPE = 'ant'
    process.env.CLAUDE_INTERNAL_FC_OVERRIDES = '{"claim_317_identity":"warm"}'
    resetGrowthBook()
    assert.equal(getFeatureValue_CACHED_MAY_BE_STALE('claim_317_identity', 'unset'), 'warm')
    process.env.CLAUDE_INTERNAL_FC_OVERRIDES = '{"claim_317_identity":"accepted"}'
    assert.equal(getFeatureValue_CACHED_MAY_BE_STALE('claim_317_identity', 'unset'),
      'warm', 'pre-claim feature flags are intentionally cached')
    await rebindClaimedSessionDependencies317()
    assert.equal(getFeatureValue_CACHED_MAY_BE_STALE('claim_317_identity', 'unset'),
      'accepted', 'the claimed environment must not inherit the warm feature targeting')
  } finally {
    if (beforeUserType === undefined) delete process.env.USER_TYPE
    else process.env.USER_TYPE = beforeUserType
    if (beforeOverrides === undefined) delete process.env.CLAUDE_INTERNAL_FC_OVERRIDES
    else process.env.CLAUDE_INTERNAL_FC_OVERRIDES = beforeOverrides
    resetGrowthBook()
  }
})
