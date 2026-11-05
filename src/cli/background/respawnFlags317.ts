/**
 * CLI background respawn argument policy, ported from the 2.1.317 original
 * chunk-n8xnkwam.js (Q$e, gwn, lPe, N, F, Eor).
 *
 * Persist only documented session configuration. Positional commands and
 * one-shot launch/resume flags must not execute a second time on recovery.
 */
const VALUE_FLAGS = new Set([
  '--model','-m','--permission-mode','--inherit-permission-mode',
  '--proactivity','--agent','--agents','--routine','--effort','--fast-mode',
  '--add-dir','--mcp-config','--settings','--setting-sources',
  '--managed-settings','--client-data-url','--system-prompt',
  '--system-prompt-file','--append-system-prompt','--append-system-prompt-file',
  '--system-prompt-snapshot','--append-subagent-system-prompt',
  '--append-subagent-system-prompt-file','--fallback-model','--advisor',
  '--channels','--watch-artifact','--watch-artifact-no-autoreact',
  '--permission-prompt-tool','--permission-prompts','--allowed-tools',
  '--allowedTools','--disallowed-tools','--disallowedTools','--tools',
  '--debug-file','-n','--name','--autocompact','--betas','--file',
  '--max-budget-usd','--max-thinking-tokens','--max-turns','--task-budget',
  '--plan-mode-instructions','--plugin-dir','--plugin-dir-no-mcp',
  '--plugin-url','--rewind-files','--thinking','--thinking-display',
  '--remote-control-session-name-prefix','--json-schema',
  '--project-config-root','--output-format',
])
const MULTI_VALUE = new Set([
  '--allowed-tools','--allowedTools','--disallowed-tools','--disallowedTools',
  '--tools','--mcp-config','--betas','--add-dir','--file','--channels',
])
const REPEATED = new Set([
  ...MULTI_VALUE,'--plugin-dir','--plugin-dir-no-mcp','--plugin-url',
])
const BOOL_FLAGS = new Set([
  '--dangerously-skip-permissions','--allow-dangerously-skip-permissions',
  '--strict-mcp-config','--dangerously-allow-browser-network-access',
  '--restricted','--disable-slash-commands','--include-unsupported-models',
  '--verbose','--reply-on-resume','--ide','--chrome','--no-chrome','--bare',
  '--safe-mode','--brief','--remote-control','--rc','--local','--unsandboxed',
  '--personal','--allow-other-models',
])
const DROP_VALUE = new Set([
  '--session-id','--resume','-r','--resume-session-at','--resume-drops-turn',
])
const DROP_BOOL = new Set([
  '--bg','--background','--continue','-c','--print','-p','--help','-h',
  '--replay-user-messages','--no-session-persistence',
])
type RespawnOption317 = { name:string; tokens:string[] }

export function resumeFlags(argv: readonly string[]): string[] {
  const options: RespawnOption317[]=[]
  for(let i=0;i<argv.length;i++){
    const arg=argv[i]!
    if(arg==='--')break
    if(!arg.startsWith('-'))continue
    const equal=arg.indexOf('=')
    const key=equal===-1?arg:arg.slice(0,equal)
    const hasEqual=equal!==-1
    const hasValue=VALUE_FLAGS.has(key)
    const consumeArgument=()=>{
      if(hasEqual)return [arg.slice(equal+1)]
      return i+1<argv.length?[argv[++i]!]:[]
    }
    if(DROP_VALUE.has(key)){
      if(!hasEqual&&i+1<argv.length) i++
      continue
    }
    if(DROP_BOOL.has(key))continue
    if(hasValue){
      const values=consumeArgument()
      if(values.length===0)continue
      if(MULTI_VALUE.has(key)&&!hasEqual){
        while(i+1<argv.length&&!argv[i+1]!.startsWith('-'))
          values.push(argv[++i]!)
      }
      // CLI flags may take a negative number or a literal beginning with '-'.
      // The original normalizer rewrites such values as --flag=value.
      options.push({name:key,tokens:hasEqual?[arg]:
        values[0]!.startsWith('-')?
          [key==='-n'?'--name='+values[0]:key+'='+values[0],...values.slice(1)]:
          [arg,...values]})
      continue
    }
    if(BOOL_FLAGS.has(key)){
      options.push({name:key,tokens:[key]})
      continue
    }
    // Unknown or transient options have no durable meaning in a new worker.
    // Consume a possible following value so it cannot be mistaken for a flag.
    if(!hasEqual&&i+1<argv.length&&!argv[i+1]!.startsWith('-'))i++
  }
  const lastByName=new Map<string,number>()
  options.forEach((option,i)=>{
    if(VALUE_FLAGS.has(option.name)&&!REPEATED.has(option.name))
      lastByName.set(option.name,i)
  })
  const normalized=options.filter((option,i)=>
    !lastByName.has(option.name)||lastByName.get(option.name)===i
  ).flatMap(option=>option.tokens)
  // Official Eor: a separately supplied bypass switch must take precedence.
  if(normalized.includes('--dangerously-skip-permissions'))
    return [...normalized.filter(x=>x!=='--dangerously-skip-permissions'),
      '--dangerously-skip-permissions']
  return normalized
}
