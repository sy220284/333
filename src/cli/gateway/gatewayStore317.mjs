/**
 * Postgres-backed device grants, bearer revocation and audit records.
 * All token material is stored only as SHA-256 hashes.
 */
import { createHash } from 'node:crypto'

const hash = input => createHash('sha256').update(input).digest('hex')

export async function openGatewayStore317(config) {
  if (typeof Bun === 'undefined' || typeof Bun.SQL !== 'function') {
    throw new Error('Enterprise gateway requires native Bun with Bun.SQL')
  }
  const database = new Bun.SQL({
    url: config.postgres_url,
    max: config.max_connections ?? 10,
    connectionTimeout: (config.connect_timeout_seconds ?? 10) * 1000,
    ...(config.username && { username: config.username }),
    ...(config.password && { password: config.password }),
  })
  try {
    await database`SELECT 1`
    await database`
      CREATE TABLE IF NOT EXISTS claude_gateway_device_authorizations (
        device_hash TEXT PRIMARY KEY,
        user_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        approved JSONB,
        consumed BOOLEAN NOT NULL DEFAULT FALSE,
        last_poll_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    await database`
      CREATE TABLE IF NOT EXISTS claude_gateway_refresh_tokens (
        token_hash TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        claims JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    await database`
      CREATE TABLE IF NOT EXISTS claude_gateway_revocations (
        token_hash TEXT PRIMARY KEY,
        expires_at TIMESTAMPTZ NOT NULL
      )`
    await database`
      CREATE TABLE IF NOT EXISTS claude_gateway_audit (
        id BIGSERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        event_type TEXT NOT NULL,
        subject TEXT,
        request_id TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      )`
    return {
      async newDevice(deviceCode, userCode, expiresSeconds) {
        await database`
          INSERT INTO claude_gateway_device_authorizations
            (device_hash, user_hash, expires_at)
          VALUES (${hash(deviceCode)}, ${hash(userCode)}, NOW() + (${expiresSeconds} * INTERVAL '1 second'))`
      },
      async approveCode(userCode, claims) {
        const rows = await database`
          UPDATE claude_gateway_device_authorizations
          SET approved = ${JSON.stringify(claims)}::jsonb
          WHERE user_hash = ${hash(userCode)} AND expires_at > NOW()
            AND consumed = FALSE
          RETURNING device_hash`
        return rows.length === 1
      },
      async consumeDevice(deviceCode, minPollSeconds = 5) {
        const key = hash(deviceCode)
        const rows = await database`
          SELECT device_hash, approved, consumed, expires_at, last_poll_at
          FROM claude_gateway_device_authorizations WHERE device_hash = ${key}`
        const current = rows[0]
        if (!current || new Date(current.expires_at).getTime() <= Date.now()) return { status: 'expired' }
        if (current.consumed) return { status: 'expired' }
        if (current.last_poll_at &&
          Date.now() - new Date(current.last_poll_at).getTime() < minPollSeconds * 1000) {
          return { status: 'slow_down' }
        }
        await database`
          UPDATE claude_gateway_device_authorizations
          SET last_poll_at = NOW() WHERE device_hash = ${key}`
        if (!current.approved) return { status: 'pending' }
        const done = await database`
          UPDATE claude_gateway_device_authorizations SET consumed = TRUE
          WHERE device_hash = ${key} AND consumed = FALSE
          RETURNING approved`
        return done.length ? { status: 'approved', claims: done[0].approved } : { status: 'expired' }
      },
      async createRefresh(token, claims, expiresSeconds) {
        await database`
          INSERT INTO claude_gateway_refresh_tokens
            (token_hash, subject, claims, expires_at)
          VALUES (${hash(token)}, ${claims.sub},
            ${JSON.stringify(claims)}::jsonb, NOW() + (${expiresSeconds} * INTERVAL '1 second'))`
      },
      async rotateRefresh(token) {
        const rows = await database`
          UPDATE claude_gateway_refresh_tokens SET revoked = TRUE
          WHERE token_hash = ${hash(token)} AND revoked = FALSE AND expires_at > NOW()
          RETURNING claims`
        return rows[0]?.claims ?? null
      },
      async revoke(token, seconds = 86400) {
        await database`
          INSERT INTO claude_gateway_revocations (token_hash, expires_at)
          VALUES (${hash(token)}, NOW() + (${seconds} * INTERVAL '1 second'))
          ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`
        await database`
          UPDATE claude_gateway_refresh_tokens SET revoked = TRUE
          WHERE token_hash = ${hash(token)}`
      },
      async isRevoked(token) {
        const rows = await database`
          SELECT 1 FROM claude_gateway_revocations
          WHERE token_hash = ${hash(token)} AND expires_at > NOW() LIMIT 1`
        return rows.length > 0
      },
      async audit(event_type, subject, request_id, metadata = {}) {
        await database`
          INSERT INTO claude_gateway_audit
            (event_type, subject, request_id, metadata)
          VALUES (${event_type}, ${subject ?? null},
            ${request_id ?? null}, ${JSON.stringify(metadata)}::jsonb)`
      },
      async close() { await database.close() },
    }
  } catch (error) {
    await database.close()
    throw error
  }
}
