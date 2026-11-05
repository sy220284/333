import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fleetHome, fleetSocket, isAlive } from './sessionStore.ts'
import { adoptPtyProcess317, type ManagedPtyProcess317 } from './ptyProcess317.ts'

const ID=/^[a-f0-9]{8}$/
export type BackgroundPtyOptions317={
  id:string
  cwd:string
  cols:number
  rows:number
  env:NodeJS.ProcessEnv
  executable:string
  prefix:string[]
  args:string[]
  onReplay:(data:Buffer)=>Promise<void>|void
  onOutput:(data:Buffer)=>void
  onExit:(worker:ManagedPtyProcess317,code:number,signal?:string|number)=>void
  onStatus?:(message:string)=>void
}
export function backgroundPtyPaths317(id:string,env:NodeJS.ProcessEnv=process.env){
  if(!ID.test(id))throw new Error('Invalid background worker ID')
  const parent=dirname(fleetSocket(env))
  const socket=process.platform==='win32'
    ?fleetSocket(env)+'-pty-'+id:join(parent,'pty-'+id+'.sock')
  const credential=join(fleetHome(env),'credentials',id+'.pty-auth')
  return {socket,credential}
}
async function readToken(path:string):Promise<string>{
  const st=await lstat(path)
  if(!st.isFile()||st.isSymbolicLink()||
     (process.platform!=='win32'&&(st.mode&0o077)!==0))
    throw new Error('Background PTY credential is not a private regular file')
  const data=await readFile(path,'utf8')
  if(!/^[a-f0-9]{32}$/.test(data))
    throw new Error('Background PTY credential is malformed')
  return data
}
async function writeToken(path:string,token:string):Promise<void>{
  await mkdir(dirname(path),{recursive:true,mode:0o700})
  const fh=await open(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|
    (constants.O_NOFOLLOW||0),0o600)
  try{await fh.writeFile(token);await fh.sync()}
  finally{await fh.close()}
}
function attachOptions(
  options:BackgroundPtyOptions317,hostPid:number,socket:string,token:string,credential:string,
){
  const status=options.onStatus??(()=>{})
  return {
    hostPid,socketPath:socket,token,
    onReplay:options.onReplay,onOutput:options.onOutput,
    isAlive,onStatus:status,
    onExit:(worker:ManagedPtyProcess317,code:number,signal?:string|number)=>{
      void unlink(credential).catch(error=>{
        if((error as NodeJS.ErrnoException).code!=='ENOENT')
          status('PTY token cleanup failed: '+String(error))
      }).finally(()=>options.onExit(worker,code,signal))
    },
  }
}
export async function spawnBackgroundPty317(
  options:BackgroundPtyOptions317,
):Promise<{proc:ManagedPtyProcess317;socket:string}>{
  const paths=backgroundPtyPaths317(options.id,options.env)
  const token=randomBytes(16).toString('hex')
  await mkdir(dirname(paths.socket),{recursive:true,mode:0o700})
  await writeToken(paths.credential,token)
  const environment: NodeJS.ProcessEnv = {...options.env,CLAUDE_BG_PTY_AUTH:token,
    CLAUDE_BG_PTY_PERSIST:'1'}
  delete environment.CLAUDE_BG_SOCKET_TOKENS_PATH
  const argv=[options.executable,...options.prefix,
    '--bg-pty-host',paths.socket,String(options.cols),String(options.rows),
    '--',options.executable,...options.prefix,...options.args]
  let spawned:ReturnType<typeof Bun.spawn>|undefined
  try{
    spawned=Bun.spawn(argv,{
      cwd:options.cwd,env:environment,
      stdin:'ignore',stdout:'ignore',stderr:'ignore',
      detached:true,windowsHide:true,
    })
    const proc=await adoptPtyProcess317(
      attachOptions(options,spawned.pid,paths.socket,token,paths.credential))
    spawned.unref()
    return {proc,socket:paths.socket}
  }catch(error){
    if(spawned&&isAlive(spawned.pid)){
      try{spawned.kill('SIGTERM')}
      catch(killError){options.onStatus?.('PTY worker startup kill failed: '+String(killError))}
      // Keep the credential if an unresponsive host survives, so a later
      // supervisor can still prove ownership and attach without duplicating it.
      try{await spawned.exited}catch{}
    }
    if(!spawned||!isAlive(spawned.pid)){
      try{await unlink(paths.credential)}
      catch(cleanupError){
        if((cleanupError as NodeJS.ErrnoException).code!=='ENOENT')
          options.onStatus?.('PTY startup credential cleanup failed: '+String(cleanupError))
      }
    }
    throw error
  }
}
export async function reconnectBackgroundPty317(
  options:BackgroundPtyOptions317,hostPid:number,expectedSocket:string,
):Promise<ManagedPtyProcess317>{
  const paths=backgroundPtyPaths317(options.id,options.env)
  if(expectedSocket!==paths.socket)
    throw new Error('Background worker socket differs from its configured identity')
  if(!isAlive(hostPid))throw new Error('Background PTY host is no longer running')
  const token=await readToken(paths.credential)
  return adoptPtyProcess317(
    attachOptions(options,hostPid,paths.socket,token,paths.credential))
}
