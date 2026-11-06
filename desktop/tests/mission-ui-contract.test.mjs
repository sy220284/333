import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const source = path => readFileSync(new URL(path, root), 'utf8')

test('桌面安全网关完整放行工作项队列与人工审核方法', () => {
  const main = source('electron/main.ts')
  const protocol = source('../src/services/desktop/protocol.ts')
  assert.ok(main.includes("'agents.members'"), '桌面IPC缺少真实团队成员查询')
  assert.ok(protocol.includes("request('agents.members'"), '协议缺少团队成员查询')
  for (const action of [
    'list', 'enqueue', 'start', 'runBatch', 'runQueue', 'haltQueue', 'queueStatus', 'approve', 'retry', 'recover', 'cancel',
  ]) {
    assert.ok(main.includes(`'missions.jobs.${action}'`), `Electron IPC 未开放 ${action}`)
    assert.ok(protocol.includes(`request('missions.jobs.${action}'`), `后端协议缺少 ${action}`)
  }
})

test('桌面长期任务工作台提供真实执行入口与安全状态动作', () => {
  const app = source('src/App.tsx')
  assert.match(app, /missions\.jobs\.list/)
  assert.match(app, /missions\.jobs\.enqueue/)
  assert.match(app, /missions\.jobs\.runBatch/)
  assert.match(app, /missions\.jobs\.runQueue/)
  assert.match(app, /missions\.jobs\.haltQueue/)
  assert.match(app, /missionQueueActive/)
  assert.match(app, /missions\.jobs\.start/)
  assert.match(app, /missions\.jobs\.approve/)
  assert.match(app, /missions\.jobs\.retry/)
  assert.match(app, /missions\.jobs\.recover/)
  assert.match(app, /sessions\.interrupt/)
  assert.match(app, /selectedMissionRef\.current/)
  assert.match(app, /agents\.members/)
  assert.match(app, /window\.confirm/)
  assert.doesNotMatch(app, /job\.status==='running'&&<button onClick=\{\(\)=>void jobAction\('missions\.jobs\.cancel'/)
})

test('多个SDK会话共享审批收件箱，但结果只回到发起请求的原会话', () => {
  const app = source('src/App.tsx')
  assert.match(app, /globalInbox=.*permission\.request/)
  assert.match(app, /sessionId:pending\.sessionId,permissionId:id/)
  assert.match(app, /sessionId:pending\.sessionId,requestId:id/)
  assert.match(app, /item\.sessionId!==event\.sessionId/)
  assert.match(app, /会话 \{p\.sessionId\.slice\(0,8\)\}/)
  assert.doesNotMatch(app, /if\(!sessionId\)return\s+await operation\('权限审批'/)
})

test('长期任务视图显示正确的检查点、执行次数、终态和异常恢复说明', () => {
  const app = source('src/App.tsx')
  const css = source('src/styles.css')
  assert.match(app, /selected\.checkpoint/)
  assert.match(app, /执行次数：\{job\.attempt\}/)
  assert.match(app, /状态|待审核/)
  assert.match(css, /\.job-card:focus-within/)
  assert.match(css, /prefers-reduced-motion/)
})
