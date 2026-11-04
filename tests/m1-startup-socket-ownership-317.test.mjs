import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer, connect } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { assertSocketVacant317 } from '../src/bootstrap/socketOwnership317.mjs'

const cli = resolve(import.meta.dirname, '../dist/cli.js')
async function openOwner(path) {
  const server = createServer(peer => peer.end('ORIGINAL_OWNER'))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, resolve)
  })
  return server
}
async function checkOwner(path) {
  return new Promise((resolve, reject) => {
    const peer = connect(path)
    let data = ''
    peer.on('data', chunk => { data += chunk.toString() })
    peer.once('end', () => resolve(data))
    peer.once('error', reject)
  })
}
function launch(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('bun', [cli, ...args], {
      stdio:['ignore','pipe','pipe'], windowsHide:true,
      env:{...process.env,DISABLE_TELEMETRY:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'},
    })
    let out = '', err = ''
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(Error('Worker did not reject an already owned socket: ' + args.join(' ')))
    }, 12000)
    child.stdout.on('data', data => { out += data })
    child.stderr.on('data', data => { err += data })
    child.once('error', error => { clearTimeout(timeout); reject(error) })
    child.once('close', (code, signal) => {
      clearTimeout(timeout); resolve({code,signal,out,err})
    })
  })
}
test('317 shared socket owner guard preserves active owners and non-socket contents', {
  skip:process.platform==='win32',timeout:18000,
}, async()=>{
  const dir=mkdtempSync(join(tmpdir(),'333-socket-guard-'))
  const sock=join(dir,'owner.sock')
  let server
  try {
    server=await openOwner(sock)
    await assert.rejects(assertSocketVacant317(sock,'Test owner'),/Another Test owner already owns/)
    assert.equal(await checkOwner(sock),'ORIGINAL_OWNER')
    assert.equal(existsSync(sock),true)
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve))
  }
  try {
    writeFileSync(sock,'REGULAR_FILE')
    await assert.rejects(assertSocketVacant317(sock,'Test owner'),/not a socket/)
    assert.equal(readFileSync(sock,'utf8'),'REGULAR_FILE')
  } finally {rmSync(dir,{recursive:true,force:true})}
})
test('317 crashed worker socket is reclaimed and a replacement can bind', {
  skip: process.platform === 'win32', timeout: 20000,
}, async () => {
  const dir = mkdtempSync(join(tmpdir(), '333-stale-socket-'))
  const sock = join(dir, 'stale.sock')
  const child = spawn(process.execPath, ['-e',
    "require('node:net').createServer().listen(process.argv[1],()=>process.stdout.write('READY\\n'))", sock], {
    stdio:['ignore','pipe','pipe'],
  })
  try {
    await new Promise((resolve,reject) => {
      child.stdout.once('data', resolve)
      child.once('error', reject)
      child.once('close', code => reject(Error('owner exited before listening: ' + code)))
    })
    assert.equal(existsSync(sock), true)
    child.kill('SIGKILL')
    await new Promise(resolve => child.once('close', resolve))
    assert.equal(existsSync(sock), true, 'crashed owner should leave a stale socket')
    await assertSocketVacant317(sock, 'PTY host')
    assert.equal(existsSync(sock), false)
    const replacement = await openOwner(sock)
    assert.equal(await checkOwner(sock), 'ORIGINAL_OWNER')
    await new Promise(resolve => replacement.close(resolve))
  } finally {
    child.kill('SIGKILL')
    rmSync(dir, { recursive: true, force: true })
  }
})

test('317 preload, warm spare and PTY host cannot take over another live worker socket', {
  skip:process.platform==='win32',timeout:75000,
},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'333-socket-e2e-'))
  const sock=join(dir,'owned.sock')
  const server=await openOwner(sock)
  try {
    const calls=[
      ['--preload',sock],
      ['--bg-spare',sock],
      ['--bg-pty-host',sock,'80','24','--',process.execPath,'--version'],
    ]
    for(const args of calls) {
      const result=await launch(args)
      assert.equal(result.code,1,args[0]+' expected explicit ownership refusal: '+JSON.stringify(result))
      assert.equal(existsSync(sock),true,args[0]+' unlinked an active socket')
      assert.equal(await checkOwner(sock),'ORIGINAL_OWNER',args[0]+' displaced the original owner')
    }
  } finally {
    await new Promise(resolve=>server.close(resolve))
    rmSync(dir,{recursive:true,force:true})
  }
})
