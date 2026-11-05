import assert from 'node:assert/strict'
import test from 'node:test'
import {
  stopTask,
  StopTaskError,
  resolveTaskToStop,
} from '../src/tasks/stopTask.ts'
import { TaskStopTool } from '../src/tools/TaskStopTool/TaskStopTool.ts'
import type { AppState } from '../src/state/AppState.tsx'
import type { TaskState } from '../src/tasks/types.ts'

function fixture(
  tasks: Record<string, unknown>,
  names = new Map<string, string>(),
) {
  let state = { tasks, agentNameRegistry: names } as unknown as AppState
  return {
    getAppState: () => state,
    setAppState: (update: (s: AppState) => AppState) => {
      state = update(state)
    },
  }
}
function shell(id: string, owner?: string) {
  let killed = 0
  return {
    state: {
      id,
      type: 'local_bash',
      status: 'running',
      description: 'fixture',
      command: 'sleep 99',
      agentId: owner,
      shellCommand: {
        kill: () => {
          killed++
        },
        cleanup: () => {},
      },
      notified: false,
    },
    killed: () => killed,
  }
}

test('317 TaskStop accepts deprecated shell_id and checks missing parameters in validation', async () => {
  assert.deepEqual(TaskStopTool.inputSchema.parse({ shell_id: 'b123' }), {
    shell_id: 'b123',
  })
  assert.deepEqual(TaskStopTool.inputSchema.parse({}), {})
  const context = fixture({})
  const result = await TaskStopTool.validateInput!({}, context as never)
  assert.equal(result.result, false)
  if (!result.result)
    assert.equal(result.message, 'Missing required parameter: task_id')
})

test('317 task stop resolves registered names with Unicode normalization', () => {
  const ctx = fixture(
    { a1: { id: 'a1', type: 'local_agent', status: 'running' } },
    new Map([['Research Agent', 'a1']]),
  )
  assert.equal(
    resolveTaskToStop('ＲＥＳＥＡＲＣＨ ＡＧＥＮＴ', ctx.getAppState()).id,
    'a1',
  )
})

test('317 ambiguous teammates cannot be stopped by an unqualified name', () => {
  const tasks = Object.fromEntries(
    ['one', 'two'].map(team => [
      team,
      {
        id: team,
        type: 'in_process_teammate',
        status: 'running',
        identity: { agentId: `reviewer@${team}`, agentName: 'reviewer' },
      },
    ]),
  )
  const ctx = fixture(tasks)
  assert.throws(
    () => resolveTaskToStop('reviewer', ctx.getAppState()),
    e => e instanceof StopTaskError && e.code === 'ambiguous',
  )
  assert.equal(resolveTaskToStop('reviewer@two', ctx.getAppState()).id, 'two')
})

test('317 an agent cannot stop another agent shell; the main session can', async () => {
  const target = shell('b1', 'owner')
  const ctx = fixture({ b1: target.state })
  await assert.rejects(
    stopTask('b1', { ...ctx, callerAgentId: 'other' }),
    e => e instanceof StopTaskError && e.code === 'not_owner',
  )
  assert.equal(target.killed(), 0)
  await stopTask('b1', ctx)
  assert.equal(target.killed(), 1)
  assert.equal(ctx.getAppState().tasks.b1!.status, 'killed')
})

test('317 an owner may stop its own shell and terminal errors retain the task status', async () => {
  const target = shell('b1', 'owner')
  const ctx = fixture({ b1: target.state })
  await stopTask('b1', { ...ctx, callerAgentId: 'owner' })
  await assert.rejects(
    stopTask('b1', ctx),
    e =>
      e instanceof StopTaskError &&
      e.code === 'not_running' &&
      e.taskStatus === 'killed',
  )
  assert.equal(target.killed(), 1)
})

