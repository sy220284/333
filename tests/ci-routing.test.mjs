import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { SPECIALISTS, WORKFLOWS, routeChanges, selectBaseline } from '../build/ci-impact.mjs'

const active = plan => Object.entries(plan).filter(([, enabled]) => enabled).map(([name]) => name)

test('28 个专项保留、统一入口调用，全量始终覆盖所有专项', () => {
  const files = readdirSync(new URL('../.github/workflows/', import.meta.url))
    .filter(x => x.endsWith('.yml') && x !== 'ci-on-demand.yml' && x !== 'latest-stable-upgrade.yml')
  assert.deepEqual(WORKFLOWS.slice().sort(), files.map(x => x.slice(0, -4)).sort())
  for (const name of WORKFLOWS) {
    assert.ok(Array.isArray(SPECIALISTS[name]), `缺少路由配置：${name}`)
    const yaml = readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8')
    assert.match(yaml, /^ {2}workflow_call:\s*$/m, `${name} 缺少可复用调用`)
    assert.doesNotMatch(yaml, /^ {2}pull_request:\s*$/m, `${name} 仍重复触发 PR`)
  }
  assert.deepEqual(active(routeChanges([], true)).sort(), WORKFLOWS.slice().sort())
})

test('企业网关与原厂 Runner 均已清退，个人后台任务保持独立', () => {
  assert.equal(Object.hasOwn(SPECIALISTS, 'm6-gateway-providers-317'), false)
  assert.equal(Object.hasOwn(SPECIALISTS, 'm6-self-hosted-runner-317'), false)
  const plan = routeChanges(['src/services/agentCenter/missionJobs.ts'])
  assert.equal(plan['local-feature-promotion'], true)
  const dispatcher = readFileSync(new URL('../.github/workflows/ci-on-demand.yml', import.meta.url), 'utf8')
  assert.doesNotMatch(dispatcher, /m6_gateway_providers_317|m6_self_hosted_runner_317/)
  assert.deepEqual(active(routeChanges([], true)).sort(), WORKFLOWS.slice().sort())
})

test('个人版退役门禁在服务或保护测试变化时按需运行', () => {
  const plan = routeChanges(['src/cli/gateway/gatewayAdmin317.ts', 'tests/enterprise-retirement-boundary.test.mjs'])
  assert.equal(plan['personal-retirement-boundary'], true)
  assert.equal(plan['ci-test-matrix'], false)
  const dispatcher = readFileSync(new URL('../.github/workflows/ci-on-demand.yml', import.meta.url), 'utf8')
  assert.match(dispatcher, /personal_retirement_boundary/)
  assert.ok(dispatcher.includes('uses: ./.github/workflows/personal-retirement-boundary.yml'))
})

test('每次基础门禁固定启用、文档变更不启动全量检查', () => {
  assert.deepEqual(active(routeChanges(['docs/README.md'])), ['governance-audit'])
})

test('最近提交只派发对应专项，多个提交累计改动合并为并行检查', () => {
  const touched = [
    'src/services/desktop/gateway.ts',
    'src/proactive/useProactive.ts',
  ]
  const planned = routeChanges(touched)
  assert.equal(planned['desktop-communication'], true)
  assert.equal(planned['local-feature-promotion'], true)
  assert.equal(planned['ci-test-matrix'], false)
  assert.equal(planned['latest-stable-six-host'], false)
  assert.equal(planned.rebuild, false)
})

test('超级智能体队列变化仅触发本地能力和桌面专项，不挤占全量门禁', () => {
  const planned = routeChanges([
    'src/services/agentCenter/missionJobs.ts',
    'tests/mission-jobs.test.ts',
  ])
  assert.equal(planned['desktop-communication'], true)
  assert.equal(planned['local-feature-promotion'], true)
  assert.equal(planned['ci-test-matrix'], false)
  assert.equal(planned['latest-stable-six-host'], false)
})

test('未知业务代码走通用检查，构建修改触发完整构建专项', () => {
  const unknown = routeChanges(['src/features/newCapability.ts'])
  assert.equal(unknown['dev-quality'], true)
  assert.equal(unknown['ci-test-matrix'], false)
  const build = routeChanges(['build/compile-standalone.mjs'])
  assert.equal(build.rebuild, true)
  assert.equal(build['dev-toolchain'], true)
})

test('单个工作流修改只覆盖该专项；路由修改还核验调度工具链', () => {
  const chosen = routeChanges(['.github/workflows/sdk-stream-parity.yml'])
  assert.equal(chosen['sdk-stream-parity'], true)
  assert.equal(chosen.codeql, false)
  const dispatcher = routeChanges(['build/ci-impact.mjs'])
  assert.equal(dispatcher['dev-toolchain'], true)
  assert.equal(dispatcher['dev-quality'], true)
})

test('历史累计基准优先采用最近成功验收的祖先提交', () => {
  const sha1 = '1'.repeat(40), sha2 = '2'.repeat(40), head = '3'.repeat(40)
  const records = [
    { event: 'pull_request', head_sha: sha1, status: 'completed', conclusion: 'success', created_at: '2026-11-06T12:00:00Z', pull_requests: [{ number: 19 }] },
    { event: 'pull_request', head_sha: sha2, status: 'completed', conclusion: 'cancelled', created_at: '2026-11-06T13:00:00Z', pull_requests: [{ number: 19 }] },
  ]
  const result = selectBaseline(records, 19, head, x => x === sha1 || x === sha2)
  assert.deepEqual(result, { sha: sha1, reason: 'last-success' })
})

