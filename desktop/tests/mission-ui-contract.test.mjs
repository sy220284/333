import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const root = new URL('..', import.meta.url)
const read = relative => readFileSync(new URL(relative, root), 'utf8')
const app = read('src/App.tsx')
const css = read('src/theme/yaoyao-layout.css')
const gateway = read('../src/services/desktop/gateway.ts')
const electron = read('electron/main.ts')
const missionCalls = [
  'missions.list', 'missions.create', 'missions.select',
  'missions.updateStatus', 'missions.checkpoint',
]
const jobCalls = [
  'missions.jobs.list', 'missions.jobs.enqueue',
  'missions.jobs.start', 'missions.jobs.evidence',
  'missions.jobs.previewIntegrate', 'missions.jobs.integrate',
  'missions.jobs.approve', 'missions.jobs.retry',
  'missions.jobs.recover', 'missions.jobs.cancel',
  'missions.jobs.runBatch', 'missions.jobs.runQueue',
  'missions.jobs.haltQueue', 'missions.jobs.queueStatus',
]
const permitted = new Set((electron.match(/const permitted = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '')
  .match(/'[^']+'/g)?.map(value => value.slice(1, -1)) ?? [])

test('长期任务从创建、选中、状态切换到检查点均有完整桌面和宿主入口', () => {
  for (const name of missionCalls) {
    assert.ok(app.includes(name), '桌面操作缺失：' + name)
    assert.ok(permitted.has(name), 'Electron 未授权请求：' + name)
    assert.ok(gateway.includes("case '" + name + "'"), '后端执行分支缺失：' + name)
  }
  assert.match(app, /setMissions\(/)
  assert.match(app, /setSelectedMission\(/)
  assert.match(app, /setMissionDraft\(/)
  assert.match(app, /mission\.status/)
})
test('工作项完整经历入队、执行、暂停分发、审核、重试、取消和集成', () => {
  for (const name of jobCalls) {
    assert.ok(app.includes(name), '桌面工作项入口缺失：' + name)
    assert.ok(permitted.has(name), 'Electron 未授权工作项操作：' + name)
    assert.ok(gateway.includes("case '" + name + "'"), '本地执行缺失：' + name)
  }
  assert.match(app, /setMissionJobs\(/)
  assert.match(app, /missionQueueActive/)
  assert.match(app, /missionJobs\.map\(job=>/)
  assert.match(app, /missionActivity\.slice\(0,12\)/)
  assert.match(app, /mission\.job\.updated/)
  assert.match(gateway, /reconcileMissionTerminalJobs/)
})
test('风险操作保留实际结果核对和明确授权', () => {
  assert.match(app, /if\(method==='missions\.jobs\.approve' && !window\.confirm\(/)
  assert.match(app, /if\(method==='missions\.jobs\.retry' && !window\.confirm\(/)
  assert.match(app, /if\(method==='missions\.jobs\.cancel' && !window\.confirm\(/)
  assert.match(app, /missions\.jobs\.previewIntegrate/)
  assert.match(app, /sourceHead:check\.sourceHead,targetHead:check\.targetHead/)
  assert.match(app, /'permissions\.decide'/)
  assert.match(gateway, /This mission belongs to a different workspace/)
})
test('主子任务与团队任务统一投影到工作台，后台任务可停止与续办', () => {
  for (const method of ['agents.overview', 'agents.activity', 'agents.members',
    'agents.team.message', 'agents.team.inbox', 'tasks.list', 'tasks.stop', 'tasks.resume']) {
    assert.ok(app.includes(method), '缺失协作展示或操作：' + method)
    assert.ok(permitted.has(method), '缺失本地协议授权：' + method)
  }
  assert.match(app, /source:'session-task'\|'mission-job'\|'mission-assignment'/)
  assert.match(app, /mission\.activity/)
  assert.match(app, /task\.status==='running'/)
  assert.match(app, /missions\.jobs\.runBatch/)
})
test('任务列表保持可读响应式布局和更新提示，并遵循低动态偏好', () => {
  assert.match(app, /yy-missions-layout/)
  assert.match(app, /grid-cols-\[300px_minmax\(0,1fr\)\]/)
  assert.match(app, /<Card key=\{job\.id\}/)
  assert.match(app, /className="yy-job-card min-w-0"/)
  assert.match(app, /data-updated=\{updatedJobId===job\.id\|\|undefined\}/)
  assert.match(css, /\.yy-job-card\[data-updated=true\]::after/)
  assert.match(css, /prefers-reduced-motion/)
  assert.match(css, /data-motion=off/)
})
