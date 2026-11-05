/**
 * Claude Code 2.1.317 idle hold-file semantics.
 * A file must be a recent regular file on a local filesystem; a stale,
 * absent, network-mounted or unreadable marker must never hold a worker.
 */
import { realpath, stat, statfs } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

const FRESH_FOR_MS = 180_000
const REMOTE_FILESYSTEM_MAGIC = new Set([
  0x6969,      // Linux NFS
  0xff534d42,  // CIFS/SMB
  0xfe534d42,  // SMB2
  0x517b,      // SMB super magic
  0x65735546,  // FUSE (mount may be remote)
  0x73757245,  // Coda
  0x01021997,  // 9p
])
function isAbsent(error:unknown):boolean{
  return typeof error==='object' && error!==null && 'code' in error &&
    (error.code==='ENOENT' || error.code==='ENOTDIR')
}
export async function checkRunnerIdleHold317(filePath:string,now:number=Date.now()):Promise<boolean>{
  if(!filePath || !isAbsolute(filePath))throw new Error('--hold-idle-file requires an absolute local path')
  if(filePath.startsWith('\\\\') || filePath.startsWith('//'))
    throw new Error('--hold-idle-file cannot point to a network location')
  const candidate=resolve(filePath)
  let actual:string
  try{actual=await realpath(candidate)}
  catch(error){if(isAbsent(error))return false;throw error}
  const fs=await statfs(actual)
  if(REMOTE_FILESYSTEM_MAGIC.has(Number(fs.type))) {
    throw new Error('the path, or a link on the way to it, leads to a network location; point --hold-idle-file at a local file')
  }
  let marker
  try{marker=await stat(actual)}
  catch(error){if(isAbsent(error))return false;throw error}
  return marker.isFile() && Math.abs(now-marker.mtimeMs)<FRESH_FOR_MS
}
export const RUNNER_HOLD_DEFAULT_MS_317=86_400_000
export const RUNNER_HOLD_RECHECK_MS_317=30_000
export function parseRunnerMinutes317(value:string,flag:string):number{
  const n=Number(value)
  if(value.trim()==='' || !Number.isFinite(n) || n<0 || n>10080)
    throw new RangeError(flag+' must be a non-negative number of minutes (0 disables, max 10080), got: '+value)
  return n*60_000
}
export function parseRunnerMilliseconds317(value:string|undefined,flag:string,defaultValue=0):number{
  if(value===undefined || value.trim()==='')return defaultValue
  const ms=Number(value)
  if(!Number.isFinite(ms)||ms<0||ms>10080*60_000)
    throw new RangeError(flag+' must be a non-negative millisecond duration')
  return ms
}
