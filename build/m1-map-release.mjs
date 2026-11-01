/**
 * M1: explainable evidence routing for 2.1.89–2.1.310.
 *
 * This is a lexical *candidate* map, not proof of the final executable behavior.
 * Only an explicit source/consumer/condition review can upgrade a row to
 * semantic acceptance. Keep the small ruleset distinct from signed-off data.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root=resolve(import.meta.dirname,'..')
const read=path=>JSON.parse(readFileSync(resolve(root,path),'utf8'))

const RULES=[
['F001',/\b(?:interactive session|interactive mode|terminal session|initial prompt|first-run|onboarding)\b/i],
['F002',/\b(?:claude -p|--print|non-interactive|headless prompt|print mode)\b/i],
['F003',/\b(?:stream-json|output-format|ndjson|structured output|input-format|json events)\b/i],
['F004',/\b(?:--resume|--continue|\/resume|session picker|session history|restore session|session restore)\b/i],
['F005',/\b(?:\/clear|\/compact|compaction|compact context)\b/i],
['F006',/\b(?:\/share|shared transcript|share session|export conversation|session bundle)\b/i],
['F007',/\b(?:plan mode|\/plan|ExitPlanMode|AskUserQuestion|plan approval)\b/i],
['F008',/\b(?:AskUserQuestion|ask.?user.?question|question dialog|user answer)\b/i],
['F009',/\b(?:fullscreen|full-screen|\/tui|diff panel|transcript mode|screen redraw)\b/i],
['F010',/\b(?:\/rewind|--rewind-files|undo|revert files)\b/i],
['F011',/\b(?:vim mode|keybindings|keyboard shortcut|\/theme|theme picker|editor mode)\b/i],
['F012',/\b(?:status line|statusline|\/status|\/usage|status bar|cost meter)\b/i],
['F013',/\b(?:voice mode|dictation|microphone|audio capture|speech-to-text)\b/i],
['F014',/\b(?:--add-dir|\/add-dir|worktree|working directory|working directories)\b/i],
['F015',/\b(?:tool_use|tool_result|tool.?call|agent loop|tool execution)\b/i],
['F016',/\b(?:streaming response|thinking block|message_delta|thinking_delta|sse stream|partial json)\b/i],
['F017',/\b(?:--fallback-model|\/model|model switching|model selection|switch models)\b/i],
['F018',/\b(?:Bedrock|Vertex AI|Foundry|LLM gateway|custom provider|ANTHROPIC_BASE_URL|LiteLLM)\b/i],
['F019',/\b(?:\/login|\/logout|auth login|authentication|oauth token|sign-in|credential refresh)\b/i],
['F020',/\b(?:rate limit|retry-after|retries|retry budget|429|529|quota reset)\b/i],
['F021',/\b(?:prompt cach|cache breakpoint|cache hit|cache write|cache TTL)\b/i],
['F022',/\b(?:system prompt|system instructions|prompt snapshot|append-system-prompt)\b/i],
['F023',/\b(?:auto-compact|autocompact|compaction|context window|microcompact)\b/i],
['F024',/\b(?:auto memory|auto-memory|memory recall|memory extraction|memory retrieval|memory search)\b/i],
['F025',/\b(?:dream memory|memory dream|\/dream|dream compaction)\b/i],
['F026',/\b(?:crash recovery|session persistence|task recovery|task resume|journal replay)\b/i],
['F027',/\b(?:token count|cost metrics|token usage|pricing|usage cost|token budget)\b/i],
['F028',/\b(?:Read tool|PDF read|read file|read tool|file reader)\b/i],
['F029',/\b(?:Write tool|writing files|file writing|Write and Edit|write permissions)\b/i],
['F030',/\b(?:Edit tool|file edit|replace_all|edit permissions|edit speed)\b/i],
['F031',/\b(?:ripgrep|\bGrep\b|\bGlob\b|file search|search program)\b/i],
['F032',/\b(?:Bash tool|shell command|terminal command|bash execution|bash permission)\b/i],
['F033',/\b(?:PowerShell|pwsh.exe|powershell.exe)\b/i],
['F034',/\b(?:NotebookEdit|notebook cell|Jupyter notebook)\b/i],
['F035',/\b(?:LSP|language server|go to definition|code diagnostics|textDocument\/)\b/i],
['F036',/\b(?:WebSearch|WebFetch|web search|web fetch|search quota|web citations)\b/i],
['F037',/\b(?:Claude in Chrome|computer use|browser navigation|browser automation|Chrome extension)\b/i],
['F038',/\b(?:git commit|git push|pull request|PR creation|GitHub mentions|co-authored-by)\b/i],
['F039',/\b(?:ToolSearch|tool search|tool discovery|tool schema)\b/i],
['F040',/\b(?:tool_result|tool_error|tool result|tool timeout|tool output|tool truncation)\b/i],
['F041',/\b(?:permission mode|permission rule|allowed tools|denied tools|approval mode)\b/i],
['F042',/\b(?:classifier|auto mode verdict|automatic permissions)\b/i],
['F043',/\b(?:hard block|soft block|hard_deny|security policy|safety check)\b/i],
['F044',/\b(?:notification spoof|message provenance|tool output injection|impersonat)\b/i],
['F045',/\b(?:schedule(d)? task|cron job|timer notification|routine permission)\b/i],
['F046',/\b(?:worker reply|worker permission|subagent approval|teammate authority)\b/i],
['F047',/\b(?:prompt injection|untrusted content|malicious instruction)\b/i],
['F048',/\b(?:exfiltrat|data leak|external domain|web quota bypass)\b/i],
['F049',/\b(?:sandbox|symlink|path traversal|filesystem isolation|nested user namespaces)\b/i],
['F050',/\b(?:destructive operation|permission prompt|approval dialog|dangerous command)\b/i],
['F051',/\b(?:\/skills|skill loading|skill search|skill creation|\/claude-api)\b/i],
['F052',/\b(?:plugin|marketplace|mod package|mod reload|plugin install)\b/i],
['F053',/\b(?:\bMCP\b|mcp server|mcp tools|mcp resources|mcp protocol)\b/i],
['F054',/\b(?:PreToolUse|PostToolUse|hook execution|hook failure|hook config)\b/i],
['F055',/\b(?:Agent SDK|--sdk-url|sdk session|SDK mode|SDK event)\b/i],
['F056',/\b(?:coordinator|agent team|team lead|team mode|swarm)\b/i],
['F057',/\b(?:teammate|worker agent|worker isolation|agent worktree)\b/i],
['F058',/\b(?:fork agent|forked agent|subagent_type.*fork|fork context)\b/i],
['F059',/\b(?:observer agent|read-only observer|observer mode)\b/i],
['F060',/\b(?:auto mode|autonomous mode|auto permission mode|unattended execution)\b/i],
['F061',/\b(?:\/schedule|\/loop|scheduled task|cron scheduler|routine|schedule run)\b/i],
['F062',/\b(?:--bg|background task|TaskOutput|task output|background agent|daemon job)\b/i],
['F063',/\b(?:local_workflow|workflow agent|parallel\(\)|pipeline\(\))\b/i],
['F064',/\b(?:verification agent|reviewer agent|independent verification)\b/i],
['F065',/\b(?:VS Code|VSCode|JetBrains|IDE integration|editor extension)\b/i],
['F066',/\b(?:remote control|remote-control|SSH host|session bridge|paired session)\b/i],
['F067',/\b(?:WebSocket|SSE transport|remote streaming|transport connection)\b/i],
['F068',/\b(?:desktop app|mobile app|claude desktop|claude on mobile)\b/i],
['F069',/\b(?:worktree cleanup|background worktree|worktree isolation)\b/i],
['F070',/\b(?:process restart|orphaned process|daemon restart|stale pid)\b/i],
['F071',/\b(?:\/btw|side question|btw prompt)\b/i],
['F072',/\b(?:you should know|proactive side note|\/goal|proactive tip)\b/i],
['F073',/\b(?:artifact comment|review artifact|artifact feedback)\b/i],
['F074',/\b(?:artifact tool|artifact without tools|artifact permissions)\b/i],
['F075',/\b(?:artifact template|artifact page|artifact design|artifact render)\b/i],
['F076',/\b(?:Claude Test|claude_test_|test draft|browser test attachment)\b/i],
['F077',/\b(?:design sync|design system sync|\/design-sync|Figma)\b/i],
['F078',/\b(?:prompt suggestion|next prompt|next message suggestion)\b/i],
['F079',/\b(?:\/doctor|claude doctor|diagnostic|health check)\b/i],
['F080',/\b(?:telemetry|OpenTelemetry|OTEL_|Perfetto|performance metrics|debug logging|privacy settings|\/privacy-settings)\b/i],
['F081',/\b(?:Monitor tool|plugin monitor|long foreground sleeps|monitor subscriptions)\b/i],
['F082',/\b(?:workflow engine|local workflow|workflow\(\)|pipeline\(\)|workflow script)\b/i],
['F083',/\b(?:workflow journal|workflow resume|completed workflow step|rerun completed step)\b/i],
['F084',/\b(?:plugin API|mod API|mod's tool|mod's agent|mod hook)\b/i],
['F085',/\b(?:auto-mode-setup|auto mode setup|auto mode onboarding)\b/i],
['F086',/\b(?:idle compaction|autocompact|compact window|small context model)\b/i],
['F087',/\b(?:beta header|gateway retry|unsupported beta|compatible server)\b/i],
['F088',/\b(?:\/tui fullscreen|\/diff|Ctrl\+L|full-screen diff|terminal image)\b/i],
['F089',/\b(?:parent_tool_use_id|background subagent|agent model inheritance|agent lifecycle)\b/i],
['F090',/\b(?:safety_event|tool_decision|permission audit|safety audit)\b/i],
['F091',/\b(?:synced plugin|plugin sync|skill sync|synced skill)\b/i],
['F092',/\b(?:MCP.*timeout|permission prompt timeout|unanswered MCP)\b/i],
['F093',/\b(?:--restricted|restricted mode|workspace restricted)\b/i],
['F094',/\b(?:--safe-mode|safe mode startup)\b/i],
['F095',/\b(?:claude agents|agent attach|agent respawn|background agent CLI)\b/i],
['F096',/\b(?:--permission-prompts|permission prompt policy|host permission)\b/i],
['F097',/\b(?:system-prompt-snapshot|exclude-dynamic-system-prompt|prompt snapshot)\b/i],
['F098',/\b(?:forward-subagent-text|parent_tool_use_id|prompt-suggestions|headless event)\b/i],
['F099',/\b(?:--cloud|--desktop|--teleport|remote-control|remote session)\b/i],
['F100',/\b(?:--plugin-url|claude gateway|claude import|claude purge|plugin CLI)\b/i],
['F101',/\b(?:\/code-review|code review|--max-findings|ReportFindings)\b/i],
['F102',/\b(?:ultrareview|ultra review|--local-deep|cloud code review)\b/i]
]
export function classifyChangelogRow(text,scope,coverage){
  const candidates=RULES.filter(([_,regex])=>regex.test(text)).map(([id])=>id)
  const owned=new Set(candidates.flatMap(id=>coverage.find(x=>x.id===id)?.tasks.filter(t=>t!=='M1'&&t!=='M10')??[]))
  if(scope==='CLAUDE_TAG_INTEGRATION'){
    return {candidate_F:[],candidate_M:[],scope_rationale:'Named independent Claude Tag/Slack product; requires explicit scope review',evidence_grade:'SOURCE_PREFIX_ONLY'}
  }
  if(scope==='VSCODE_EXTENSION')owned.add('M5')
  if(scope==='CODE_REVIEW')owned.add('M9')
  if(scope==='CLOUD_SESSION_SERVICE'||scope==='REMOTE_BRIDGE'||scope==='CLOUD_WEB_SERVICE')owned.add('M5')
  return {candidate_F:candidates,candidate_M:[...owned].sort(),
    scope_rationale:candidates.length?'Lexical feature evidence; requires actual source confirmation':'No precise feature keyword; refer to M1/M10 manual review',
    evidence_grade:'AUTOMATED_CANDIDATE_UNVERIFIED'}
}
export function scan(){
  const coverage=read('docs/upgrade/upgrade-coverage.json').features
  const all=[1,2,3].flatMap(i=>read('docs/upgrade/m1-evidence/changelog-'+i+'.json').records)
  const rows=all.map(r=>({id:r.id,source_line:r.source_line,...classifyChangelogRow(r.source_text,r.release_surface,coverage)}))
  const byF={},byM={}
  for(const row of rows){for(const f of row.candidate_F)byF[f]=(byF[f]||0)+1;for(const m of row.candidate_M)byM[m]=(byM[m]||0)+1}
  return {schema:1,records:rows,totals:{records:rows.length,with_feature_candidate:rows.filter(r=>r.candidate_F.length).length,
    no_feature_candidate:rows.filter(r=>!r.candidate_F.length).length,byF,byM}}
}
if(process.argv[1]===import.meta.filename){
  const data=scan()
  process.stdout.write(JSON.stringify(data.totals,null,2)+'\n')
}
