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
