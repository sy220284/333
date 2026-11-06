import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Mission 工具接入正式工具池与协调者权限列表', () => {
  assert.match(read('src/tools.ts'), /MissionTool/)
  assert.match(read('src/constants/tools.ts'), /'Mission'/)
  assert.match(read('src/coordinator/coordinatorMode.ts'), /Mission/)
})
test('Mission 只维护本地已授权任务，没有后台自动启动逻辑', () => {
  const source = read('src/tools/MissionTool/MissionTool.ts')
  assert.match(source, /isEnabled\(\) \{ return isSuperAgentMode\(\) \}/)
  assert.match(source, /saveMissionCheckpoint/)
  assert.match(source, /finishMissionAssignment/)
  assert.doesNotMatch(source, /launchWorkflow|runAsyncAgentLifecycle|addCronTask/)
})
