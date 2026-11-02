#!/usr/bin/env node
/**
 * M1 official 2.1.310 Linux x64 black-box regression, with optional candidate.
 * Offline/unauthenticated scope; NEVER reads user OAuth/API credentials.
 *
 * node build/m1-x64-reference-probe.mjs \
 *   --reference /path/to/claude-2.1.310-linux-x64 \
 *   --report /tmp/m1-x64.json [--candidate /path/to/rebuilt/claude]
 *
 * Full authenticated/interactive flows require a separate approved fixture.
 */
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const PINNED_SHA256 = 'b73676430af12f97316a798b8371f81d640f90a58bdcb8f3ce56a835bb47df56'
const argv = process.argv.slice(2)
if (argv.length % 2 !== 0) throw new Error('参数必须以 --key value 成对出现')
const args = Object.fromEntries(Array.from({ length: argv.length/2 }, (_,i)=>[argv[2*i],argv[2*i+1]]))
const reference = args['--reference'], candidate = args['--candidate'], report = args['--report']
if (!reference || !report || !existsSync(reference)) throw new Error('必须提供存在的 --reference 与 --report')
if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('本测试只允许 Linux x64 环境')
async function hashFile(filename) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(filename)) digest.update(chunk)
  return digest.digest('hex')
}
const hash = await hashFile(reference)
if (hash !== PINNED_SHA256) throw new Error(`官方 x64 二进制 SHA-256 不匹配：${hash}`)
const cases = [
  {id:'version', argv:['--version']},
  {id:'help', argv:['--help']},
  {id:'mcp_help', argv:['mcp','--help']},
  {id:'plugin_help', argv:['plugin','--help']},
  {id:'mcp_list_empty', argv:['mcp','list']},
  {id:'plugin_list_empty', argv:['plugin','list']},
  {id:'invalid_output', argv:['--print','--output-format','not-a-format','hello']},
  {id:'invalid_permission', argv:['--print','--permission-mode','unrecognized','hello']},
  {id:'json_without_login', argv:['--bare','--print','--output-format','json','hello']},
  {id:'stream_without_login', argv:['--print','--verbose','--output-format','stream-json','hello']},
]
function removeCredentials() {
  const clean = {}
  for (const [key,value] of Object.entries(process.env)) {
    if (/ANTHROPIC|CLAUDE|TOKEN|SECRET|PASSWORD|API_KEY|AWS_|GOOGLE_|OPENAI_|GITHUB_|GITLAB_/i.test(key)) continue
    clean[key] = value
  }
  return clean
}
const envBase = removeCredentials()
Object.assign(envBase, {CI:'1',TERM:'dumb',NO_COLOR:'1',DO_NOT_TRACK:'1',
  DISABLE_TELEMETRY:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'})
function validate(test, execution) {
  const out = execution.stdout, err=execution.stderr
  if(execution.timed_out || execution.signal) return {ok:false,reason:'timed_out_or_terminated'}
  switch(test.id) {
    case 'version': return {ok:execution.exit_code===0 && /^2\.1\.310 \(Claude Code\)/m.test(out),reason:'version'}
    case 'help': return {ok:execution.exit_code===0 && /--autocompact/.test(out) && /--ax-screen-reader/.test(out) && /--output-format/.test(out),reason:'core_flags'}
    case 'mcp_help': return {ok:execution.exit_code===0 && /\bmcp\b/.test(out) && /add-json/.test(out) && /list/.test(out),reason:'mcp_help'}
    case 'plugin_help': return {ok:execution.exit_code===0 && /plugin/.test(out) && /marketplace/.test(out) && /list/.test(out),reason:'plugin_help'}
    case 'mcp_list_empty': return {ok:execution.exit_code===0 && /No MCP servers configured/.test(out),reason:'no_servers'}
    case 'plugin_list_empty': return {ok:execution.exit_code===0 && /No plugins installed/.test(out),reason:'no_plugins'}
    case 'invalid_output': return {ok:execution.exit_code!==0 && /not-a-format.*invalid|invalid.*not-a-format/i.test(err),reason:'output_enum_rejected'}
    case 'invalid_permission': return {ok:execution.exit_code!==0 && /unrecognized.*invalid|invalid.*unrecognized/i.test(err),reason:'permission_enum_rejected'}
    case 'json_without_login': {
      try {
        const j=JSON.parse(out)
        return {ok:execution.exit_code!==0 && j.type==='result' && j.is_error===true &&
          j.terminal_reason==='api_error' && /Not logged in/.test(j.result) &&
          Number(j.duration_api_ms)===0, reason:'auth_denied_structured'}
      }catch {return {ok:false,reason:'invalid_json_result'}}
    }
    case 'stream_without_login': {
      try {
        const frames=out.trim().split('\n').filter(Boolean).map(x=>JSON.parse(x))
        return {ok:execution.exit_code!==0 && frames.some(x=>x.type==='system' && x.subtype==='init') &&
          frames.some(x=>x.type==='result' && x.is_error && /Not logged in/.test(x.result)),
          reason:'stream_init_and_error'}
      }catch {return {ok:false,reason:'invalid_jsonl'}}
    }
  }
  throw new Error(`unknown test id: ${test.id}`)
}
function runCase(bin,test,homeRoot) {
  const home=join(homeRoot,test.id)
  mkdirSync(home,{recursive:true})
  const env={...envBase,HOME:home,XDG_CONFIG_HOME:join(home,'.config'),
    XDG_CACHE_HOME:join(home,'.cache')}
  const call=spawnSync(bin,test.argv,{cwd:home,env,encoding:'utf8',timeout:12000,
    maxBuffer:3*1024*1024})
  const actual={id:test.id,exit_code:call.status,signal:call.signal??null,
    timed_out:call.error?.code==='ETIMEDOUT',stdout:call.stdout??'',
    stderr:call.stderr??''}
  const verdict=validate(test,actual)
  // The runner has a fresh HOME and no inherited account/API credentials.
  // Keep only bounded diagnostic text for local empty-list command contracts.
  const sampleAllowed = new Set(['version','mcp_list_empty','plugin_list_empty'])
  const preview = value => value.replaceAll(home,'[isolated-home]').slice(0,500)
  const sample = sampleAllowed.has(test.id) ? {
    stdout_preview:preview(actual.stdout),stderr_preview:preview(actual.stderr),
  } : {}
  const digest = value => createHash('sha256').update(value).digest('hex')
  const streams = ['json_without_login','stream_without_login']
  let resultShape
  if(streams.includes(test.id)) {
    try {
      const frames=actual.stdout.trim().split('\n').filter(Boolean).map(x=>JSON.parse(x))
      resultShape={
        frames:frames.map(x=>({type:x.type,subtype:x.subtype??null,is_error:x.is_error??null,
          terminal_reason:x.terminal_reason??null})).slice(-20),
        parsed:true,
      }
    } catch {resultShape={parsed:false}}
  }
  return {id:test.id,argv:test.argv,exit_code:actual.exit_code,
    timed_out:actual.timed_out,pass:verdict.ok,contract:verdict.reason,
    stdout_bytes:Buffer.byteLength(actual.stdout),stderr_bytes:Buffer.byteLength(actual.stderr),
    stdout_sha256:digest(actual.stdout),stderr_sha256:digest(actual.stderr),
    ...sample,...(resultShape?{structured_shape:resultShape}:{})}
}
function runSuite(binary) {
  const tmp=mkdtempSync(join(tmpdir(),'m1-claude-x64-'))
  try {return cases.map(test=>runCase(binary,test,tmp))}
  finally {rmSync(tmp,{recursive:true,force:true})}
}
const referenceCases=runSuite(resolve(reference))
const candidateCases=candidate ? runSuite(resolve(candidate)) : null
const result={schema:1,release:'2.1.310',platform:'linux-x64',reference_sha256:hash,
  scope:'OFFLINE_UNAUTHENTICATED_CLI_CONTRACTS_ONLY',
  reference:{passed:referenceCases.filter(x=>x.pass).length,total:referenceCases.length,cases:referenceCases},
  candidate:candidateCases && {passed:candidateCases.filter(x=>x.pass).length,total:candidateCases.length,cases:candidateCases},
  evidence_mode: args['--allow-candidate-diff'] === 'true' ? 'M1_SOURCE_DELTA_CAPTURE_NOT_PRODUCT_ACCEPTANCE' : 'STRICT_TARGET_PARITY',
  limitations:['No authenticated model calls','No interactive TUI rendering','No MCP server handshake',
    'No agent/workflow/tool execution','No implicit assertion of feature equivalence'] }
mkdirSync(dirname(resolve(report)),{recursive:true})
writeFileSync(report,`${JSON.stringify(result,null,2)}\n`)
console.log(JSON.stringify({reference_passed:result.reference.passed,total:result.reference.total,
  candidate_passed:result.candidate?.passed??null,report:resolve(report)}))
const evidenceOnly = args['--allow-candidate-diff'] === 'true'
if (evidenceOnly && !candidate) throw new Error('仅在实际传入 --candidate 时允许仅收集差分证据')
const failedReference = referenceCases.filter(x => !x.pass)
const candidateMismatches = candidateCases?.filter(x => !x.pass) ?? []
if (candidateCases) {
  console.log(JSON.stringify({
    evidence_only: evidenceOnly,
    candidate_matches_target: candidateMismatches.length === 0,
    mismatch_count: candidateMismatches.length,
    mismatch_ids: candidateMismatches.map(x => x.id),
  }))
}
if (failedReference.length || (candidateMismatches.length && !evidenceOnly)) process.exitCode = 1
