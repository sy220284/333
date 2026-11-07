import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'

/**
 * A release smoke test, not a test double: executes dist/desktopHost's
 * separately compiled Bun binary over its public stdio protocol.
 * No real model token, cloud access, scheduled automation or agent execution.
 */
function startHost(binary, cwd, configDir, dataDir, sdkCli) {
  const child = spawn(binary, ['--cwd', cwd, '--data-dir', dataDir,
    ...(sdkCli ? ['--cli', sdkCli] : [])], {
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


// Minimal real stdio SDK child: same 2.1.317 control/stream-json wire shape as
// the SDK contract tests. It returns a deterministic local result without
// requiring network access or an API key.
const offlineCli = String.raw\`
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
const args=process.argv.slice(2)
const pick=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1]}
const sessionId=pick('--session-id')||pick('--resume')||randomUUID()
const send=frame=>process.stdout.write(JSON.stringify(frame)+'\\n')
const meta=()=>({session_id:sessionId,uuid:randomUUID()})
const reply=(id,payload)=>send({type:'control_response',response:{subtype:'success',request_id:id,response:payload}})
const reader=createInterface({input:process.stdin,crlfDelay:Infinity})
reader.on('line',line=>{
  try {
    const frame=JSON.parse(line)
    if(frame.type==='control_request'){
      if(frame.request.subtype==='initialize')reply(frame.request_id,{
        models:[{value:'offline-smoke-model',displayName:'离线验收模型',description:'本地SDK协议模拟'}],
        agents:[{name:'Explore',description:'离线任务模拟'}],
        commands:[],output_style:'default',available_output_styles:[],account:{},
      })
      else reply(frame.request_id,{})
    }else if(frame.type==='user'){
      send({type:'system',subtype:'task_started',task_id:'local-agent',
        description:'执行离线任务验证',task_type:'local_agent',...meta()})
      send({type:'system',subtype:'task_notification',task_id:'local-agent',
        status:'completed',summary:'离线任务完成',output_file:'',...meta()})
      send({type:'result',subtype:'success',is_error:false,terminal_reason:'completed',
        result:'已完成离线执行并验证工具与工作项状态',
        duration_ms:1,duration_api_ms:1,num_turns:1,
        stop_reason:null,total_cost_usd:0,usage:{},modelUsage:{},
        permission_denials:[],...meta()})
    }
  }catch(error){process.stderr.write(String(error)+'\\n');process.exitCode=1}
})
\`

test('真实桌面发行宿主和SDK子进程：工作项进入审核、人工确认及重启持久化', {
  timeout: 100000,
}, async () => {
  const binary=resolve(process.argv[2]??'dist/desktopHost')
  const root=await mkdtemp(join(tmpdir(),'yaoyao-sdk-deployed-'))
  const cwd=join(root,'workspace'),config=join(root,'config'),data=join(root,'journal')
  const cli=join(root,'offline-sdk-cli.mjs')
  await Promise.all([mkdir(cwd),mkdir(config),mkdir(data)])
  await writeFile(cli,offlineCli)
  let host
  try {
    host=startHost(binary,cwd,config,data,cli)
    const created=await host.call('missions.create',{objective:'离线代理任务真实SDK调度及审核'})
    assert.equal(created.ok,true,JSON.stringify(created))
    const missionId=created.result.id
    const queued=await host.call('missions.jobs.enqueue',{
      missionId,title:'校验真实模型调用链',instruction:'离线模拟一个完整SDK流式任务'
    })
    assert.equal(queued.ok,true,JSON.stringify(queued))
    const jobId=queued.result.id
    const started=await host.call('missions.jobs.start',{missionId,jobId})
    assert.equal(started.ok,true,JSON.stringify(started))
    assert.match(started.result.sessionId,/^[a-f0-9-]{36}$/)
    let found
    for(let i=0;i<80;i++){
      const response=await host.call('missions.jobs.list',{missionId})
      assert.equal(response.ok,true,JSON.stringify(response))
      found=response.result.find(job=>job.id===jobId)
      if(found?.status==='review')break
      await new Promise(resolve=>setTimeout(resolve,70))
    }
    assert.equal(found?.status,'review',JSON.stringify(found))
    assert.equal(found.history.length,1)
    const approved=await host.call('missions.jobs.approve',{missionId,jobId})
    assert.equal(approved.ok,true,JSON.stringify(approved))
    assert.equal(approved.result.status,'completed')
    await host.close()
    host=undefined
    host=startHost(binary,cwd,config,data,cli)
    const restored=await host.call('missions.jobs.list',{missionId})
    assert.equal(restored.ok,true,JSON.stringify(restored))
    assert.equal(restored.result.find(job=>job.id===jobId)?.status,'completed')
  } finally {
    if(host)await host.close()
    await rm(root,{recursive:true,force:true})
  }
})
