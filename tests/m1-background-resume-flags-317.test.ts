import { test, expect } from 'bun:test'
import { resumeFlags } from '../src/cli/background/supervisor.ts'

test('317 background resume retains permissions, tools, model and agent configuration', () => {
  const argv=[
    '--bg','--session-id','outdated-session',
    '--model','sonnet','--allowedTools','Read,Bash',
    '--disallowedTools','Edit,Write','--tools','Read,Bash',
    '--agents','{"reviewer":{"description":"Review","prompt":"Review"}}',
    '--mcp-config','custom-mcp.json','--strict-mcp-config',
    '--system-prompt-file','/tmp/custom-prompt.txt',
    '--setting-sources','user,project','--name','review-session',
    '--resume','different-session', '-c',
  ]
  expect(resumeFlags(argv)).toEqual([
    '--model','sonnet','--allowedTools','Read,Bash',
    '--disallowedTools','Edit,Write','--tools','Read,Bash',
    '--agents','{"reviewer":{"description":"Review","prompt":"Review"}}',
    '--mcp-config','custom-mcp.json','--strict-mcp-config',
    '--system-prompt-file','/tmp/custom-prompt.txt',
    '--setting-sources','user,project','--name','review-session',
  ])
})

test('317 background resume retains equals-form tool permissions', () => {
  expect(resumeFlags(['--allowed-tools=Read,Bash','--disallowed-tools=Write','--model=opus']))
    .toEqual(['--allowed-tools=Read,Bash','--disallowed-tools=Write','--model=opus'])
})


test('317 background resume drops transient CLI switches and their values', () => {
  const flags=resumeFlags([
    '--bg','--model','sonnet','--resume','old-session',
    '--print','--output-format','json','--input-format','stream-json',
    '--permission-mode','default','--continue','-p','do not rerun',
    '--session-id','old-session','--allowed-tools','Read',
  ])
  expect(flags).not.toContain('--bg')
  expect(flags).not.toContain('--resume')
  expect(flags).not.toContain('--session-id')
  expect(flags).not.toContain('--print')
  expect(flags).not.toContain('-p')
  expect(flags).not.toContain('--input-format')
  expect(flags).toEqual([
    '--model','sonnet','--output-format','json',
    '--permission-mode','default','--allowed-tools','Read',
  ])
})

test('317 background resume keeps the final singleton and all repeatable flags', () => {
  expect(resumeFlags([
    '--model','old','--plugin-dir','/one','--plugin-dir','/two',
    '--mcp-config','a.json','--mcp-config','b.json',
    '--model','new','--max-budget-usd','-1',
    '--dangerously-skip-permissions','--permission-mode','plan',
  ])).toEqual([
    '--plugin-dir','/one','--plugin-dir','/two',
    '--mcp-config','a.json','--mcp-config','b.json',
    '--model','new','--max-budget-usd=-1',
    '--permission-mode','plan','--dangerously-skip-permissions',
  ])
})
