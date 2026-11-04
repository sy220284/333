import { createServer } from 'node:net'
import { timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  PRELOAD_RESET_KEYS_317, runClaimedSession317, validatePreloadClaim317,
} from './preload317.mjs'

/** 2.1.317 chunk-f908v4te.js / chunk-d1js6kn4.js: authenticated warm spare. */
export type BgSpareClaim317 = {
  cwd: string; env: Record<string,unknown>; argv: string[]
  sessionId?: unknown; auth?: unknown
}
export function spareClaimTokenMatches317(actual: unknown, expected: string | undefined): boolean {
  if (!expected) return true
  if (typeof actual !== 'string' || !actual.length) return false
  const left = Buffer.from(actual)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}
export async function consumeBgSpareAuth317(env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  const fallback = env.CLAUDE_BG_CLAIM_AUTH
  const tokenFile = env.CLAUDE_BG_SOCKET_TOKENS_PATH
  delete env.CLAUDE_BG_CLAIM_AUTH
  delete env.CLAUDE_BG_SOCKET_TOKENS_PATH
  if (!tokenFile) return fallback
  let fromFile: string | undefined
  try {
    const parsed: unknown = JSON.parse(await readFile(tokenFile,'utf8'))
    if (parsed && typeof parsed === 'object' &&
        typeof (parsed as {claimAuth?:unknown}).claimAuth === 'string')
      fromFile = (parsed as {claimAuth:string}).claimAuth
  } catch (error) {
    process.stderr.write('[bg-spare] cannot read socket token file: ' + String(error) + '\n')
  } finally {
    try { await unlink(tokenFile) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  if (!fromFile) process.stderr.write('[bg-spare] tokens file unreadable; claim gate degraded\n')
  return fromFile ?? fallback
}
export type BgSpareOptions317 = {
  onClaim?: (claim:BgSpareClaim317)=>Promise<void>
  stderr?: (message:string)=>void
  warm?: ()=>Promise<unknown>
}
export async function runBgSpare317(args:string[], options:BgSpareOptions317={}):Promise<number> {
  const socketPath=args[0]
  const stderr=options.stderr ?? (message=>process.stderr.write(message))
  if (!socketPath) { stderr('[bg-spare] missing claim sock path\n'); return 2 }
  const token=await consumeBgSpareAuth317()
  for(const name of PRELOAD_RESET_KEYS_317) delete process.env[name]
  await mkdir(dirname(socketPath),{recursive:true,mode:0o700})
  // The original warms the normal CLI module while awaiting the claim.
  let warmFailure:unknown
  const warm=Promise.resolve().then(()=>options.warm?.() ?? import('../main.js'))
    .then(()=>{},error=>{warmFailure=error})
  let finished=false
  let ownsSocket=false
  let resolveClaim!: (value:BgSpareClaim317)=>void
  let rejectClaim!: (error:unknown)=>void
  const claimPromise=new Promise<BgSpareClaim317>((resolve,reject)=>{
    resolveClaim=resolve;rejectClaim=reject
  })
  const server=createServer(socket=>{
    let buffer=''
    socket.setEncoding('utf8')
    socket.on('data',chunk=>{
      if(finished) return
      buffer+=chunk
      if(Buffer.byteLength(buffer,'utf8')>8*1024*1024){socket.destroy();return}
      const newline=buffer.indexOf('\n')
      if(newline<0)return
      let parsed:unknown
      try{parsed=JSON.parse(buffer.slice(0,newline))}
      catch(error){
        socket.destroy()
        if(token)return
        finished=true;server.close();rejectClaim(error);return
      }
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
          !spareClaimTokenMatches317((parsed as {auth?:unknown}).auth,token)){
        socket.destroy();return
      }
      finished=true
      socket.end()
      server.close()
      resolveClaim(parsed as BgSpareClaim317)
    })
    socket.on('error',error=>{
      if(!token&&!finished){finished=true;server.close();rejectClaim(error)}
    })
  })
  const parent=process.ppid
  let parentCheck:ReturnType<typeof setInterval>|undefined
  const cleanup=async()=>{
    if(parentCheck)clearInterval(parentCheck)
    if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()))
    if(ownsSocket){
      try{await unlink(socketPath)}
      catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
      ownsSocket=false
    }
  }
  const interrupt=()=>{
    if(!finished){finished=true;rejectClaim(new Error('interrupted'))}
    void cleanup().finally(()=>process.exit(0))
  }
  try{
    await new Promise<void>((resolve,reject)=>{
      server.once('listening',resolve)
      server.once('error',reject)
      server.listen(socketPath)
    })
    ownsSocket=true
    parentCheck=setInterval(()=>{if(process.ppid!==parent)interrupt()},2000)
    parentCheck.unref()
    for(const sig of ['SIGTERM','SIGHUP','SIGINT'] as const)process.on(sig,interrupt)
    const claim=await claimPromise
    for(const sig of ['SIGTERM','SIGHUP','SIGINT'] as const)process.off(sig,interrupt)
    if(parentCheck)clearInterval(parentCheck)
    validatePreloadClaim317(claim)
    await warm
    if(warmFailure)throw warmFailure
    await (options.onClaim ?? (value=>runClaimedSession317(value,'spare_claim')))(claim)
    return 0
  }catch(error){
    stderr('[bg-spare] claim recv failed: '+String(error)+'\n')
    return 1
  }finally{
    for(const sig of ['SIGTERM','SIGHUP','SIGINT'] as const)process.off(sig,interrupt)
    await cleanup()
  }
}
