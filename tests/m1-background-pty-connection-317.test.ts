import { test, expect } from 'bun:test'
import { createServer, type Socket } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createPtyFrameDecoder317, encodePtyControl317, encodePtyData317,
} from '../src/bootstrap/ptyWire317.ts'
import { connectPtyHost317 } from '../src/cli/background/ptyConnection317.ts'

test('317 adopted PTY replays buffered bytes before live output and forwards controls', async () => {
  if (process.platform === 'win32') return
  const dir=await mkdtemp(join(tmpdir(),'pty-connection-317-'))
  const path=join(dir,'pty.sock'),received:string[]=[],trace:string[]=[]
  const server=createServer((peer:Socket)=>{
    const decoder=createPtyFrameDecoder317(frame=>{
      if(frame.kind===1 && frame.ctrl && typeof frame.ctrl==='object') {
        const ctrl=frame.ctrl as Record<string,unknown>
        received.push(String(ctrl.t))
      } else if(frame.kind===0)received.push('data:'+frame.payload.toString())
    },reason=>{throw new Error(reason)})
    peer.on('data',decoder)
    peer.write(encodePtyControl317({t:'hello',replPid:123,version:'2.1.317'}))
    peer.write(encodePtyData317('old output'))
    peer.write(encodePtyControl317({t:'live'}))
    peer.write(encodePtyData317('new output'))
    peer.write(encodePtyControl317({t:'ping'}))
  })
  try {
    await new Promise<void>((resolve,reject)=>{
      server.once('error',reject)
      server.listen(path,()=>{server.off('error',reject);resolve()})
    })
    const client=await connectPtyHost317({
      socketPath:path,expectedHostPid:12,token:'secret',
      onReplay:async data=>{trace.push('replay:'+data.toString())},
      onOutput:data=>{trace.push('live:'+data.toString())},
    })
    await Bun.sleep(30)
    expect(trace).toEqual(['replay:old output','live:new output'])
    expect(received).toContain('auth')
    expect(received).toContain('pong')
    client.write('input')
    client.resize(120,40)
    client.kill('SIGTERM')
    await Bun.sleep(20)
    expect(received).toContain('data:input')
    expect(received).toContain('resize')
    expect(received).toContain('kill')
    client.detach()
    await client.closed
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()))
    await rm(dir,{recursive:true,force:true})
  }
})
