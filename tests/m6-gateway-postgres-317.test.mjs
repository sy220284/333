import { test, expect } from 'bun:test'
import { openGatewayStore317 } from '../src/cli/gateway/gatewayStore317.mjs'

const url = process.env.GATEWAY_TEST_POSTGRES_URL
if (!url) throw new Error('GATEWAY_TEST_POSTGRES_URL must name a disposable test Postgres database')

test('317 gateway Postgres: device approval, single-use token and refresh rotation persist', async () => {
  const store = await openGatewayStore317({
    postgres_url:url, connect_timeout_seconds:5, max_connections:4,
  })
  const id = String(Date.now()) + '-' + Math.random()
  try {
    const code = 'device-' + id
    const user = 'user-' + id
    await store.newDevice(code,user,3600)
    expect((await store.consumeDevice(code)).status).toBe('pending')
    expect(await store.approveCode(user,{
      sub:'employee-' + id, email:'employee@example.test',
    })).toBe(true)
    // The real gateway enforces the RFC 8628 polling interval after pending.
    const firstPoll = await store.consumeDevice(code,0)
    expect(firstPoll.status).toBe('approved')
    expect(firstPoll.claims.sub).toBe('employee-' + id)
    expect((await store.consumeDevice(code,0)).status).toBe('expired')
    const refresh = 'refresh-' + id
    await store.createRefresh(refresh,{
      sub:'employee-' + id, email:'employee@example.test',
    },3600)
    const used = await store.rotateRefresh(refresh)
    expect(used.sub).toBe('employee-' + id)
    expect(await store.rotateRefresh(refresh)).toBeNull()
    const access = 'access-' + id
    expect(await store.isRevoked(access)).toBe(false)
    await store.revoke(access)
    expect(await store.isRevoked(access)).toBe(true)
    await store.audit('device.approved','employee-' + id,'req-' + id,{
      test:true,
    })
  } finally { await store.close() }
})