test('其他 PR、非祖先的成功记录不会被误用为增量基准', () => {
  const head = 'c'.repeat(40)
  const records = [
    { event: 'pull_request', head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'success', created_at: '2026-11-06T12:00:00Z', pull_requests: [{ number: 20 }] },
    { event: 'pull_request', head_sha: 'b'.repeat(40), status: 'completed', conclusion: 'success', created_at: '2026-11-06T13:00:00Z', pull_requests: [{ number: 19 }] },
  ]
  assert.equal(selectBaseline(records, 19, head, () => false), null)
})

test('中止过期运行时汇总门禁不会继续占用 Runner', () => {
  const read = name => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8')
  assert.match(read('ci-on-demand.yml'), /if: \$\{\{ !cancelled\(\) \}\}/)
  assert.match(read('ci-test-matrix.yml'), /if: \$\{\{ !cancelled\(\) \}\}/)
})

test('所有保留 push 入口的工作流限定到指定分支，PR 提交只触发调度入口', () => {
  const files = readdirSync(new URL('../.github/workflows/', import.meta.url)).filter(x => x.endsWith('.yml'))
  for (const file of files) {
    const lines = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8').split(/\r?\n/)
    const index = lines.findIndex(x => /^ {2}push:\s*$/.test(x))
    if (index < 0) continue
    let i = index + 1
    while (i < lines.length && (/^ {4}/.test(lines[i]) || !lines[i].trim())) i++
    assert.match(lines.slice(index + 1, i).join('\n'), /^ {4}branches:/m, file)
  }
})

test('全量矩阵和六架构工作流自身修改在 Draft 阶段只做配置审查', () => {
  const plan = routeChanges(['.github/workflows/ci-test-matrix.yml', '.github/workflows/latest-stable-six-host.yml'])
  assert.equal(plan['ci-test-matrix'], false)
  assert.equal(plan['latest-stable-six-host'], false)
  const full = routeChanges([], true)
  assert.equal(full['ci-test-matrix'], true)
  assert.equal(full['latest-stable-six-host'], true)
})

test('SDK 源码变更覆盖协议与桌面专项，桌面窗口变更也走桌面专项', () => {
  const sdk = routeChanges(['src/entrypoints/sdk/sessionRuntime317.ts'])
  assert.equal(sdk['sdk-stream-parity'], true)
  assert.equal(sdk['desktop-communication'], true)
  const desktop = routeChanges(['desktop/electron/preload.ts'])
  assert.equal(desktop['desktop-communication'], true)
  assert.equal(desktop['ci-test-matrix'], false)
})

test('317升级链路运行门禁按变更自动选择真实专项，基础门禁不漏392证据',()=>{
  for(const file of ['src/query.ts','src/query/turnEffort317.ts','tests/m2-ultrathink-turn-effort-317.test.ts','tests/m2-ultrathink-release-request-317.test.mjs','build/rebuild.mjs']){
    const planned=routeChanges([file])
    assert.equal(planned['m2-prompt-functional-integration-317'],true,file)
    assert.equal(planned['ci-test-matrix'],false,file)
  }
  for(const file of ['src/utils/swarm/teamLifecycleLock.ts','src/utils/swarm/teammatePermissionMode317.ts',
    'src/utils/teammateMailbox.ts','src/hooks/useInboxPoller.ts',
    'tests/m4-team-lifecycle-runtime-317.test.ts','tests/m4-teammate-permission-inheritance-317.test.mjs']){
    const planned=routeChanges([file])
    assert.equal(planned['local-feature-promotion'],true,file)
    assert.equal(planned['ci-test-matrix'],false,file)
  }
  const local=readFileSync(new URL('../.github/workflows/local-feature-promotion.yml',import.meta.url),'utf8')
  const m2=readFileSync(new URL('../.github/workflows/m2-prompt-functional-integration-317.yml',import.meta.url),'utf8')
  const dispatcher=readFileSync(new URL('../.github/workflows/ci-on-demand.yml',import.meta.url),'utf8')
  assert.match(local,/bun test tests\/m4-team-lifecycle-runtime-317\.test\.ts/)
  assert.match(local,/node --test tests\/m4-teammate-permission-inheritance-317\.test\.mjs/)
  assert.match(m2,/bun test tests\/m2-ultrathink-turn-effort-317\.test\.ts/)
  assert.match(m2,/node --test tests\/m2-ultrathink-release-request-317\.test\.mjs/)
  assert.match(dispatcher,/tests\/upgrade317-evidence-report\.test\.mjs/)
})

test('CI 最新 PR 提交不会被旧 SHA 的手动回跑取消', () => {
  const main=readFileSync(new URL('../.github/workflows/ci-on-demand.yml',import.meta.url),'utf8')
  const desktop=readFileSync(new URL('../.github/workflows/desktop-communication.yml',import.meta.url),'utf8')
  for(const [name,yaml] of [['统一路由',main],['桌面安装版',desktop]]){
    assert.match(yaml,/^ {2}group: .*github\.run_attempt == 1 && 'latest' \|\| github\.run_id/m,`${name}缺少区分最新提交与旧SHA回跑的分组`)
    assert.match(yaml,/^ {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' && github\.run_attempt == 1 \}\}$/m,`${name}历史重跑不得取消最新PR验收`)
  }
})
