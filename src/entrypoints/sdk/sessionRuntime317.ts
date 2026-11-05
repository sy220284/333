import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SDKMessage, SDKUserMessage } from './coreTypes.js'
import type { SDKSession, SDKSessionOptions } from './runtimeTypes.js'

const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i

/** A v2 session owns one CLI process and one stream-json connection. */
export function createSessionRuntime317(
  options: SDKSessionOptions,
  resume?: string,
): SDKSession {
  if (resume !== undefined && !UUID.test(resume)) {
    throw new TypeError('Invalid session ID')
  }
  if (options.canUseTool || options.hooks) {
    throw new Error('SDK session callbacks require the duplex control transport')
  }
  const sessionId = resume ?? randomUUID()
  const path = options.pathToClaudeCodeExecutable ??
    fileURLToPath(new URL('../../../dist/launcher.cjs', import.meta.url))
  const interpreter = options.executable ??
    (/^\.(?:js|mjs|cjs)$/.test(extname(path)) ? 'node' : undefined)
  const args = [
    ...(options.executableArgs ?? []),
    ...(interpreter ? [path] : []),
    '--print', '--verbose', '--input-format', 'stream-json',
    '--output-format', 'stream-json', '--model', options.model,
    resume === undefined ? '--session-id' : '--resume', sessionId,
  ]
  if (options.permissionMode) args.push('--permission-mode', options.permissionMode)
  if (options.settingSources) args.push('--setting-sources', options.settingSources.join(','))
  if (options.allowedTools?.length) args.push('--allowedTools', options.allowedTools.join(','))
  if (options.disallowedTools?.length) args.push('--disallowedTools', options.disallowedTools.join(','))

  const child = spawn(interpreter ?? path, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env, CLAUDE_CODE_ENTRYPOINT: 'sdk-ts' },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stderr = ''
  child.stderr.setEncoding('utf8').on('data', chunk => {
    stderr = (stderr + chunk).slice(-8192)
  })
  let failure: Error | undefined
  child.on('error', error => { failure = error })
  child.stdin.on('error', error => { failure ??= error })
  const exited = new Promise<void>(resolve => {
    child.once('close', (code, signal) => {
      if (code !== 0) {
        failure ??= new Error(`Claude CLI exited with ${signal ?? code}${stderr ? ': ' + stderr.trim() : ''}`)
      }
      resolve()
    })
  })
  const reader = createInterface({ input: child.stdout, crlfDelay: Infinity })
  const lines = reader[Symbol.asyncIterator]()
  let closed = false
  let pending = false
  let reading = false

  function close(): void {
    if (closed) return
    closed = true
    reader.close()
    child.stdin.destroy()
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }

  return {
    sessionId,
    async send(message) {
      if (failure) throw failure
      if (closed) throw new Error('SDK session is closed')
      if (pending) throw new Error('Consume the current SDK turn before sending another message')
      const frame: SDKUserMessage = typeof message === 'string'
        ? {
            type: 'user',
            session_id: sessionId,
            parent_tool_use_id: null,
            message: { role: 'user', content: message },
          }
        : { ...message, session_id: sessionId }
      const payload = JSON.stringify(frame) + '\n'
      pending = true
      try {
        await new Promise<void>((resolve, reject) => {
          child.stdin.write(payload, error => error ? reject(error) : resolve())
        })
      } catch (error) {
        close()
        throw error
      }
    },
    async *stream() {
      if (!pending || reading) throw new Error('No unread SDK turn')
      reading = true
      let completed = false
      try {
        while (!closed) {
          const line = await lines.next()
          if (line.done) {
            await exited
            if (closed) return
            throw failure ?? new Error('Claude CLI closed before returning a result')
          }
          if (!line.value.trim()) continue
          const message: SDKMessage = JSON.parse(line.value)
          if (message.type === 'result') {
            completed = true
            yield message
            return
          }
          yield message
        }
      } finally {
        reading = false
        pending = false
        if (!completed) close()
      }
    },
    close,
  }
}
