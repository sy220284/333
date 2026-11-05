/**
 * 2.1.317 self-hosted Runner's server-supplied Claude CLI argument delivery.
 *
 * Ported from original chunk-b1g551xb.js:jGn() and
 * chunk-j5svdpw5.js:1541/2488. CLI transport, settings, prompt files and
 * agent definitions are owned by other bootstrap stages, not this adapter.
 */
import { randomUUID } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const FLAG = /^[A-Za-z0-9][A-Za-z0-9-]*$/
const RESERVED = new Set([
  'sdk-url','resume','print','input-format','output-format',
  'replay-user-messages','debug-file','mcp-config','settings',
  'system-prompt','append-system-prompt',
  'append-subagent-system-prompt','agents','session-id',
  'deep-link-origin','deep-link-cwd-b64','worktree','tmux',
])
const NO = new Set(['0','false','no','off'])

/** Preserve original server argument ordering and --flag=leading-dash semantics. */
export function mapRunnerRemoteCliArgs317(
  values: Record<string, unknown>,
  onSkip: (reason: string) => void = () => {},
): string[] {
  const args: string[] = []
  for(const [key,value] of Object.entries(values)){
    if(!FLAG.test(key)){
      onSkip('[runner:args] skipped malformed key '+JSON.stringify(key))
      continue
    }
    if(RESERVED.has(key)){
      onSkip('[runner:args] skipped bootstrap-owned key '+key)
      continue
    }
    if(key==='restricted'){
      if(NO.has(String(value).trim().toLowerCase()) || value===false)
        args.push('--restricted')
      continue
    }
    if(value===undefined || value===null || String(value)==='') {
      if(key==='setting-sources' && value==='') args.push('--setting-sources=')
      continue
    }
    const text=String(value)
    const flag='--'+key
    if(text.length>1 && text.startsWith('-'))args.push(flag+'='+text)
    else args.push(flag,text)
  }
  return args
}

const PROMPT_OPTIONS = [
  ['system-prompt','remote-system-prompt.txt'],
  ['append-system-prompt','remote-append-system-prompt.txt'],
  ['append-subagent-system-prompt','remote-append-subagent-system-prompt.txt'],
] as const

export type RunnerPromptFlags317 = { args: string[]; paths: string[] }

/** Port of 317 prompt-file staging: private mode-0600 files, no CLI secret spill. */
export async function stageRunnerPromptFlags317(
  values: Record<string,unknown>,
  configDir: string,
  childIsOwnBinary: boolean,
):Promise<RunnerPromptFlags317>{
  const args:string[]=[]
  const paths:string[]=[]
  try {
    for(const [key,filename] of PROMPT_OPTIONS){
      const entry=values[key]
      const text=entry===undefined?'':String(entry)
      if(text==='')continue
      if(key==='append-subagent-system-prompt' && !childIsOwnBinary &&
         Buffer.byteLength(text,'utf8')<131072){
        args.push('--'+key,text)
        continue
      }
      const path=join(configDir,randomUUID()+'-'+filename)
      await writeFile(path,text,{encoding:'utf8',flag:'wx',mode:0o600})
      paths.push(path)
      args.push('--'+key+'-file',path)
    }
    return {args,paths}
  }catch(error){
    const cleanup=await Promise.allSettled(paths.map(path=>unlink(path)))
    const failures=cleanup.filter(x=>x.status==='rejected')
    if(failures.length) throw new AggregateError([error,...failures.map(x=>x.reason)],
      'Remote prompt staging and cleanup failed')
    throw error
  }
}
