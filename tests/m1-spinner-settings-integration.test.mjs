import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')

test('2.1.310 user settings reach the real spinner tip registry', () => {
  const home = mkdtempSync(join(tmpdir(), '333-spinner-settings-'))
  try {
    mkdirSync(join(home, '.qerivon'), { recursive: true })
    writeFileSync(
      join(home, '.qerivon', 'settings.json'),
      JSON.stringify({
        spinnerTipsOverride: {
          excludeDefault: true,
          label: 'Team QA',
          tips: [{ id: 'tip1', text: 'PROBE_ORGANIZATION_TIP' }],
        },
      }),
    )
    const source = [
      "import { enableConfigs } from './src/utils/config.ts'",
      "import { getSettingsForSource } from './src/utils/settings/settings.ts'",
      "import { getCustomSpinnerTips, isDefaultSpinnerTipSuppressed } from './src/services/tips/customTipSettings.ts'",
      "import { getRelevantTips } from './src/services/tips/tipRegistry.ts'",
      "enableConfigs()",
      "const settings = getSettingsForSource('userSettings')?.spinnerTipsOverride",
      "const collected = await getCustomSpinnerTips()",
      "const eligible = await getRelevantTips()",
      "console.log(JSON.stringify({ settings, trustedCount: collected.trustedCount, collectedIds: collected.tips.map(t => t.id), eligibleIds: eligible.map(t => t.id), suppressDefault: isDefaultSpinnerTipSuppressed() }))",
    ].join(';\n')
    const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config') }
    delete env.CLAUDE_CONFIG_DIR
    delete env.CLAUDE_CODE_SAFE_MODE
    delete env.CLAUDE_CODE_SETTING_SOURCES
    const run = spawnSync('bun', ['-e', source], {
      cwd: root, env, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024,
    })
    assert.equal(run.error, undefined, run.error?.message)
    assert.equal(run.status, 0, run.stderr)
    const result = JSON.parse(run.stdout.trim().split('\n').at(-1))
    assert.equal(result.settings?.excludeDefault, true)
    assert.equal(result.settings?.label, 'Team QA')
    assert.equal(result.trustedCount, 1)
    assert.deepEqual(result.collectedIds, ['org-tip:tip1'])
    assert.equal(result.suppressDefault, true)
    assert.deepEqual(result.eligibleIds, ['org-tip:tip1'])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
