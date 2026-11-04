import { expect, test } from 'bun:test'
import axios from 'axios'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rootCertificates } from 'node:tls'
import { configureGlobalAgents } from '../src/utils/proxy.js'
import { clearMTLSCache } from '../src/utils/mtls.js'
import { clearCACertsCache } from '../src/utils/caCerts.js'

test('global proxy bypass keeps TLS certificates off plain HTTP connections', async () => {
  const keys = ['https_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS'] as const
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const directory = mkdtempSync(join(tmpdir(), '333-proxy-http-'))
  const cert = join(directory, 'root.pem')
  writeFileSync(cert, rootCertificates[0]!)
  const server = createServer((_request, response) => response.end('HTTP_OK'))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    process.env.https_proxy = process.env.https_proxy ?? process.env.HTTPS_PROXY ?? 'http://127.0.0.1:9'
    process.env.no_proxy = '127.0.0.1'
    process.env.NODE_EXTRA_CA_CERTS = cert
    clearMTLSCache()
    clearCACertsCache()
    configureGlobalAgents()
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected TCP listener')
    const response = await axios.get(`http://127.0.0.1:${address.port}`, { timeout: 2000 })
    expect(response.data).toBe('HTTP_OK')
  } finally {
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key]
      else process.env[key] = before[key]
    }
    clearMTLSCache()
    clearCACertsCache()
    configureGlobalAgents()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})