test('317 teammate dispatch aborts, wakes waiters and removes pending work', async () => {
  const controller = new AbortController()
  let wakes = 0
  const task = {
    id: 't1',
    type: 'in_process_teammate',
    status: 'running',
    identity: { agentId: 'r@team', agentName: 'r', teamName: '' },
    description: 'review',
    abortController: controller,
    pendingUserMessages: ['queued'],
    onIdleCallbacks: [
      () => {
        wakes++
      },
    ],
    notified: false,
  }
  const ctx = fixture({ t1: task })
  await stopTask('t1', ctx)
  assert.equal(controller.signal.aborted, true)
  assert.equal(wakes, 1)
  const stopped = ctx.getAppState().tasks.t1 as TaskState & {
    pendingUserMessages: string[]
  }
  assert.equal(stopped.status, 'killed')
  assert.deepEqual(stopped.pendingUserMessages, [])
})

test('317 shell stop emits one terminal SDK event even when the kill path suppresses XML notices', async () => {
  const { setIsInteractive } = await import('../src/bootstrap/state.ts')
  const { drainSdkEvents } = await import('../src/utils/sdkEventQueue.ts')
  setIsInteractive(false)
  drainSdkEvents()
  const target = shell('b-event', 'owner')
  const ctx = fixture({ 'b-event': target.state })
  await stopTask('b-event', ctx)
  const events = drainSdkEvents().filter(e => e.subtype === 'task_notification')
  assert.equal(events.length, 1)
  assert.equal(events[0]!.status, 'stopped')
  assert.equal(events[0]!.task_id, 'b-event')
  await assert.rejects(stopTask('b-event', ctx), StopTaskError)
  assert.equal(drainSdkEvents().length, 0)
})

test('317 resumed teammate identities select a running record over historical copies', () => {
  const ctx = fixture({
    old: {
      id: 'old',
      type: 'in_process_teammate',
      status: 'completed',
      identity: {
        agentId: 'r@one',
        resumableAgentId: 'resume-1',
        agentName: 'r',
      },
    },
    live: {
      id: 'live',
      type: 'in_process_teammate',
      status: 'running',
      identity: {
        agentId: 'r@one',
        resumableAgentId: 'resume-1',
        agentName: 'r',
      },
    },
  })
  assert.equal(resolveTaskToStop('resume-1', ctx.getAppState()).id, 'live')
  assert.equal(resolveTaskToStop('r', ctx.getAppState()).id, 'live')
})

test('317 a teammate and registered agent sharing a name require an explicit ID', () => {
  const ctx = fixture(
    {
      t1: {
        id: 't1',
        type: 'in_process_teammate',
        status: 'running',
        identity: { agentId: 'review@team', agentName: 'review' },
      },
      a1: { id: 'a1', type: 'local_agent', status: 'running' },
    },
    new Map([['review', 'a1']]),
  )
  assert.throws(
    () => resolveTaskToStop('review', ctx.getAppState()),
    e =>
      e instanceof StopTaskError &&
      e.code === 'ambiguous' &&
      /matches both/.test(e.message),
  )
  assert.equal(resolveTaskToStop('a1', ctx.getAppState()).id, 'a1')
})

test('317 misspelled names offer a bounded suggestion without stopping any task', () => {
  const ctx = fixture(
    { a1: { id: 'a1', type: 'local_agent', status: 'running' } },
    new Map([['reviewer', 'a1']]),
  )
  for (const id of ['toString', 'constructor', '__proto__']) {
    assert.throws(() => resolveTaskToStop(id, ctx.getAppState()), e => e instanceof StopTaskError && e.code === 'not_found')
  }
  assert.throws(
    () => resolveTaskToStop('reviwer', ctx.getAppState()),
    e =>
      e instanceof StopTaskError &&
      e.code === 'not_found' &&
      /Did you mean: reviewer/.test(e.message),
  )
  assert.throws(
    () => resolveTaskToStop('unrelated', ctx.getAppState()),
    e => e instanceof StopTaskError && !/Did you mean/.test(e.message),
  )
})

