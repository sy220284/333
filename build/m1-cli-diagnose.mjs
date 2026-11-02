#!/usr/bin/env node
/**
 * Focused diagnostic of candidate CLI commands that exit 0 without output.
 * Runs in a unique HOME and strips provider/secret environment variables.
 * Debug logs are bounded and redacted; results are evidence, not parity pass.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import process from 'node:process'
const args = process.argv.slice(2)
const input = args.indexOf('--candidate')
const output = args.indexOf('--out')
if (input<0 || output<0 || !args[input+1] || !args[output+1])
  throw Error('Usage: node build/m1-cli-diagnose.mjs --candidate FILE --out JSON')
const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(
  ([key])=>!/ANTHROPIC|CLAUDE|TOKEN|SECRET|PASSWORD|API_KEY|AWS_|GOOGLE_|OPENAI_|GITHUB_|GITLAB_/i.test(key)
))
const fixtures=[
  ['mcp_list_empty',['mcp','list']],
  ['plugin_list_empty',['plugin','list']],
  ['stream_without_login',['--bare','--print','--verbose','--output-format','stream-json','hello']],
]
const root=mkdtempSync(join(tmpdir(),'m1-cli-diagnostic-'))
const records=[]
try {
  for(const [id,argv] of fixtures){
    const home=join(root,id)
    mkdirSync(home,{recursive:true})
    const debugPath=join(home,'debug.log')
    const result=spawnSync(resolve(args[input+1]),['--debug-file',debugPath,...argv],{
      cwd:home,env:{...cleanEnv,HOME:home,XDG_CONFIG_HOME:join(home,'.config'),
        XDG_CACHE_HOME:join(home,'.cache'),NO_COLOR:'1',CI:'1',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_TELEMETRY:'1'},
      encoding:'utf8',timeout:15000,maxBuffer:1024*1024,
    })
    const raw=existsSync(debugPath)?readFileSync(debugPath,'utf8'):''
    const scrub=text=>text.replaceAll(home,'[isolated-home]').slice(-1600)
    records.push({id,exit_code:result.status,signal:result.signal??null,
      stdout_preview:scrub(result.stdout??''),
      stderr_preview:scrub(result.stderr??''),
      debug_log_tail:scrub(raw),
      debug_file_created:existsSync(debugPath),
      failure:result.error?.message??null,
      diagnostic_only:true,
    })
  }
} finally {
  rmSync(root,{recursive:true,force:true})
}
const dest=resolve(args[output+1]);mkdirSync(dirname(dest),{recursive:true})
writeFileSync(dest,JSON.stringify({schema:1,scope:'ISOLATED_CANDIDATE_DEBUG_RUN_ONLY',
  records},null,2)+'\n')
console.log(JSON.stringify(records.map(r=>({id:r.id,exit:r.exit_code,
  debug:r.debug_file_created,bytes:r.debug_log_tail.length}))))
