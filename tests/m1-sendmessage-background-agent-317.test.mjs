import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { findForegroundAgentShellTaskIds } from '../src/tasks/LocalShellTask/foregroundAgentShellPolicy.mjs'
const live = {type:'local_bash',agentId:'agent1',status:'running',isBackgrounded:false,shellCommand:{}}
test('Only target agent live shell tasks may be detached', () => {
  const tasks={a:live,b:{...live,agentId:'other'},c:{...live,isBackgrounded:true},d:{...live,shellCommand:null},e:{...live,status:'completed'},f:{type:'local_agent',agentId:'agent1'}}
  assert.deepEqual(findForegroundAgentShellTaskIds(tasks,'agent1'),['a'])
  assert.deepEqual(findForegroundAgentShellTaskIds(tasks,'other'),['b'])
})
test('SendMessage queues before backgrounding the right agent', () => {
  const src=readFileSync(new URL('../src/tools/SendMessageTool/SendMessageTool.ts',import.meta.url),'utf8')
  const branch=src.split("if (task.status === 'running') {")[1].split('// task exists but stopped')[0]
  assert.ok(branch.indexOf('queuePendingMessage(')>=0)
  assert.ok(branch.indexOf('backgroundForegroundShellTasksForAgent(')>branch.indexOf('queuePendingMessage('))
  assert.match(branch,/agentId, context\.getAppState, setTaskState/)
})
test('Existing shell background retains running process and completion notification', () => {
  const src=readFileSync(new URL('../src/tasks/LocalShellTask/LocalShellTask.tsx',import.meta.url),'utf8')
  assert.match(src,/export function backgroundForegroundShellTasksForAgent/)
  assert.match(src,/findForegroundAgentShellTaskIds\(getAppState\(\)\.tasks, agentId\)/)
  assert.match(src,/shellCommand\.background\(taskId\)/)
  assert.match(src,/shellCommand\.result\.then/)
})
test('Agent shells register without UI renderer', () => {
  const src=readFileSync(new URL('../src/tools/BashTool/BashTool.tsx',import.meta.url),'utf8')
  assert.match(src,/\(setToolJSX \|\| agentId\)/)
  assert.match(src,/if \(setToolJSX\) \{\s*setToolJSX\(/)
})

test('Backgrounding wakes the Bash tool iterator even with no new output', () => {
  const shell = readFileSync(new URL('../src/utils/ShellCommand.ts',import.meta.url),'utf8')
  const bash = readFileSync(new URL('../src/tools/BashTool/BashTool.tsx',import.meta.url),'utf8')
  assert.match(shell,/readonly backgrounded: Promise<void>/)
  assert.match(shell,/this\.#resolveBackgrounded\?\.\(\)/)
  assert.match(bash,/shellCommand\.backgrounded\?\.then\(\(\) => null\)/)
  assert.match(bash,/Promise\.race\(\[resultPromise, progressSignal, \.\.\.\(backgroundSignal/)
})
