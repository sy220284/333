import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL('../'+path, import.meta.url), 'utf8')
}

test('2.1.310 uses monitor_ws for WebSocket watches, not the unrelated monitor_mcp task', async () => {
  const paths=[
    'src/tools/MonitorTool/MonitorTool.ts',
    'src/tasks/MonitorWsTask/MonitorWsTask.ts',
    'src/tasks.ts', 'src/Task.ts', 'src/tasks/types.ts',
    'src/tasks/pillLabel.ts',
    'src/components/tasks/BackgroundTasksDialog.tsx',
    'src/components/tasks/BackgroundTask.tsx',
    'src/components/tasks/MonitorWsDetailDialog.tsx',
    'src/tools/AgentTool/runAgent.ts',
  ]
  const texts=await Promise.all(paths.map(source))
  for(let i=0;i<paths.length;i++){
    assert.doesNotMatch(texts[i],/MonitorMcpTask|monitor_mcp|MonitorMcpDetailDialog/,paths[i])
  }
  assert.match(texts[1],/type:\s*'monitor_ws'/)
  assert.match(texts[1],/generateTaskId\('monitor_ws'\)/)
  assert.match(texts[2],/tasks\.push\(MonitorWsTask\)/)
  assert.match(texts[3],/monitor_ws:\s*'m'/)
  assert.match(texts[9],/killMonitorWsTasksForAgent\(/)
  assert.match(texts[6],/killMonitorWs\(currentSelection_0\.id, setAppState\)/)
})
