import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { canonicalizePath, sanitizePath } from '../../utils/sessionStoragePortable.js'
import type { InternalOptions, SessionStoreKey } from './runtimeTypes.js'

export const SDK_SESSION_UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i

async function withTimeout<T>(operation: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`SessionStore.${label} timed out after ${ms}ms`)), ms)
    })])
  } finally {
    clearTimeout(timer)
  }
}

export async function prepareExternalSession317(options: InternalOptions, resume?: string) {
  const store = options.sessionStore!
  const projectKey = sanitizePath(await canonicalizePath(resolve(options.cwd ?? '.')))
  const timeout = options.loadTimeoutMs ?? 60_000
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2_147_483_647) {
    throw new TypeError('Invalid SessionStore load timeout')
  }
  if (!resume && options.continue) {
    const sessions = await withTimeout(store.listSessions(projectKey), timeout, 'listSessions')
    resume = [...sessions].sort((a, b) => b.mtime - a.mtime)[0]?.sessionId
  }
  if (resume && !SDK_SESSION_UUID.test(resume)) throw new TypeError('Invalid session ID')
  const source = resolve(options.env?.CLAUDE_CONFIG_DIR ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'))
  const root = await mkdtemp(join(tmpdir(), 'claude-resume-'))
  const projects = join(root, 'projects')
  const cleanup = () => rm(root, { recursive: true, force: true })
  try {
    const project = join(projects, projectKey)
    await mkdir(project, { recursive: true, mode: 0o700 })
    for (const file of ['settings.json', 'cowork_settings.json', '.claude.json', '.config.json', '.credentials.json']) {
      let data: string
      try {
        data = await readFile(join(source, file), 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      if (file === '.credentials.json') {
        const credentials = JSON.parse(data)
        if (credentials.claudeAiOauth) delete credentials.claudeAiOauth.refreshToken
        data = JSON.stringify(credentials)
      }
      await writeFile(join(root, file), data, { mode: 0o600 })
    }
    if (resume) {
      const key = { projectKey, sessionId: resume }
      const entries = await withTimeout(store.load(key), timeout, 'load')
      if (entries?.length) {
        await writeFile(join(project, resume + '.jsonl'), jsonl(entries), { mode: 0o600 })
        const subkeys = store.listSubkeys
          ? await withTimeout(store.listSubkeys(key), timeout, 'listSubkeys') : []
        for (const subpath of new Set(subkeys)) {
          if (!subpath || isAbsolute(subpath) || /[\\:\0]/.test(subpath) ||
            subpath.split('/').some(part => !part || part === '.' || part === '..')) continue
          const rows = await withTimeout(store.load({ ...key, subpath }), timeout, 'load')
          if (!rows?.length) continue
          const path = join(project, resume, subpath)
          const transcript = rows.filter(row => row.type !== 'agent_metadata')
          const metadata = rows.filter(row => row.type === 'agent_metadata').at(-1)
          await mkdir(dirname(path), { recursive: true, mode: 0o700 })
          if (transcript.length) await writeFile(path + '.jsonl', jsonl(transcript), { mode: 0o600 })
          if (metadata) {
            const { type, ...fields } = metadata
            await writeFile(path + '.meta.json', JSON.stringify(fields), { mode: 0o600 })
          }
        }
      }
    }
    return {
      root, resume, cleanup,
      async mirror(filePath: string, entries: Record<string, unknown>[]) {
        const path = relative(projects, resolve(filePath))
        if (isAbsolute(path) || path.startsWith('..' + sep)) throw new Error('Invalid SDK transcript path')
        const [project, session, ...parts] = path.split(sep)
        if (project !== projectKey || !session) throw new Error('SDK transcript project mismatch')
        const sessionId = parts.length ? session : session.replace(/\.jsonl$/, '')
        if (!SDK_SESSION_UUID.test(sessionId)) throw new Error('Invalid SDK transcript session')
        const key: SessionStoreKey = { projectKey, sessionId }
        if (parts.length) key.subpath = parts.join('/').replace(/(?:\.meta\.json|\.jsonl)$/, '')
        await withTimeout(store.append(key, entries), timeout, 'append')
      },
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}

function jsonl(entries: Record<string, unknown>[]): string {
  return entries.map(entry => JSON.stringify(entry) + '\n').join('')
}
