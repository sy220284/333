import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const localCli = resolve(import.meta.dirname, '../dist/cli.js')
const bins = [['rebuilt', 'bun', [localCli]]]
const official = process.env.CLAUDE_REFERENCE_BIN || process.env.CLAUDE_TARGET_X64
if (official) bins.unshift(['official', official, []])
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'eval-mock-317-'))
  const specPath = join(dir, 'spec.json')
  const callLogPath = join(dir, 'calls.jsonl')
  const spec = {
    registeredName: 'mock-tools', server: 'fixture', nonce: 'nonce-123', callLogPath,
    tools: [{ name: 'echo', description: 'Echo test',
      inputSchema: { properties: { text: { type: 'string' } } } },
    { name: 'fail', description: 'Error test', inputSchema: {} },
    { name: 'missing', description: 'Missing mock', inputSchema: {} }],
    responders: {
      echo: { kind: 'fixed', body: 'Echo {{input.text}}',
        isError: false, expect: null, baseDir: dir },
      fail: { kind: 'fixed', body: 'ERROR-317', isError: true, expect: null, baseDir: dir },
    },
    agent: null,
  }
  const bytes = Buffer.from(JSON.stringify(spec))
  writeFileSync(specPath, bytes)
  return { dir, specPath, callLogPath, bytes, spec }
}
function start(binary, prefix, fixtureData) {
  const sha = createHash('sha256').update(fixtureData.bytes).digest('hex')
  const child = spawn(binary, [...prefix, '--eval-mock-server', fixtureData.specPath, sha], {
    stdio: ['pipe', 'pipe', 'pipe'], env: {
      ...process.env, DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CONFIG_DIR: fixtureData.dir,
    },
  })
  const pending = new Map(), orphan = []
  let output = '', stderr = '', lines = []
  child.stdout.on('data', data => {
    output += data.toString()
    let eol
    while ((eol = output.indexOf('\n')) !== -1) {
      const raw = output.slice(0, eol)
      output = output.slice(eol + 1)
      if (!raw) continue
      try {
        const packet = JSON.parse(raw)
        if (packet.id != null && pending.has(packet.id)) {
          pending.get(packet.id)(packet)
          pending.delete(packet.id)
        } else orphan.push(packet)
      } catch { lines.push(raw) }
    }
  })
  child.stderr.on('data', data => { stderr += data.toString() })
  const result = async (id, method, params) => {
    const waiting = new Promise((resolveResult, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id)
        reject(Error('MCP timeout: ' + method + '\n' + stderr + '\n' + lines.join('\n')))
      }, 12_000)
      pending.set(id, packet => { clearTimeout(timeout); resolveResult(packet) })
    })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n')
    return await waiting
  }
  const sendNotification = (method, params = {}) =>
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',method,params}) + '\n')
  const stop = async () => {
    if (!child.killed) child.stdin.end()
    await Promise.race([new Promise(resolveDone => child.once('close', resolveDone)),
      new Promise((_, reject) => setTimeout(() => reject(Error('eval mock child did not terminate')), 8000))])
  }
  return { child, result, sendNotification, stop, stderr: () => stderr, orphan }
}

test('317 eval mock fixed responders, error responders, missing tools and call identity', { timeout: 75_000 }, async () => {
  for (const [name, binary, prefix] of bins) {
    const data = fixture()
    let worker
    try {
      worker = start(binary, prefix, data)
      const init = await worker.result(1, 'initialize', {
        protocolVersion: '2025-03-26', capabilities: {},
        clientInfo: { name: 'm1-317-diff', version: '1' },
      })
      assert.equal(init.result?.serverInfo?.name, 'eval-mock/fixture', name)
      assert.equal(init.result?.serverInfo?.version, '1', name)
      worker.sendNotification('notifications/initialized')
      const tools = await worker.result(2, 'tools/list')
      assert.deepEqual(tools.result.tools.map(t => t.name), ['echo', 'fail', 'missing'], name)
      const call = await worker.result(3, 'tools/call', {name:'echo',arguments:{text:'YES'}})
      assert.deepEqual(call.result, {content:[{type:'text',text:'Echo YES'}]}, name)
      const failed = await worker.result(4,'tools/call',{name:'fail',arguments:{}})
      assert.deepEqual(failed.result,{content:[{type:'text',text:'ERROR-317'}],isError:true},name)
      const missing = await worker.result(5,'tools/call',{name:'missing',arguments:{}})
      assert.deepEqual(missing.result,{
        content:[{type:'text',text:'no mock for fixture/missing'}],isError:true,
      },name)
      const lines = readFileSync(data.callLogPath,'utf8').trim().split('\n').map(JSON.parse)
      assert.deepEqual(lines[0],{ready:'nonce-123',server:'fixture'},name)
      assert.deepEqual(lines.slice(1).map(x=>[x.seq,x.tool,x.verdict]),
        [[0,'echo','ok'],[1,'fail','tool_error'],[2,'missing','tool_error']],name)
      assert.deepEqual(lines[1].input, { text: 'YES' }, name)
      await worker.stop()
    } finally {
      if (worker && worker.child.exitCode == null) worker.child.kill('SIGKILL')
      rmSync(data.dir,{recursive:true,force:true})
    }
  }
})

