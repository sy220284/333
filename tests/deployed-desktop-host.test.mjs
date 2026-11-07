import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'

/**
 * A release smoke test, not a test double: executes dist/desktopHost's
 * separately compiled Bun binary over its public stdio protocol.
 * No real model token, cloud access, scheduled automation or agent execution.
 */
function startHost(binary, cwd, configDir, dataDir) {
  const child = spawn(binary, ['--cwd', cwd, '--data-dir', dataDir], {
    cwd,
    env: {
      ...process.env,
      YAOYAOCHE_CONFIG_DIR: configDir,
      CLAUDE_CONFIG_DIR: configDir,
      CLAUDE_CODE_COORDINATOR_MODE: '0',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-5000) })
  const waiting = new Map()
  const reader = createInterface({ input: child.stdout, crlfDelay: Infinity })
  reader.on('line', line => {
    try {
      const message = JSON.parse(line)
      if (typeof message.id !== 'string') return // async events
      const pending = waiting.get(message.id)
      if (!pending) return
      waiting.delete(message.id)
      clearTimeout(pending.timeout)
      pending.resolve(message)
    } catch (error) {
      for (const pending of waiting.values()) {
        clearTimeout(pending.timeout)
        pending.reject(new Error(`Invalid desktop host frame: ${String(error)}`))
      }
      waiting.clear()
    }
  })
  child.on('error', error => {
    for (const pending of waiting.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    waiting.clear()
  })
  child.on('close', (code, signal) => {
    for (const pending of waiting.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error(`Desktop host closed: ${signal ?? code} ${stderr}`))
    }
    waiting.clear()
  })

  return {
    async call(method, args = {}) {
      const id = randomUUID()
      const reply = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          waiting.delete(id)
          reject(new Error(`Desktop host request ${method} timed out; stderr: ${stderr}`))
        }, 20000)
        waiting.set(id, { resolve, reject, timeout })
        child.stdin.write(JSON.stringify({ id, method, ...args }) + '\n', error => {
          if (!error) return
          clearTimeout(timeout)
          waiting.delete(id)
          reject(error)
        })
      })
      return reply
    },
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return
      const ended = new Promise(resolve => child.once('close', resolve))
      child.stdin.end()
      const deadline = setTimeout(() => child.kill('SIGTERM'), 15000)
      try { await ended } finally { clearTimeout(deadline); reader.close() }
    },
  }
}

test('已编译发行宿主：启动、长期目标、排队、取消、归档、跨项目隔离和重启恢复', {
  timeout: 100000,
}, async () => {
  const binary = resolve(process.argv[2] ?? 'dist/desktopHost')
  const root = await mkdtemp(join(tmpdir(), 'yaoyao-deployed-smoke-'))
  const project = join(root, 'workspace-A')
  const otherProject = join(root, 'workspace-B')
  const config = join(root, 'local-config')
  const data = join(root, 'local-journal')
  await Promise.all([mkdir(project), mkdir(otherProject), mkdir(config), mkdir(data)])
  let host
  try {
    host = startHost(binary, project, config, data)
    const greeting = await host.call('hello')
    assert.equal(greeting.ok, true, JSON.stringify(greeting))
    assert.equal(greeting.result?.protocolVersion, 1)
    assert.ok(greeting.result.capabilities.includes('mission_jobs'))

    const empty = await host.call('missions.list')
    assert.equal(empty.ok, true, JSON.stringify(empty))
    assert.deepEqual(empty.result.missions, [])

    const created = await host.call('missions.create', {
      objective: '离线端到端验收：记录、排队及恢复（不实际启动模型）',
    })
    assert.equal(created.ok, true, JSON.stringify(created))
    const missionId = created.result.id
    assert.match(missionId, /^mission_[a-f0-9]{16}$/)

    const queued = await host.call('missions.jobs.enqueue', {
      missionId, title: '仅核查本地记录', instruction: '保留工作项，不执行外部操作',
    })
    assert.equal(queued.ok, true, JSON.stringify(queued))
    const jobId = queued.result.id
    assert.match(jobId, /^job_[a-f0-9]{16}$/)

    const index = await host.call('missions.jobs.list', { missionId })
    assert.equal(index.ok, true, JSON.stringify(index))
    assert.equal(index.result.length, 1)
    assert.equal(index.result[0].status, 'queued')
    const preComplete = await host.call('missions.updateStatus', { missionId, status: 'completed' })
    assert.equal(preComplete.ok, false, 'Incomplete job must prevent false mission completion')

    const cancelled = await host.call('missions.jobs.cancel', { missionId, jobId })
    assert.equal(cancelled.ok, true, JSON.stringify(cancelled))
    assert.equal(cancelled.result.status, 'cancelled')

    const done = await host.call('missions.updateStatus', { missionId, status: 'completed' })
    assert.equal(done.ok, true, JSON.stringify(done))
    assert.equal(done.result.status, 'completed')
    await host.close()
    host = undefined

    const other = startHost(binary, otherProject, config, join(root, 'other-journal'))
    try {
      const denied = await other.call('missions.get', { missionId })
      assert.equal(denied.ok, false, 'Must reject access to another project')
    } finally { await other.close() }

    host = startHost(binary, project, config, data)
    const restored = await host.call('missions.list')
    assert.equal(restored.ok, true, JSON.stringify(restored))
    assert.equal(restored.result.missions.find(item => item.id === missionId)?.status, 'completed')
    const jobs = await host.call('missions.jobs.list', { missionId })
    assert.equal(jobs.ok, true, JSON.stringify(jobs))
    assert.equal(jobs.result.find(item => item.id === jobId)?.status, 'cancelled')
    const configFile = join(config, 'agent-missions', `${missionId}.json`)
    assert.equal(JSON.parse(await readFile(configFile, 'utf8')).status, 'completed')
  } finally {
    if (host) await host.close()
    await rm(root, { recursive: true, force: true })
  }
})
