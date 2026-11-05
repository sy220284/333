/**
 * 2.1.317 self-hosted Runner's server-supplied Claude CLI argument delivery.
 *
 * Ported from original chunk-b1g551xb.js:jGn() and
 * chunk-j5svdpw5.js:1541/2488. CLI transport, settings, prompt files and
 * agent definitions are owned by other bootstrap stages, not this adapter.
 */
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
