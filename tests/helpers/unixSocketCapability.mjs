/** Detect whether the current test host can bind AF_UNIX sockets.
 * This probes the OS directly; production socket functionality is never stubbed.
 * A restricted sandbox reports an explicit skip while CI hosts with UDS
 * support continue to run the real preload/spare handshake assertions. */
import { createServer } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOST_SOCKET_RESTRICTIONS = new Set([
  'EACCES', 'EPERM', 'EAFNOSUPPORT', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS',
])

export async function probeUnixSocketCapability() {
  if (process.platform === 'win32') return { available: false, reason: 'Windows does not run these Unix socket tests' }
  const dir = mkdtempSync(join(tmpdir(), '333-uds-probe-'))
  const server = createServer()
  try {
    const path = join(dir, 'probe.sock')
    await new Promise((resolve, reject) => {
      const onError = error => {
        server.off('listening', onListening)
        reject(error)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(path)
    })
    return { available: true }
  } catch (error) {
    if (HOST_SOCKET_RESTRICTIONS.has(error?.code)) {
      return { available: false, reason: `Unix socket bind blocked by host: ${error.code}` }
    }
    throw error
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
    rmSync(dir, { recursive: true, force: true })
  }
}

export async function skipWhenUnixSocketUnavailable(testContext) {
  const support = await probeUnixSocketCapability()
  if (support.available) return false
  testContext.skip(support.reason)
  return true
}
