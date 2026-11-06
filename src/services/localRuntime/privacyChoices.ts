import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

export type LocalPrivacyPreference = 'default' | 'no-telemetry' | 'essential-traffic'

const LEVELS: readonly LocalPrivacyPreference[] = [
  'default', 'no-telemetry', 'essential-traffic',
]
let cachedPath: string | undefined
let cachedLevel: LocalPrivacyPreference = 'default'

function privacyFile(): string {
  return join(getClaudeConfigHomeDir(), 'privacy.json')
}

/** 读取本地配置。除不存在的文件外，损坏或拒绝访问都应明确报错。 */
export function getLocalPrivacyPreference(): LocalPrivacyPreference {
  const path = privacyFile()
  if (path === cachedPath) return cachedLevel
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    cachedPath = path
    cachedLevel = 'default'
    return cachedLevel
  }
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || !('level' in value) ||
    !LEVELS.includes((value as { level: LocalPrivacyPreference }).level)) {
    throw new Error(`本地隐私配置无效：${path}`)
  }
  cachedLevel = (value as { level: LocalPrivacyPreference }).level
  cachedPath = path
  return cachedLevel
}

/** 原子写入，权限限制为当前用户；随后立即刷新本进程隐私策略。 */
export function setLocalPrivacyPreference(level: LocalPrivacyPreference): void {
  if (!LEVELS.includes(level)) throw new Error(`未知的隐私级别：${String(level)}`)
  const path = privacyFile()
  mkdirSync(getClaudeConfigHomeDir(), { recursive: true, mode: 0o700 })
  const tmp = `${path}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, `${JSON.stringify({ level }, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    renameSync(tmp, path)
  } catch (error) {
    try { unlinkSync(tmp) } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') throw cleanupError
    }
    throw error
  }
  cachedPath = path
  cachedLevel = level
}
