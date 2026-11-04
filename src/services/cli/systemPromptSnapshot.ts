import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Persists exactly one request's complete system prompt per session. Compact
 * summaries start a new snapshot epoch; ordinary turns and resume reuse the
 * recorded text without rebuilding machine-dependent sections.
 */
export function resolvePromptSnapshot({
  prompt, sessionId, compactRevision, cwd, home, mode,
}) {
  if (mode === 'off') return prompt
  if (!Array.isArray(prompt) || prompt.some(x => typeof x !== 'string')) throw new TypeError('System prompt must be an array of strings')
  if (!/^[0-9a-f]{8}-[0-9a-f-]{24,40}$/i.test(sessionId)) {
    throw new Error('Cannot persist a prompt snapshot without a valid session UUID')
  }
  if (mode !== 'on') throw new Error('Invalid system prompt snapshot mode')
  const project = createHash('sha256').update(cwd).digest('hex').slice(0,24)
  const dir = join(home, 'session-prompt-snapshots', project)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const path = join(dir, `${sessionId}.json`)
  if (existsSync(path)) {
    const record = JSON.parse(readFileSync(path, 'utf8'))
    if (record.sessionId !== sessionId || !Array.isArray(record.prompt) ||
        record.prompt.some(x => typeof x !== 'string')) {
      throw new Error('Existing prompt snapshot is corrupt or belongs to a different session')
    }
    if (record.compactRevision === compactRevision) return record.prompt
  }
  const nonce = randomBytes(8).toString('hex')
  const temp = `${path}.${nonce}.tmp`
  const content = JSON.stringify({sessionId, compactRevision, prompt})
  writeFileSync(temp, content, {encoding:'utf8',mode:0o600,flag:'wx'})
  renameSync(temp, path)
  return prompt
}

export function promptSnapshotMode(raw: string|undefined, bare: boolean, cloudOrBackground: boolean = false) {
  if (raw !== undefined && raw !== 'on' && raw !== 'off') throw new Error('Allowed choices are on, off')
  if (raw) return raw
  return bare && !cloudOrBackground ? 'off' : 'on'
}
