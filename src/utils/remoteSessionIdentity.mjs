import { createHash, randomUUID } from 'node:crypto'

// Extracted from the 2.1.317 native session identity logic
// (chunk-wxyh2ndv.js): remote session identifiers are namespaced UUIDv5.
const REMOTE_SESSION_NAMESPACE = '3ab19d7e-9f35-45c2-926e-75e271cc60b3'
const namespaceBytes = Buffer.from(REMOTE_SESSION_NAMESPACE.replaceAll('-', ''), 'hex')

function isEnabled(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function remoteSessionUuid(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return null
  const bytes = createHash('sha1').update(namespaceBytes).update(trimmed, 'utf8').digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function shouldIsolateChildSession(env = process.env, argv = process.argv) {
  if (!isEnabled(env.CLAUDE_CODE_CHILD_SESSION) || !remoteSessionUuid(env.CLAUDE_CODE_REMOTE_SESSION_ID)) return false
  // -- terminates CLI options. A prompt containing --sdk-url must not affect identity.
  const separator = argv.indexOf('--')
  const cliArgs = separator === -1 ? argv : argv.slice(0, separator)
  const sdkUrl = cliArgs.some((arg, index) =>
    arg === '--sdk-url' ? Boolean(cliArgs[index + 1]) : arg.startsWith('--sdk-url=') && arg !== '--sdk-url=')
  const mcpServer = argv[2] === 'mcp' && argv[3] === 'serve'
  return !sdkUrl && !mcpServer
}

export function resolveInitialSessionId(env = process.env, argv = process.argv, generateId = randomUUID) {
  const remote = remoteSessionUuid(env.CLAUDE_CODE_REMOTE_SESSION_ID)
  if (remote === null) return generateId()
  if (shouldIsolateChildSession(env, argv) && !isEnabled(env.CLAUDE_CODE_DISABLE_NESTED_SESSION_ID))
    return generateId()
  return remote
}