test('317 named task resolution matches the original Xe/YKn entry points', {
  skip: !process.env.CLAUDE_CODE_317_DECOMPILED,
}, async () => {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { runInNewContext } = await import('node:vm')
  const root = join(
    process.env.CLAUDE_CODE_317_DECOMPILED!,
    '04_逐模块可阅读JavaScript',
  )
  const source = readFileSync(join(root, 'chunk-bbmaktv0.js'), 'utf8')
  const teammateSource = readFileSync(join(root, 'chunk-27w7zeqw.js'), 'utf8')
  function extract(text: string, name: string): string {
    const start = text.indexOf(`function ${name}(`)
    assert.ok(start >= 0, name)
    const rest = text.slice(start)
    const next = /\n(?:function|class|var|export) /.exec(rest)
    assert.ok(next, name)
    return rest.slice(0, next.index)
  }
  const original = runInNewContext(
    [
      ...['KHe', 'YKn', 'z_t'].map(name => extract(teammateSource, name)),
      ...['Oe', 'Xe', 'li', 'qo', 'Uo', 'Ho', 'ii'].map(name =>
        extract(source, name),
      ),
      'Xe',
    ].join('\n'),
    {
      xf: (t: { type: string }) => t.type === 'in_process_teammate',
      rs: (s: string) => ['completed', 'failed', 'killed'].includes(s),
      uD: () => false,
      Oo: (s: string) =>
        s
          .normalize('NFKC')
          .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, c => (/\s/.test(c) ? c : ''))
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '-'),
      CV: (s: string) => s,
      TQ: () => [],
    },
  ) as (
    input: string,
    registry: { all(): unknown; get(id: string): unknown },
    getState: () => AppState,
  ) => { status: string; task?: TaskState; anyLiveCandidate?: boolean }
  let comparisons = 0
  for (const status of ['running', 'completed'])
    for (const collision of [false, true]) {
      const ctx = fixture(
        {
          t1: {
            id: 't1',
            type: 'in_process_teammate',
            status,
            identity: {
              agentId: 'review@team',
              agentName: 'review',
              resumableAgentId: 'resume-1',
            },
          },
          a1: { id: 'a1', type: 'local_agent', status: 'running' },
        },
        new Map([[collision ? 'review' : 'analyst', 'a1']]),
      )
      const state = ctx.getAppState()
      for (const input of [
        'review@team',
        'resume-1',
        'review',
        'ＲＥＶＩＥＷ',
        'analyst',
        'unknown',
      ]) {
        const reference = original(
          input,
          { all: () => state.tasks, get: id => state.tasks[id] },
          ctx.getAppState,
        )
        if (reference.status === 'found')
          assert.equal(resolveTaskToStop(input, state).id, reference.task!.id)
        else
          assert.throws(
            () => resolveTaskToStop(input, state),
            e =>
              e instanceof StopTaskError &&
              e.code ===
                (reference.status === 'ambiguous' && !reference.anyLiveCandidate
                  ? 'not_running'
                  : reference.status),
          )
        comparisons++
      }
    }
  assert.equal(comparisons, 24)
})

test('317 TaskStop uses the shared task store inside an isolated agent context', async () => {
  const target = shell('b-owned', 'owner')
  const root = fixture({ 'b-owned': target.state })
  let isolatedWrites = 0
  const context = {
    getAppState: root.getAppState,
    setAppState: () => {
      isolatedWrites++
    },
    setAppStateForTasks: root.setAppState,
    agentId: 'owner',
  }
  await TaskStopTool.call(
    { task_id: 'b-owned' },
    context as never,
    undefined as never,
    undefined as never,
  )
  assert.equal(isolatedWrites, 0)
  assert.equal(target.killed(), 1)
  assert.equal(root.getAppState().tasks['b-owned']!.status, 'killed')
})
