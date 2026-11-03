import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { isSettingsCACertBlockedByManagedHost } from '../src/utils/managedEnvConstants.ts'

const root = resolve(import.meta.dirname, '..')

test('官方 2.1.310：宿主接管 CA 设置时仅桌面入口可读取设置证书', () => {
  assert.equal(isSettingsCACertBlockedByManagedHost(false, undefined), false)
  assert.equal(isSettingsCACertBlockedByManagedHost(false, 'cli'), false)
  for (const entrypoint of ['claude-desktop', 'claude-desktop-3p', 'local-agent']) {
    assert.equal(isSettingsCACertBlockedByManagedHost(true, entrypoint), false)
  }
  for (const entrypoint of [undefined, '', 'cli', 'claude-agent-sdk']) {
    assert.equal(isSettingsCACertBlockedByManagedHost(true, entrypoint), true)
  }
})

test('早期 CA 加载遵守 settingSources 隔离并沿用宿主过滤规则', () => {
  const cert = readFileSync(resolve(root, 'src/utils/caCertsConfig.ts'), 'utf8')
  const settingsGuard = cert.indexOf("if (!isSettingSourceEnabled('userSettings'))")
  const hostGuard = cert.indexOf('isSettingsCACertBlockedByManagedHost(')
  const userRead = cert.indexOf("const settings = getSettingsForSource('userSettings')")
  assert.ok(settingsGuard >= 0 && hostGuard > settingsGuard && userRead > hostGuard)

  const env = readFileSync(resolve(root, 'src/utils/managedEnv.ts'), 'utf8')
  assert.match(env, /blockSettingsCA && key\.toUpperCase\(\) === 'NODE_EXTRA_CA_CERTS'/)
  assert.match(env, /!isProviderManagedEnvVar\(key\)/)
})
