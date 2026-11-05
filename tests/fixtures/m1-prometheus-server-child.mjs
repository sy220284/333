import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer, connect } from 'node:net'
import { join } from 'node:path'

const require = createRequire(join(process.cwd(), '.rebuild/public/package.json'))
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus')
const { MeterProvider } = require('@opentelemetry/sdk-metrics')

const probe = createServer()
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const port = probe.address().port
await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()))

const exporter = new PrometheusExporter({ host: '127.0.0.1', port })
const provider = new MeterProvider({ readers: [exporter] })
provider.getMeter('333-security-regression').createCounter('pr7_security_probe').add(1)

async function request(line) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1')
    let data = ''
    socket.setTimeout(5000)
    socket.on('connect', () => socket.write(line + '\r\nHost: localhost\r\nConnection: close\r\n\r\n'))
    socket.on('data', part => { data += part.toString() })
    socket.on('end', () => resolve(data))
    socket.on('error', reject)
    socket.on('timeout', () => socket.destroy(new Error('metrics request timeout')))
  })
}

try {
  await new Promise(resolve => setTimeout(resolve, 200))
  const malicious = await request('GET http:// HTTP/1.1')
  assert.match(malicious, /^HTTP\/1\.1 400 /, malicious.slice(0, 100))
  const normal = await request('GET /metrics HTTP/1.1')
  assert.match(normal, /^HTTP\/1\.1 200 /, normal.slice(0, 100))
  assert.match(normal, /pr7_security_probe/, 'real counter was not exported')
  console.log(JSON.stringify({ malformed: 400, valid: 200, counter: true }))
} finally {
  await provider.shutdown()
}
