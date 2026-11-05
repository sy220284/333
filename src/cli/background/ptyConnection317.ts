import { connect, type Socket } from 'node:net'
import {
  createPtyFrameDecoder317, encodePtyControl317, encodePtyData317,
} from '../../bootstrap/ptyWire317.ts'

export type PtyHostConnection317 = {
  pid: number
  exited: Promise<{ code: number; signal?: string | number }>
  closed: Promise<void>
  write(data: Buffer | string): void
  resize(cols: number, rows: number): void
  kill(signal?: NodeJS.Signals): void
  detach(): void
}
export type PtyConnectOptions317 = {
  socketPath: string
  expectedHostPid: number
  token: string
  onReplay: (data: Buffer) => Promise<void> | void
  onOutput: (data: Buffer) => void
  onTransportError?: (error: Error) => void
  signal?: AbortSignal
}

export async function connectPtyHost317(
  options: PtyConnectOptions317,
): Promise<PtyHostConnection317> {
  const {socketPath,expectedHostPid,token,signal}=options
  if (!Number.isSafeInteger(expectedHostPid)||expectedHostPid<1)
    throw new Error('Invalid PTY host process identity')
  if(!token)throw new Error('PTY host credential is required')
  if(signal?.aborted)throw signal.reason
  let socket:Socket
  let exited = false
  let detached = false
  let live = false
  let replayDelivered = false
  let resolvedReady = false
  let ended = false
  let replayBytes = 0
  let pendingExit: {code:number;signal?:string|number} | undefined
  let replayChunks:Buffer[]=[]
  let queuedLive:Buffer[]=[]
  let resolveExit!: (outcome:{code:number;signal?:string|number})=>void
  let resolveClose!:()=>void
  let resolveReady!:()=>void
  let rejectReady!:(error:Error)=>void
  const exitPromise = new Promise<{code:number;signal?:string|number}>(resolve=>{resolveExit=resolve})
  const closedPromise = new Promise<void>(resolve=>{resolveClose=resolve})
  const readyPromise = new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject})
  const fail=(error:Error)=>{
    if(!resolvedReady){resolvedReady=true;rejectReady(error)}
    else if(!detached)options.onTransportError?.(error)
  }
  const finalizeClose=()=>{
    if(ended)return
    ended=true
    resolveClose()
    if(!resolvedReady)fail(new Error('PTY host disconnected before live handshake'))
    else if(!exited&&!detached)
      options.onTransportError?.(new Error('PTY host transport closed before exit frame'))
  }
  socket=connect(socketPath)
  const writeCtrl=(data:Record<string,unknown>)=>{
    if(socket.destroyed||!socket.writable)throw new Error('PTY host transport disconnected')
    socket.write(encodePtyControl317(data))
  }
  const decoder=createPtyFrameDecoder317(frame=>{
    if(frame.kind===0){
      if(!live){
        replayBytes+=frame.payload.byteLength
        if(replayBytes>2*1024*1024){
          fail(new Error('PTY replay exceeded expected bound'))
          socket.destroy()
          return
        }
        replayChunks.push(frame.payload)
      }else if(!replayDelivered)queuedLive.push(frame.payload)
      else options.onOutput(frame.payload)
      return
    }
    if(!frame.ctrl||typeof frame.ctrl!=='object'||Array.isArray(frame.ctrl))
      return
    const packet=frame.ctrl as Record<string,unknown>
    switch(packet.t){
      case 'hello':
        if(typeof packet.replPid!=='number'||!Number.isSafeInteger(packet.replPid)||packet.replPid<1){
          fail(new Error('PTY host returned invalid child identity'))
          socket.destroy()
        }
        return
      case 'auth-required':
        writeCtrl({t:'auth',token})
        return
      case 'ping':
        writeCtrl({t:'pong'})
        return
      case 'live':
        if(live)return
        live=true
        void Promise.resolve().then(()=>options.onReplay(Buffer.concat(replayChunks))).then(()=>{
          replayChunks=[]
          replayDelivered=true
          for(const chunk of queuedLive)options.onOutput(chunk)
          queuedLive=[]
          if(pendingExit){resolveExit(pendingExit);pendingExit=undefined}
          if(!resolvedReady){resolvedReady=true;resolveReady()}
        }).catch(error=>{
          fail(error instanceof Error?error:new Error(String(error)))
          socket.destroy()
        })
        return
      case 'exit':
        if(exited)return
        exited=true
        const outcome={code:typeof packet.code==='number'?packet.code:1,
          ...(typeof packet.signal==='string'||typeof packet.signal==='number'
            ?{signal:packet.signal}:{})}
        if(replayDelivered)resolveExit(outcome)
        else pendingExit=outcome
        return
    }
  },reason=>{
    fail(new Error('PTY frame rejected: '+reason))
    socket.destroy()
  })
  socket.on('connect',()=>{
    try { writeCtrl({t:'auth',token}) }
    catch(error){fail(error instanceof Error?error:new Error(String(error)));socket.destroy()}
  })
  socket.on('data',decoder)
  socket.on('error',error=>{fail(error);socket.destroy()})
  socket.on('close',finalizeClose)
  const abort=()=>{
    fail(new Error('PTY host connection was cancelled'))
    socket.destroy()
  }
  signal?.addEventListener('abort',abort,{once:true})
  try{await readyPromise}
  catch(error){socket.destroy();throw error}
  finally{signal?.removeEventListener('abort',abort)}
  return {
    pid:expectedHostPid,
    exited:exitPromise,
    closed:closedPromise,
    write(data){socket.write(encodePtyData317(data))},
    resize(cols,rows){writeCtrl({t:'resize',cols,rows})},
    kill(signal='SIGTERM'){writeCtrl({t:'kill',sig:signal==='SIGKILL'?'SIGKILL':'SIGTERM'})},
    detach(){detached=true;socket.destroy()},
  }
}
