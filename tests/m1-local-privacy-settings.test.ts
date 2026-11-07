import { afterAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getLocalPrivacyPreference, setLocalPrivacyPreference } from '../src/services/localRuntime/privacyChoices.js'
import { getPrivacyLevel, getEssentialTrafficOnlyReason } from '../src/utils/privacyLevel.js'

const dir = mkdtempSync(join(tmpdir(), 'yaoyaoche-privacy-test-'))
const previous = {
  configDir: process.env.YAOYAOCHE_CONFIG_DIR,
  dnt: process.env.DO_NOT_TRACK,
  essentials: process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC,
}
process.env.YAOYAOCHE_CONFIG_DIR = dir
delete process.env.DO_NOT_TRACK
delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC

afterAll(() => {
  for (const [name, val] of [
    ['YAOYAOCHE_CONFIG_DIR', previous.configDir],
    ['DO_NOT_TRACK', previous.dnt],
    ['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', previous.essentials],
  ] as const) {
    if (val === undefined) delete process.env[name]
    else process.env[name] = val
  }
  rmSync(dir, { recursive: true, force: true })
})

describe('本地隐私设置', () => {
  it('初始默认仅依赖本地文件，无账号请求', () => {
    expect(getLocalPrivacyPreference()).toBe('default')
  })
  it('持久写入、立即生效、环境变量可进一步收紧', () => {
    setLocalPrivacyPreference('no-telemetry')
    expect(getLocalPrivacyPreference()).toBe('no-telemetry')
    expect(getPrivacyLevel()).toBe('no-telemetry')
    expect(JSON.parse(readFileSync(join(dir, 'privacy.json'), 'utf8'))).toEqual({ level: 'no-telemetry' })
    setLocalPrivacyPreference('essential-traffic')
    expect(getEssentialTrafficOnlyReason()).toBe('/privacy-settings')
    process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '0'
    expect(getPrivacyLevel()).toBe('essential-traffic')
    setLocalPrivacyPreference('default')
    process.env.DO_NOT_TRACK = '1'
    expect(getPrivacyLevel()).toBe('no-telemetry')
    delete process.env.DO_NOT_TRACK
  })
  it('损坏的配置提示错误，不继续以宽松配置运行', () => {
    const another = mkdtempSync(join(tmpdir(), 'yaoyaoche-privacy-corrupt-'))
    process.env.YAOYAOCHE_CONFIG_DIR = another
    writeFileSync(join(another, 'privacy.json'), '{"level":"unexpected"}')
    expect(() => getLocalPrivacyPreference()).toThrow('本地隐私配置无效')
    rmSync(another, { recursive: true, force: true })
    process.env.YAOYAOCHE_CONFIG_DIR = dir
  })
})