test('317 eval mock rejects changed specs and unknown file without entering MCP', { timeout: 35_000 }, () => {
  for (const [name, bin, prefix] of bins) {
    const data = fixture()
    try {
      const result = spawnSync(bin,[...prefix,'--eval-mock-server',data.specPath,'0'.repeat(64)],
        {encoding:'utf8',timeout:10000,env:{...process.env,CLAUDE_CONFIG_DIR:data.dir}})
      assert.equal(result.status,1,name)
      assert.match(result.stderr,/spec file does not match the hash/i,name)
      assert.equal(existsSync(data.callLogPath),false,name)
      const missing = spawnSync(bin,[...prefix,'--eval-mock-server',join(data.dir,'missing.json')],
        {encoding:'utf8',timeout:10000,env:{...process.env,CLAUDE_CONFIG_DIR:data.dir}})
      assert.equal(missing.status,1,name)
    } finally { rmSync(data.dir,{recursive:true,force:true}) }
  }
})

test('317 eval mock interpolates bounded fixture and enforces typed, regex and path guards',
  { timeout: 75_000 }, async () => {
    for (const [name, binary, prefix] of bins) {
      const data = fixture()
      let worker
      try {
        writeFileSync(join(data.dir, 'note.txt'), 'FROM_FILE')
        for (const tool of ['file', 'type', 'regex', 'outside'])
          data.spec.tools.push({ name: tool, description: tool, inputSchema: {} })
        const addResponder = (body, expect = null) => ({
          kind:'fixed', body, isError:false, expect, baseDir:data.dir,
        })
        data.spec.responders.file = addResponder('{{file:note.txt}}')
        data.spec.responders.type = addResponder('ok', { text: 'string' })
        data.spec.responders.regex = addResponder('ok', { text: '/^OK/i' })
        data.spec.responders.outside = addResponder('{{file:../outside.txt}}')
        data.bytes = Buffer.from(JSON.stringify(data.spec))
        writeFileSync(data.specPath, data.bytes)
        worker = start(binary, prefix, data)
        const init = await worker.result(1,'initialize',{
          protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'m1',version:'1'},
        })
        assert.equal(init.result?.serverInfo?.name,'eval-mock/fixture',name)
        worker.sendNotification('notifications/initialized')
        const calls = [
          ['file',{},'FROM_FILE',false],
          ['type',{text:10},'eval aborted by mock nonce-123: fixture/type — input violates expect: text = 10 is not a string',true],
          ['type',{text:'YES'},'ok',false],
          ['regex',{text:'ok!'},'ok',false],
          ['regex',{text:'other'},'eval aborted by mock nonce-123: fixture/regex — input violates expect: text = "other" does not match /^OK/i',true],
          ['outside',{},"{{file:../outside.txt}} names a path outside the mock's directory",true],
        ]
        for (let index=0;index<calls.length;index++) {
          const [tool, args, expected, isError] = calls[index]
          const reply = await worker.result(index+2,'tools/call',{name:tool,arguments:args})
          assert.deepEqual(reply.result,
            {content:[{type:'text',text:expected}],...(isError?{isError:true}:{})},
            name+' '+tool+' #'+index)
        }
        const lines = readFileSync(data.callLogPath,'utf8').trim().split('\n').map(JSON.parse)
        assert.equal(lines.length,7,name)
        assert.deepEqual(lines.slice(1).map(line=>line.seq),[0,1,2,3,4,5],name)
        await worker.stop()
      } finally {
        if(worker&&worker.child.exitCode==null)worker.child.kill('SIGKILL')
        rmSync(data.dir,{recursive:true,force:true})
      }
    }
  })
