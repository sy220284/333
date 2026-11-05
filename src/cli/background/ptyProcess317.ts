import { connectPtyHost317, type PtyHostConnection317 } from './ptyConnection317.ts'

type Exit317 = {code:number;signal?:string|number}
export type ManagedPtyProcess317 = {
  pid:number
  exited:Promise<number>
  terminal:{
    write(data:Buffer|string):void
    resize(cols:number,rows:number):void
    close():void
  }
  kill(signal?:NodeJS.Signals):void
  detach():void
}
export type ManagedPtyOptions317 = {
  hostPid:number
  socketPath:string
  token:string
  onReplay:(data:Buffer)=>Promise<void>|void
  onOutput:(data:Buffer)=>void
  onExit:(process:ManagedPtyProcess317,code:number,signal?:string|number)=>void
  isAlive:(pid:number)=>boolean
  onStatus?:(text:string)=>void
  signal?:AbortSignal
}
async function delay(ms:number,signal?:AbortSignal):Promise<void>{
  if(signal?.aborted)throw signal.reason
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(done,ms)
    function done(){signal?.removeEventListener('abort',cancel);resolve()}
    function cancel(){clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(signal?.reason)}
    signal?.addEventListener('abort',cancel,{once:true})
  })
}
/**
 * Reconnects a running PTY host after a transient transport failure or daemon
 * restart. The worker remains alive while its socket is unavailable.
 * The caller persists host identity and its private authentication token.
 */
export async function adoptPtyProcess317(
  options:ManagedPtyOptions317,
):Promise<ManagedPtyProcess317>{
  const status=options.onStatus??(()=>{})
  let detached=false
  let active:PtyHostConnection317|undefined
  let resolveExit!:(code:number)=>void
  const exited=new Promise<number>(resolve=>{resolveExit=resolve})
  const connectOnce=()=>connectPtyHost317({
    socketPath:options.socketPath,expectedHostPid:options.hostPid,
    token:options.token,onReplay:options.onReplay,onOutput:options.onOutput,
    signal:options.signal,
    onTransportError:error=>status('PTY transport: '+error.message),
  })
  // The host may still be binding its socket immediately after spawn.
  for(let i=0;i<50;i++){
    try{active=await connectOnce();break}
    catch(error){
      if(i===49||!options.isAlive(options.hostPid))throw error
      await delay(100,options.signal)
    }
  }
  if(!active)throw new Error('PTY host did not acknowledge its socket handshake')
  let worker:ManagedPtyProcess317
  worker={
    pid:options.hostPid,exited,
    terminal:{
      write(data){if(!active)throw new Error('PTY host is reconnecting');active.write(data)},
      resize(cols,rows){if(!active)throw new Error('PTY host is reconnecting');active.resize(cols,rows)},
      close(){detached=true;active?.detach();active=undefined},
    },
    kill(signal='SIGTERM'){
      if(!active)throw new Error('PTY host is reconnecting; kill cannot be authenticated')
      active.kill(signal)
    },
    detach(){detached=true;active?.detach();active=undefined},
  }
  void (async()=>{
    let conn=active!
    while(!detached){
      const winner=await Promise.race([
        conn.exited.then((outcome:Exit317)=>({kind:'exit' as const,outcome})),
        conn.closed.then(()=>({kind:'close' as const})),
      ])
      if(detached)return
      if(winner.kind==='exit'){
        detached=true
        resolveExit(winner.outcome.code)
        options.onExit(worker,winner.outcome.code,winner.outcome.signal)
        conn.detach()
        return
      }
      active=undefined
      status('PTY host connection interrupted; recovering '+options.socketPath)
      while(!detached){
        if(!options.isAlive(options.hostPid)){
          detached=true
          resolveExit(1)
          options.onExit(worker,1,'PTY_HOST_DISCONNECTED')
          return
        }
        try{
          conn=await connectOnce()
          active=conn
          status('PTY host connection recovered '+options.socketPath)
          break
        }catch(error){
          if(options.signal?.aborted)return
          status('PTY reconnect: '+String(error))
          await delay(1_000,options.signal)
        }
      }
    }
  })().catch(error=>{
    status('PTY supervision failed: '+String(error))
    if(!detached){
      detached=true
      resolveExit(1)
      options.onExit(worker,1,'PTY_SUPERVISION_FAILED')
    }
  })
  return worker
}
