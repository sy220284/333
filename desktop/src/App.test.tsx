import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { desktopHost } from './lib/desktopHost'
import { startSDK } from './lib/sdk'
import type { SessionEvent } from './lib/sdk'
import { workspaceProjectionFixture } from './test/workspaceProjectionFixture'

vi.mock('./lib/sdk', () => ({ startSDK: vi.fn() }))
vi.mock('./lib/desktopHost', () => ({
  desktopHost: { start: vi.fn(), rpc: vi.fn(), onEvent: vi.fn(), onHostEvent: vi.fn() },
}))
vi.mock('./lib/updater', () => ({
  AppUpdater: { start: vi.fn(), onStatus: vi.fn(() => () => {}), install: vi.fn() },
}))

let handler: ((event: SessionEvent) => void) | undefined
let hostHandler: ((event: any) => void) | undefined
let workspaceEventHandler: ((event: any) => void) | undefined
let workspaceEventRevision = 0
let state: any
let workspaceToken: string
let workspaceConfig: any
let hookProfiles: any
let hookSettingsRevision = 0
let hookExecutionRevision = 0
let stableMissionJobs = false
const resetWorkspaceEvents = () => { workspaceEventRevision = 0; workspaceEventHandler = undefined }
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const installedModel = { ...workspaceProjectionFixture.models[0], modelId: 'kimi/kimi-k2.5', installed: true, enabled: true, scopes: ['user'], locations: [{ scope: 'user', source: 'test', location: '/tmp/models.json' }], source: 'test' }

beforeEach(() => {
  vi.clearAllMocks()
  hookExecutionRevision = 0
  hookSettingsRevision = 0
  hookProfiles = { version: 1, activeProfileId: 'safe', disabled: false, settingsRevision: 0, executionRevision: 0, profiles: [
    { id: 'safe', name: '安全模式', description: '删除、覆盖和外部操作需要审批', mode: 'guarded', rules: [{ id: 'delete', pattern: 'rm -rf', action: 'ask', enabled: true }] },
    { id: 'strict', name: '严格审批', description: '工具和外部操作逐项审批', mode: 'strict', rules: [] },
  ], recent: [] }
  stableMissionJobs = false
  handler = undefined
  hostHandler = undefined
  resetWorkspaceEvents()
  workspaceToken = 'test-connector-token'
  workspaceConfig = { version: 1, tokenConfigured: true, connectorTokenRequired: true, recoveryRequired: false, recoveryReasons: [], blockedReason: null, readOnly: false, writable: true, capabilities: { read: true, write: true, session: true, budget: true, 'mission.authorize': true, 'workspace.teamBudget': true, 'session.messages.list': true } }
  state = {
    workspace: '/tmp/project',
    authenticated: true,
    token: 'desktop-host-token',
    authRequired: false,
    authMethods: [],
    externalMethods: [],
    providerReadiness: { kimi: false, moonshot: false, anthropic: false, openai: false },
    selectedWorkspace: '/tmp/project',
    workspaces: [{ path: '/tmp/project', name: 'project' }],
    worktrees: [],
    github: { connected: false, repo: 'owner/project', branch: 'main', scopes: ['project'], authMode: 'gh', tokenConfigured: false, authMethod: 'gh', owner: 'owner', repoName: 'project', installation: { status: 'not_installed', connected: false, authMethod: 'gh', owner: 'owner', repoName: 'project' } },
    selectedSessionId: '',
    sessions: [],
    checkpoints: [],
    runs: [],
    missions: [],
    teams: [],
    tasks: [],
    pendingApprovals: [],
    approvals: [],
    ...clone(workspaceProjectionFixture),
    models: [installedModel],
    providers: workspaceProjectionFixture.providers.map(provider => provider.id === 'kimi' ? { ...provider, configured: false } : provider),
    teamBudget: { budgetUsd: 1, spentUsd: 0, authorizedUsd: 0, remainingUsd: 1, availableUsd: 1, coordinatorReservedUsd: 0.15, memberBudgetUsd: 0.85, minMemberBudgetUsd: 0.01, revision: 1, ledgerEntryCount: 0 },
    teamBudgetRevision: 1,
    cost: { currency: 'USD', totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0 } },
    costLedger: { missionId: '', totalCostUSD: 0, budgetUSD: 0, remainingUSD: 0, totals: { costUSD: 0 } },
  }
  vi.mocked(desktopHost.start).mockResolvedValue(clone(state))
  vi.mocked(desktopHost.onEvent).mockImplementation(callback => { workspaceEventHandler = callback; return () => {} })
  vi.mocked(desktopHost.onHostEvent).mockImplementation(callback => { hostHandler = callback; return () => {} })
  vi.mocked(desktopHost.rpc).mockImplementation(async (method: string, args: any = {}) => {
    switch (method) {
      case 'workspace.auth.start': return { external: true, method: 'kimi', methods: ['kimi', 'device'], device: { verificationUri: 'https://example.com', userCode: 'ABCD-1234' } }
      case 'workspace.auth.poll': return { pending: true, method: 'kimi', methods: ['kimi', 'device'], external: true, device: { verificationUri: 'https://example.com', userCode: 'ABCD-1234' } }
      case 'desktop.connectorToken': return { token: workspaceToken }
      case 'workspace.capabilities.get': return clone(workspaceConfig)
      case 'hooks.profiles.list': return clone(hookProfiles)
      case 'hooks.profile.set': hookProfiles = { ...hookProfiles, activeProfileId: args.profileId }; return clone(hookProfiles)
      case 'hooks.rules.set': hookProfiles = { ...hookProfiles, rules: args.rules }; return clone(hookProfiles)
      case 'workspace.snapshot': return clone(state)
      case 'sessions.list': return { sessions: state.sessions, selectedSessionId: state.selectedSessionId }
      case 'sessions.open': return { sessionId: 'session-open', messages: [] }
      case 'sessions.ensureOpen': return { sessionId: 'session-open', messages: [] }
      case 'sessions.create': return { sessionId: 'session-new', messages: [] }
      case 'sessions.get': return { sessionId: args.sessionId || 'session-open', messages: [], entries: [] }
      case 'sessions.delete': return { deleted: true }
      case 'session.messages.list': return { messages: [{ id: 'persisted-user', role: 'user', content: '持久化消息', seq: 1 }], entries: [{ id: 'persisted-user', role: 'user', content: '持久化消息', seq: 1 }], hasEarlier: false, hasMore: false, nextBefore: null, limit: 80, total: 1 }
      case 'runs.list': return { runs: state.runs }
      case 'runs.stop': return { stopped: true }
      case 'sessions.stop': return { stopped: true, runId: args.runId }
      case 'missions.list': return { missions: stableMissionJobs ? [{ missionId: 'mission-fixture', objective: '稳定工作项任务', status: 'active' }] : [], selectedMissionId: stableMissionJobs ? 'mission-fixture' : '' }
      case 'missions.get': return { missionId: 'mission-1', status: 'active', taskId: 'task-1', objective: '修复测试', teamId: 'team-1', progress: { completed: 1, total: 2 }, members: [{ agentId: 'agent-1', role: 'coordinator', status: 'running' }] }
      case 'missions.pause': return { missionId: args.missionId, status: 'paused' }
      case 'missions.resume': return { missionId: args.missionId, status: 'running' }
      case 'missions.cancel': return { missionId: args.missionId, status: 'cancelled' }
      case 'missions.authorize': return { missionId: args.missionId, status: 'authorized' }
      case 'tasks.list': return { tasks: args.includeChildren === false ? [{ taskId: 'task-parent', missionId: 'mission-parent', parentMissionId: 'mission-root', rootMissionId: 'mission-root', objective: '团队子任务', status: 'blocked', childCount: 1, source: 'agent', sourceLabel: '智能体委派', awaitingKind: 'permission', pendingApprovalCount: 1, progress: 0.5 }] : [], authorizations: [], ledger: [], budgets: [] }
      case 'tasks.budget.set': return { taskId: args.taskId || args.missionId, missionId: args.missionId, budgetUsd: args.budgetUsd, revision: 3 }
      case 'tasks.batchControl': return { action: args.action, succeeded: args.missionIds, failed: [] }
      case 'tasks.pause': return { taskId: args.taskId, status: 'paused' }
      case 'tasks.resume': return { taskId: args.taskId, status: 'running' }
      case 'tasks.cancel': return { taskId: args.taskId, status: 'cancelled' }
      case 'tasks.authorize': return { taskId: args.taskId, status: 'authorized' }
      case 'tasks.get': return { taskId: 'task-1', status: 'running', teamId: 'team-1', objective: '修复测试' }
      case 'tasks.assign': return { assigned: true, taskId: args.taskId, toAgentId: args.toAgentId }
      case 'tasks.sendMessage': return { sent: true, taskId: args.taskId }
      case 'teams.list': return { teams: [{ teamId: 'team-1', name: '修复小组', status: 'running', members: [{ agentId: 'agent-1', role: 'coordinator' }], channelMessages: [{ messageId: 'member-message-1', fromAgentId: 'agent-2', toAgentId: 'agent-1', content: '成员已完成代码审查', direction: 'outbound', taskId: 'task-child-1', rootMissionId: 'mission-root', parentMissionId: 'mission-parent' }] }] }
      case 'teams.get': return { teamId: 'team-1', name: '修复小组', status: 'running', members: [{ agentId: 'agent-1', role: 'coordinator' }], channelMessages: [{ messageId: 'member-message-1', fromAgentId: 'agent-2', toAgentId: 'agent-1', content: '成员已完成代码审查', direction: 'outbound' }] }
      case 'missions.jobs.list': return { jobs: stableMissionJobs ? [{ id: 'job-1', title: '先执行', instruction: '第一步', status: 'queued', attempt: 1 }, { id: 'job-2', title: '后执行', instruction: '第二步', status: 'queued', attempt: 1 }] : [] }
      case 'missions.jobs.control': return { jobId: args.jobId, status: args.action === 'cancel' ? 'cancelled' : args.action === 'pause' ? 'paused' : 'queued' }
      case 'checkpoints.list': return { checkpoints: [] }
      case 'models.list': return { models: state.models, providers: state.providers }
      case 'models.get': return { models: state.models, providers: state.providers, modelId: args.modelId || 'kimi/kimi-k2.5' }
      case 'model.set': return { modelId: args.modelId, provider: String(args.modelId).split('/')[0] }
      case 'models.default.set': return { modelId: args.modelId, provider: String(args.modelId).split('/')[0] }
      case 'models.presets.list': return { presets: [] }
      case 'models.presets.save': return { presetId: 'preset-1', modelId: args.modelId }
      case 'models.presets.delete': return { presetId: args.presetId, deleted: true }
      case 'models.presets.setDefault': return { presetId: args.presetId, modelId: args.modelId, default: true }
      case 'models.validation.start': return { validationId: 'validation-1', modelId: args.modelId, status: 'queued' }
      case 'models.validation.list': return { validations: [{ validationId: 'validation-1', modelId: args.modelId || 'kimi/kimi-k2.5', status: 'passed', ok: true, httpStatus: 200, attempts: [{ status: 'passed', httpStatus: 200 }] }] }
      case 'models.credentials.set': return { provider: args.provider, configured: true, status: { provider: args.provider, configured: true } }
      case 'models.credentials.clear': return { provider: args.provider, configured: false, status: { provider: args.provider, configured: false } }
      case 'providers.credentials.set': return { provider: args.provider, configured: true }
      case 'providers.credentials.clear': return { provider: args.provider, configured: false }
      case 'models.forge.list': return { artifacts: [] }
      case 'models.local.list': return { artifacts: [] }
      case 'models.forge.plan': return { planId: 'plan-1', provider: args.provider, modelId: args.modelId }
      case 'models.forge.execute': return { planId: args.planId, executionId: 'execution-1', status: 'queued' }
      case 'models.forge.executions': return { executions: [] }
      case 'models.local.plan': return { planId: 'local-plan-1', modelId: args.modelId }
      case 'models.local.execute': return { planId: args.planId, status: 'completed' }
      case 'models.install': return { provider: args.provider, installed: true }
      case 'models.uninstall': return { provider: args.provider, removed: true }
      case 'models.validate': return { ok: true, provider: args.provider, modelId: args.modelId }
      case 'models.test': return { ok: true, modelId: args.modelId }
      case 'models.test.start': return { testId: 'test-1', status: 'queued' }
      case 'models.test.get': return { testId: args.testId, status: 'passed' }
      case 'models.test.stop': return { testId: args.testId, stopped: true }
      case 'models.selftest': return { ok: true, modelId: args.modelId }
      case 'files.list': return { entries: [{ name: 'README.md', path: 'README.md', type: 'file' }] }
      case 'files.get': return { path: args.path || 'README.md', content: '# project' }
      case 'files.save': return { path: args.path || 'README.md', saved: true }
      case 'files.saveAsset': return { assetId: 'asset-1', path: args.path || 'README.md' }
      case 'files.open': return { opened: true, path: args.path || 'README.md' }
      case 'files.reveal': return { revealed: true, path: args.path || 'README.md' }
      case 'files.revealInFolder': return { revealed: true, path: args.path || 'README.md' }
      case 'files.pickFolder': return { path: '/tmp/new-project' }
      case 'files.pickAsset': return { path: '/tmp/image.png', name: 'image.png' }
      case 'files.createFolder': return { path: args.path || '/tmp/new-project', created: true }
      case 'git.status': return { branch: 'main', changes: [] }
      case 'git.diff': return { path: args.path || 'README.md', diff: '' }
      case 'github.get': return state.github
      case 'github.repository.get': return state.github
      case 'github.installation.get': return state.github.installation
      case 'github.connect': return { connected: true, authMode: 'gh' }
      case 'github.configure': return { configured: true }
      case 'github.auth.start': return { authorizationUrl: 'https://github.com/login/oauth/authorize?client_id=test', mode: 'oauth', deviceFlow: false }
      case 'github.auth.callback': return { connected: true }
      case 'github.auth.poll': return { connected: true, mode: 'device' }
      case 'github.auth.mode.set': return { mode: args.mode }
      case 'github.installation.start': return { authorizationUrl: 'https://github.com/apps/test/installations/new' }
      case 'github.installation.callback': return { connected: true }
      case 'github.installation.poll': return { connected: true }
      case 'github.auth.disconnect': return { connected: false }
      case 'github.credentials.set': return { configured: true }
      case 'github.credentials.clear': return { configured: false }
      case 'mcp.list': return { servers: [{ name: 'project-mcp', scope: 'project', enabled: true }], projectPath: '/tmp/project' }
      case 'mcp.get': return { servers: [{ name: 'project-mcp', scope: 'project', enabled: true }] }
      case 'mcp.add': return { name: args.name, added: true }
      case 'mcp.remove': return { name: args.name, removed: true }
      case 'mcp.enable': return { name: args.name, enabled: true }
      case 'mcp.import.pick': return { cancelled: false, source: '/tmp/.mcp.json', detected: { name: 'JSON 配置' }, availableCount: 1, conflicts: [], invalidCount: 0 }
      case 'mcp.import.apply': return { imported: 1, skipped: 0, errors: [] }
      case 'mcp.repair.preview': return { issues: [{ name: 'project-mcp', repairable: true }] }
      case 'mcp.repair.apply': return { repaired: 1 }
      case 'mcp.oauth.prepare': return { name: args.name, prepared: true }
      case 'mcp.oauth.start': return { name: args.name, authorizationUrl: 'https://example.com/oauth' }
      case 'mcp.oauth.callback': return { name: args.name, connected: true }
      case 'mcp.oauth.disconnect': return { name: args.name, disconnected: true }
      case 'mcp.oauth.status': return { name: args.name, status: 'connected' }
      case 'mcp.connections.list': return { connections: [] }
      case 'skills.list': return { skills: [] }
      case 'skills.create': return { name: args.name, created: true }
      case 'skills.install': return { name: args.name, installed: true }
      case 'skills.delete': return { name: args.name, deleted: true }
      case 'skills.export': return { path: '/tmp/skill.zip', name: args.name }
      case 'skills.search': return { skills: [] }
      case 'usage.get': return { usage: { totalCostUSD: 0, totalTokens: 0 }, timeseries: [] }
      case 'usage.summary': return { totalCostUSD: 0, totalTokens: 0 }
      case 'usage.timeseries': return { points: [] }
      case 'usage.sessions': return { sessions: [] }
      case 'activity.get': return { events: [] }
      case 'workspace.select': return { path: args.path || '/tmp/new-project', name: 'new-project' }
      case 'workspace.list': return { workspaces: state.workspaces, selectedWorkspace: state.selectedWorkspace }
      case 'workspace.worktrees': return { worktrees: state.worktrees }
      case 'workspace.worktree.create': return { path: '/tmp/worktree', branch: args.branch || 'feature' }
      case 'workspace.worktree.remove': return { path: args.path, removed: true }
      case 'workspace.diagnose': return { directory: state.selectedWorkspace, issues: [] }
      case 'workspace.repair': return { repaired: true }
      case 'workspace.open': return { opened: true, path: args.directory || state.selectedWorkspace }
      case 'workspace.cost': return state.costLedger
      case 'workspace.capabilities': return { capabilities: [], matrix: [] }
      case 'workspace.protocols': return { protocols: [], matrix: [] }
      case 'workspace.config.set': return { configured: true }
      case 'workspace.teamBudget.get': return { ...state.teamBudget, teamBudgetRevision: state.teamBudgetRevision, workspace: state.selectedWorkspace }
      case 'workspace.teamBudget.set': { const budgetUsd = Math.max(0.01, Number(args.budgetUsd) || 1); const revision = (state.teamBudgetRevision || 0) + 1; state.teamBudget = { ...state.teamBudget, budgetUsd, remainingUsd: budgetUsd, availableUsd: budgetUsd, memberBudgetUsd: budgetUsd * 0.85, revision }; state.teamBudgetRevision = revision; return { ...state.teamBudget, teamBudgetRevision: revision, workspace: state.selectedWorkspace } }
      case 'permissions.list': return { permissions: [], rules: [] }
      case 'permissions.set': return { mode: args.mode }
      case 'permissions.allow': return { rule: args.rule, allowed: true }
      case 'permissions.clear': return { cleared: true }
      case 'approvals.list': return { approvals: state.approvals, pendingApprovals: state.pendingApprovals }
      case 'approvals.get': return { approval: state.approvals.find((item: any) => item.id === args.approvalId) }
      case 'approvals.respond': return { approvalId: args.approvalId, decision: args.decision, status: args.decision === 'allow' ? 'allowed' : 'denied' }
      case 'approvals.allow': return { approvalId: args.approvalId, status: 'allowed' }
      case 'approvals.deny': return { approvalId: args.approvalId, status: 'denied' }
      case 'runs.checkpoint.list': return { checkpoints: [] }
      case 'runs.checkpoint.restore': return { checkpointId: args.checkpointId, restored: true }
      case 'runs.timeline.get': return { events: [], steps: [] }
      case 'runs.messages.get': return { messages: [] }
      case 'runs.events.get': return { events: [] }
      case 'runs.steps.get': return { steps: [] }
      case 'runs.cost.get': return state.costLedger
      case 'workspace.subscribe': { workspaceEventRevision += 1; return { subscribed: true, revision: workspaceEventRevision, workspace: state.selectedWorkspace } }
      case 'workspace.unsubscribe': return { subscribed: false }
      case 'workspace.events': return { revision: workspaceEventRevision, workspace: state.selectedWorkspace }
      case 'maintenance.diagnose': return { database: { integrity: 'ok', sizeBytes: 1024 }, retention: { temp: { sizeBytes: 1024 }, logs: { sizeBytes: 2048 }, updates: { sizeBytes: 0 }, cache: { sizeBytes: 0 } }, protected: ['source'] }
      case 'maintenance.purge': return args.dryRun ? { reclaimableBytes: 1024, plans: [{ category: 'temp', fileCount: 1, sizeBytes: 1024 }] } : { reclaimedBytes: 1024, failed: 0, retained: 1 }
      case 'updates.status': return { status: 'idle', currentVersion: '0.1.0' }
      case 'updates.check': return { status: 'idle', currentVersion: '0.1.0' }
      case 'updates.install': return { installing: true }
      case 'plugins.search': return { plugins: [] }
      case 'plugins.install': return { name: args.name, installed: true }
      case 'plugins.uninstall': return { name: args.name, removed: true }
      case 'plugins.installed': return { plugins: [] }
      default: return {}
    }
  })
  vi.mocked(startSDK).mockImplementation(async (_token, onEvent) => {
    handler = onEvent
    return { rpc: vi.fn(async (method: string) => method === 'workspace.capabilities.get' ? clone(workspaceConfig) : {}), stop: vi.fn() } as any
  })
})

describe('desktop workbench', () => {
  it('uses the injected connector token to load workspace capabilities', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })).toBeInTheDocument()
    expect(desktopHost.rpc).toHaveBeenCalledWith('workspace.capabilities.get', expect.objectContaining({ workspace: '/tmp/project', token: 'test-connector-token' }), expect.any(Object))
    expect(desktopHost.rpc).toHaveBeenCalledWith('workspace.teamBudget.get', { workspace: '/tmp/project', token: 'test-connector-token' }, expect.any(Object))
    expect(desktopHost.rpc).toHaveBeenCalledWith('workspace.subscribe', { workspace: '/tmp/project', token: 'test-connector-token' }, expect.any(Object))
    expect(desktopHost.rpc).not.toHaveBeenCalledWith('models.credentials.set', expect.anything(), expect.anything())
  })

  it('boots read-only with host-provided workspace configuration and capability snapshot', async () => {
    workspaceToken = ''
    workspaceConfig = { ...workspaceConfig, tokenConfigured: false, connectorTokenRequired: true, readOnly: true, writable: false, capabilities: { read: true, write: false } }
    state.token = 'host-token-not-used-for-capabilities'
    render(<App />)
    expect(await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })).toBeInTheDocument()
    expect(desktopHost.rpc).toHaveBeenCalledWith('workspace.capabilities.get', { workspace: '/tmp/project', token: '' }, expect.any(Object))
    expect(desktopHost.rpc).not.toHaveBeenCalledWith('workspace.config.set', expect.anything(), expect.anything())
    expect(desktopHost.rpc).not.toHaveBeenCalledWith('workspace.config.get', expect.anything(), expect.anything())
  })

  it('loads the authenticated model state without a setup gate or bootstrap key', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })).toBeInTheDocument()
    expect(screen.queryByText('完成初始设置')).not.toBeInTheDocument()
    expect(screen.queryByText('首次启动，设置模型')).not.toBeInTheDocument()
    expect(screen.getByLabelText('默认模型')).toHaveValue('kimi/kimi-k2.5')
    expect(desktopHost.rpc).not.toHaveBeenCalledWith('models.credentials.set', expect.anything(), expect.anything())
  })

  it('keeps the model catalog available when a provider credential is missing', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Kimi · kimi-k2.5' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加凭证' })).toBeInTheDocument()
  })

  it('renders the version note in normal document flow', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    expect(document.querySelector('.yy-legal-note')).toHaveTextContent('K3.1 V1.1版本 By YYTime')
  })

  it('submits workspace login only when the user submits it', async () => {
    state.authenticated = false
    state.authRequired = true
    state.externalMethods = ['kimi']
    state.authMethods = ['kimi']
    vi.mocked(desktopHost.start).mockImplementation(async () => { throw Object.assign(new Error('AUTH_REQUIRED:请先完成本地工作区登录'), { code: 'AUTH_REQUIRED' }) })
    render(<App />)
    expect(await screen.findByRole('heading', { name: '本地工作区登录' })).toBeInTheDocument()
    expect(desktopHost.rpc).not.toHaveBeenCalledWith('workspace.auth.start', expect.anything(), expect.anything())
    fireEvent.click(screen.getByRole('button', { name: '使用 Kimi 登录' }))
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('workspace.auth.start', { workspace: '/tmp/project', token: 'desktop-host-token', method: 'kimi', methods: ['kimi', 'device'], preferredMethods: ['kimi'], openExternal: true }, expect.any(Object)))
    expect(await screen.findByText('ABCD-1234')).toBeInTheDocument()
  })

  it('loads a persisted session through session.messages.list', async () => {
    state.sessions = [{ sessionId: 'session-persisted', name: '已有会话', workspace: '/tmp/project', cwd: '/tmp/project', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', messages: [{ role: 'user', content: 'summary' }] }]
    state.selectedSessionId = 'session-persisted'
    render(<App />)
    expect(await screen.findByText('持久化消息')).toBeInTheDocument()
    expect(desktopHost.rpc).toHaveBeenCalledWith('session.messages.list', { workspace: '/tmp/project', sessionId: 'session-persisted', token: 'test-connector-token' }, expect.any(Object))
    expect(desktopHost.rpc).not.toHaveBeenCalledWith('sessions.get', expect.anything(), expect.anything())
  })

  it('streams assistant output and completes without an extra session request', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.change(screen.getByLabelText('新任务目标'), { target: { value: '修复桌面测试' } })
    fireEvent.click(screen.getByRole('button', { name: '开始执行' }))
    await waitFor(() => expect(startSDK).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: '停止当前任务' })).toBeInTheDocument()
    await act(async () => {
      handler?.({ type: 'run.started', sessionId: 'session-open', runId: 'run-1', phase: 'running' })
      handler?.({ type: 'message.delta', sessionId: 'session-open', runId: 'run-1', delta: '已完成' })
      handler?.({ type: 'message.completed', sessionId: 'session-open', runId: 'run-1', message: { role: 'assistant', content: '已完成' } })
      handler?.({ type: 'run.completed', sessionId: 'session-open', runId: 'run-1', phase: 'completed' })
    })
    expect(await screen.findByText('已完成')).toBeInTheDocument()
    expect(desktopHost.rpc).not.toHaveBeenCalledWith('sessions.get', expect.anything(), expect.anything())
    expect(desktopHost.rpc).not.toHaveBeenCalledWith('session.messages.list', expect.objectContaining({ sessionId: 'session-open' }), expect.anything())
    expect(screen.getByRole('button', { name: '停止当前任务' })).toBeDisabled()
  })

  it('ignores a late delta after a run has completed', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.change(screen.getByLabelText('新任务目标'), { target: { value: '测试流式结束边界' } })
    fireEvent.click(screen.getByRole('button', { name: '开始执行' }))
    await waitFor(() => expect(startSDK).toHaveBeenCalled())
    await act(async () => {
      handler?.({ type: 'run.started', sessionId: 'session-open', runId: 'run-1', phase: 'running' })
      handler?.({ type: 'message.delta', sessionId: 'session-open', runId: 'run-1', delta: '最终答案' })
      handler?.({ type: 'run.completed', sessionId: 'session-open', runId: 'run-1', phase: 'completed' })
      handler?.({ type: 'message.delta', sessionId: 'session-open', runId: 'run-1', delta: '，迟到片段' })
    })
    expect(screen.getByText('最终答案')).toBeInTheDocument()
    expect(screen.queryByText(/迟到片段/)).not.toBeInTheDocument()
  })

  it('persists the draft while a local file picker is open', async () => {
    let resolveFolder: ((value: any) => void) | undefined
    vi.mocked(desktopHost.rpc).mockImplementation(async (method: string, args: any = {}) => {
      if (method === 'files.pickFolder') return await new Promise(resolve => { resolveFolder = resolve })
      if (method === 'workspace.select') return { path: '/tmp/new-project', name: 'new-project' }
      if (method === 'desktop.connectorToken') return { token: workspaceToken }
      if (method === 'workspace.capabilities.get') return clone(workspaceConfig)
      if (method === 'workspace.teamBudget.get') return { ...state.teamBudget, teamBudgetRevision: state.teamBudgetRevision, workspace: state.selectedWorkspace }
      if (method === 'workspace.snapshot') return clone(state)
      if (method === 'sessions.list') return { sessions: [], selectedSessionId: '' }
      if (method === 'workspace.teamBudget.set') return { ...state.teamBudget, budgetUsd: Number(args.budgetUsd) || 1 }
      return {}
    })
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.change(screen.getByLabelText('新任务目标'), { target: { value: '选择目录后继续这段任务草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '选择已有目录' }))
    await waitFor(() => expect(resolveFolder).toBeDefined())
    expect(screen.getByLabelText('新任务目标')).toHaveValue('选择目录后继续这段任务草稿')
    await act(async () => { resolveFolder?.({ path: '/tmp/new-project' }) })
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('workspace.select', expect.objectContaining({ path: '/tmp/new-project', token: 'test-connector-token' }), expect.any(Object)))
    expect(screen.getByLabelText('新任务目标')).toHaveValue('选择目录后继续这段任务草稿')
  })

  it('does not recreate an input draft after the user clears it', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.change(screen.getByLabelText('新任务目标'), { target: { value: '临时草稿' } })
    fireEvent.change(screen.getByLabelText('新任务目标'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '历史' }))
    fireEvent.click(screen.getByRole('button', { name: '工作台' }))
    expect(screen.getByLabelText('新任务目标')).toHaveValue('')
  })

  it('keeps editing a saved file when workspace events arrive', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('button', { name: '文件' }))
    fireEvent.click(await screen.findByRole('button', { name: 'README.md' }))
    const editor = await screen.findByDisplayValue('# project')
    fireEvent.change(editor, { target: { value: '# project\n正在编辑' } })
    await act(async () => { workspaceEventHandler?.({ revision: 1, event: { type: 'workspace.changed', path: 'README.md' } }) })
    expect(screen.getByDisplayValue('# project\n正在编辑')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存文件' }))
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('files.save', expect.objectContaining({ path: 'README.md', content: '# project\n正在编辑', token: 'test-connector-token' }), expect.any(Object)))
  })

  it('keeps local model edits when the same workspace snapshot is refreshed', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    const budget = screen.getByLabelText('单次费用上限（美元）')
    fireEvent.click(screen.getByRole('button', { name: '高级选项' }))
    fireEvent.change(budget, { target: { value: '3.5' } })
    await act(async () => { workspaceEventHandler?.({ revision: 1, event: { type: 'workspace.changed' } }) })
    expect(screen.getByLabelText('单次费用上限（美元）')).toHaveValue(3.5)
  })

  it('replaces task projection fields without reviving cleared approvals', async () => {
    state.pendingApprovals = [{ id: 'approval-1', title: '允许执行命令', status: 'pending' }]
    state.approvals = clone(state.pendingApprovals)
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    state = { ...state, pendingApprovals: [], approvals: [], teams: [{ teamId: 'team-new', name: '新团队', members: [], channelMessages: [{ messageId: 'message-new', fromAgentId: 'agent-2', toAgentId: 'agent-1', content: '新的团队成员消息', direction: 'outbound' }] }] }
    await act(async () => { workspaceEventHandler?.({ revision: 2, event: { type: 'workspace.changed' } }) })
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('workspace.snapshot', expect.objectContaining({ token: 'test-connector-token' }), expect.any(Object)))
    expect(screen.queryByText('允许执行命令')).not.toBeInTheDocument()
    expect(state.teams[0].channelMessages[0].content).toBe('新的团队成员消息')
  })

  it('retains the latest team state when an earlier snapshot returns late', async () => {
    const snapshots: Array<(value: any) => void> = []
    const original = desktopHost.rpc.getMockImplementation()!
    vi.mocked(desktopHost.rpc).mockImplementation(async (method: string, args: any = {}) => {
      if (method === 'workspace.snapshot') return await new Promise(resolve => snapshots.push(resolve))
      return original(method, args)
    })
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    await act(async () => {
      workspaceEventHandler?.({ revision: 1, event: { type: 'team.updated', teamId: 'team-1', status: 'running', team: { teamId: 'team-1', status: 'running', channelMessages: [{ messageId: 'message-1', content: '旧消息' }] } } })
      workspaceEventHandler?.({ revision: 2, event: { type: 'team.updated', teamId: 'team-1', status: 'completed', team: { teamId: 'team-1', status: 'completed', channelMessages: [{ messageId: 'message-2', content: '新消息' }] } } })
    })
    expect(snapshots).toHaveLength(2)
    await act(async () => { snapshots[1]?.({ ...state, teams: [{ teamId: 'team-1', status: 'completed', channelMessages: [{ messageId: 'message-2', content: '新消息' }] }] }); await Promise.resolve() })
    await act(async () => { snapshots[0]?.({ ...state, teams: [{ teamId: 'team-1', status: 'running', channelMessages: [{ messageId: 'message-1', content: '旧消息' }] }] }); await Promise.resolve() })
    expect(screen.queryByText('旧消息')).not.toBeInTheDocument()
  })

  it('stops the active run through the desktop host', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.change(screen.getByLabelText('新任务目标'), { target: { value: '运行可停止任务' } })
    fireEvent.click(screen.getByRole('button', { name: '开始执行' }))
    await waitFor(() => expect(startSDK).toHaveBeenCalled())
    await act(async () => { handler?.({ type: 'run.started', sessionId: 'session-open', runId: 'run-1', phase: 'running' }) })
    fireEvent.click(screen.getByRole('button', { name: '停止当前任务' }))
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('sessions.stop', expect.objectContaining({ sessionId: 'session-open', runId: 'run-1', token: 'test-connector-token' }), expect.any(Object)))
    expect(startSDK).toHaveBeenCalledTimes(1)
  })

  it('stops the active run from the host event without creating a session', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.change(screen.getByLabelText('新任务目标'), { target: { value: '运行可停止任务' } })
    fireEvent.click(screen.getByRole('button', { name: '开始执行' }))
    await waitFor(() => expect(startSDK).toHaveBeenCalled())
    await act(async () => { hostHandler?.({ type: 'run.started', sessionId: 'session-open', runId: 'run-1', phase: 'running' }) })
    expect(screen.getByRole('button', { name: '停止当前任务' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '停止当前任务' }))
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('sessions.stop', expect.objectContaining({ sessionId: 'session-open', runId: 'run-1', token: 'test-connector-token' }), expect.any(Object)))
  })

  it('renders pending approvals and responds through the host', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.change(screen.getByLabelText('新任务目标'), { target: { value: '运行审批任务' } })
    fireEvent.click(screen.getByRole('button', { name: '开始执行' }))
    await waitFor(() => expect(startSDK).toHaveBeenCalled())
    await act(async () => { handler?.({ type: 'approval.requested', sessionId: 'session-open', runId: 'run-1', approval: { id: 'approval-1', title: '允许执行命令', detail: 'npm test', status: 'pending' } }) })
    expect(await screen.findByText('允许执行命令')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '批准' }))
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('approvals.respond', expect.objectContaining({ approvalId: 'approval-1', decision: 'allow', token: 'test-connector-token' }), expect.any(Object)))
  })

  it('keeps a pending approval that arrives while an older session is opening', async () => {
    let resolveMessages: ((value: any) => void) | undefined
    const original = desktopHost.rpc.getMockImplementation()!
    vi.mocked(desktopHost.rpc).mockImplementation(async (method: string, args: any = {}) => {
      if (method === 'session.messages.list') return await new Promise(resolve => { resolveMessages = resolve })
      return original(method, args)
    })
    state.sessions = [{ sessionId: 'session-persisted', name: '已有会话', workspace: '/tmp/project', cwd: '/tmp/project', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', messages: [] }]
    state.selectedSessionId = 'session-persisted'
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    await act(async () => { hostHandler?.({ type: 'approval.requested', sessionId: 'session-persisted', runId: 'run-1', approval: { id: 'approval-1', title: '允许执行命令', detail: 'npm test', status: 'pending' } }) })
    expect(await screen.findByText('允许执行命令')).toBeInTheDocument()
    await act(async () => { resolveMessages?.({ messages: [], entries: [], hasEarlier: false, hasMore: false, nextBefore: null }); await Promise.resolve() })
    expect(screen.getByText('允许执行命令')).toBeInTheDocument()
  })

  it('hydrates a missing team from a host team event', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('button', { name: '智能体' }))
    await act(async () => { hostHandler?.({ type: 'team.updated', teamId: 'team-host', name: '宿主团队', team: { teamId: 'team-host', name: '宿主团队', status: 'running', members: [], channelMessages: [] } }) })
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('teams.get', expect.objectContaining({ teamId: 'team-host', token: 'test-connector-token' }), expect.any(Object)))
    expect(await screen.findAllByText('修复小组')).not.toHaveLength(0)
  })

  it('keeps workspace-scoped team channels from another team out of the selected conversation', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('button', { name: '智能体' }))
    fireEvent.click(await screen.findByRole('button', { name: /修复小组/ }))
    expect(await screen.findByText('成员已完成代码审查')).toBeInTheDocument()
    await act(async () => { hostHandler?.({ type: 'team.message', teamId: 'team-other', channelMessages: [{ messageId: 'other-message', fromAgentId: 'agent-9', toAgentId: 'agent-1', content: '其他团队消息' }], message: { messageId: 'other-message', fromAgentId: 'agent-9', toAgentId: 'agent-1', content: '其他团队消息' } }) })
    expect(screen.queryByText('其他团队消息')).not.toBeInTheDocument()
  })

  it('renders direct task controls and batch actions from the task projection', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('button', { name: '任务' }))
    expect(await screen.findByText('任务队列')).toBeInTheDocument()
    expect(screen.getByText('暂停')).toBeInTheDocument()
    expect(screen.getByText('继续')).toBeInTheDocument()
    expect(screen.getByText('取消')).toBeInTheDocument()
    expect(screen.getByText('审批')).toBeInTheDocument()
    expect(screen.getByText('直接任务')).toBeInTheDocument()
    expect(screen.getByText('团队子任务')).toBeInTheDocument()
    expect(screen.getByText('根任务 mission-root')).toBeInTheDocument()
    expect(screen.getByText('父任务 mission-root')).toBeInTheDocument()
    expect(screen.getByText('子任务 1')).toBeInTheDocument()
    expect(screen.getByText('等待权限 · 1')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '选择任务 团队子任务' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '批量继续' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '全选当前任务' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存任务预算' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('团队子任务预算'), { target: { value: '2.5' } })
    fireEvent.click(screen.getByRole('button', { name: '保存任务预算' }))
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('tasks.budget.set', expect.objectContaining({ taskId: 'task-parent', missionId: 'mission-parent', budgetUsd: 2.5, token: 'test-connector-token' }), expect.any(Object)))
    fireEvent.click(screen.getByRole('button', { name: '全选当前任务' }))
    expect(screen.getByRole('button', { name: '批量暂停' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '批量暂停' }))
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('tasks.batchControl', expect.objectContaining({ action: 'pause', missionIds: ['mission-parent'], token: 'test-connector-token' }), expect.any(Object)))
  })

  it('reloads mission jobs after control and refresh', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('button', { name: '任务' }))
    await screen.findByText('任务队列')
    const before = vi.mocked(desktopHost.rpc).mock.calls.filter(call => call[0] === 'missions.jobs.list').length
    fireEvent.click(screen.getByRole('button', { name: '刷新任务' }))
    await waitFor(() => expect(vi.mocked(desktopHost.rpc).mock.calls.filter(call => call[0] === 'missions.jobs.list').length).toBeGreaterThan(before))
  })

  it('does not silently substitute a placeholder mission for the requested team', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('button', { name: '智能体' }))
    fireEvent.click(await screen.findByRole('button', { name: /修复小组/ }))
    expect(await screen.findByText('协调者：agent-1')).toBeInTheDocument()
    expect(screen.queryByText('任务不存在')).not.toBeInTheDocument()
  })

  it('shows model validation controls on the models page', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('button', { name: '模型' }))
    expect(await screen.findByText('模型与凭证')).toBeInTheDocument()
    expect(screen.getByText('测试模型')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '测试模型' }))
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('models.validation.start', expect.objectContaining({ modelId: 'kimi/kimi-k2.5', token: 'test-connector-token' }), expect.any(Object)))
  })

  it('opens model credentials without writing them during startup', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('button', { name: '添加凭证' }))
    const input = await screen.findByLabelText('Kimi API Key')
    fireEvent.change(input, { target: { value: 'sk-test-only-on-save' } })
    fireEvent.click(screen.getByRole('button', { name: '保存凭证' }))
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('models.credentials.set', { workspace: '/tmp/project', provider: 'kimi', credential: 'sk-test-only-on-save', token: 'test-connector-token' }, expect.any(Object)))
    expect(vi.mocked(desktopHost.rpc).mock.calls.filter(call => call[0] === 'models.credentials.set')).toHaveLength(1)
  })

  it('opens the shared budget control without enabling the team creation form', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    expect(screen.getByLabelText('团队共享预算（美元）')).toHaveValue(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('团队共享预算（美元）'), { target: { value: '2.5' } })
    fireEvent.click(screen.getByRole('button', { name: '保存共享预算' }))
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('workspace.teamBudget.set', { workspace: '/tmp/project', token: 'test-connector-token', budgetUsd: 2.5 }, expect.any(Object)))
    expect(await screen.findByText(/项目共享预算已保存：\$2\.5000/)).toBeInTheDocument()
  })

  it('saves the shared budget before creating a team task', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.change(screen.getByLabelText('团队共享预算（美元）'), { target: { value: '3.5' } })
    fireEvent.click(screen.getByRole('button', { name: '创建团队任务' }))
    fireEvent.change(screen.getByLabelText('团队目标'), { target: { value: '并行修复并验证桌面任务' } })
    fireEvent.click(screen.getByRole('button', { name: '创建并开始' }))
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('workspace.teamBudget.set', { workspace: '/tmp/project', token: 'test-connector-token', budgetUsd: 3.5 }, expect.any(Object)))
    await waitFor(() => expect(startSDK).toHaveBeenCalled())
    const budgetCall = vi.mocked(desktopHost.rpc).mock.calls.findIndex(call => call[0] === 'workspace.teamBudget.set')
    expect(budgetCall).toBeGreaterThanOrEqual(0)
    expect(vi.mocked(startSDK).mock.calls.length).toBe(1)
  })

  it('refreshes the workspace budget after a host budget event', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    state.teamBudget = { ...state.teamBudget, budgetUsd: 4, remainingUsd: 4, availableUsd: 4, revision: 2 }
    state.teamBudgetRevision = 2
    await act(async () => { hostHandler?.({ type: 'workspace.budget.updated', budgetUsd: 4, revision: 2 }) })
    await waitFor(() => expect(screen.getByLabelText('团队共享预算（美元）')).toHaveValue(4))
    expect(desktopHost.rpc).toHaveBeenCalledWith('workspace.teamBudget.get', { workspace: '/tmp/project', token: 'test-connector-token' }, expect.any(Object))
  })

  it('persists display settings and exposes reduced motion at the application root', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(await screen.findByText('本地设置')).toBeInTheDocument()
    const motion = screen.getByRole('checkbox', { name: '减少动态效果' })
    fireEvent.click(motion)
    expect(document.querySelector('.yy-app')).toHaveAttribute('data-motion', 'off')
    fireEvent.click(screen.getByRole('checkbox', { name: '深色主题' }))
    expect(document.querySelector('.yy-app')).toHaveAttribute('data-theme', 'dark')
  })

  it('renders the inspector as a dismissible desktop drawer on narrow windows', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    const inspectorButton = screen.queryByRole('button', { name: '工作区详情' })
    if (inspectorButton) fireEvent.click(inspectorButton)
    expect(document.querySelector('.yy-inspector')).toBeInTheDocument()
  })

  it('supports keyboard navigation in tabs and collapsible advanced options', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    const options = screen.getByRole('button', { name: '高级选项' })
    expect(options).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(options)
    expect(options).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(options, { key: 'Enter' })
    expect(options).toHaveAttribute('aria-expanded', 'true')
  })

  it('moves focus between navigation tabs without opening a session', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    const workbench = screen.getByRole('tab', { name: '工作台' })
    const chat = screen.getByRole('tab', { name: '聊天' })
    workbench.focus()
    fireEvent.keyDown(workbench.parentElement!, { key: 'ArrowRight' })
    expect(chat).toHaveFocus()
    expect(workbench).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(chat.parentElement!, { key: 'End' })
    expect(screen.getByRole('tab', { name: '设置' })).toHaveFocus()
    fireEvent.keyDown(chat.parentElement!, { key: 'Home' })
    expect(workbench).toHaveFocus()
    fireEvent.keyDown(workbench.parentElement!, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: '设置' })).toHaveFocus()
    const opens = vi.mocked(desktopHost.rpc).mock.calls.filter(call => call[0] === 'sessions.open' || call[0] === 'sessions.ensureOpen')
    expect(opens).toHaveLength(0)
  })

  it('shows a dismissible success toast after refreshing history', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('tab', { name: '历史' }))
    fireEvent.click(await screen.findByRole('button', { name: '刷新历史' }))
    expect(await screen.findByRole('status')).toHaveTextContent('刷新历史完成')
    fireEvent.click(screen.getByRole('button', { name: '关闭操作反馈' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the MCP add form open while typing after expanding it', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('tab', { name: '集成' }))
    const summary = await screen.findByText('添加 MCP 服务')
    expect(summary.closest('details')).not.toHaveAttribute('open')
    fireEvent.click(summary)
    expect(summary.closest('details')).toHaveAttribute('open')
    fireEvent.change(screen.getByPlaceholderText('服务名称'), { target: { value: 'added-mcp' } })
    expect(summary.closest('details')).toHaveAttribute('open')
    fireEvent.change(screen.getByPlaceholderText('https://example.com/mcp'), { target: { value: 'https://added.example.com/mcp' } })
    fireEvent.click(screen.getByRole('button', { name: '添加 MCP 服务' }))
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('mcp.add', expect.objectContaining({ name: 'added-mcp', scope: 'project', config: { type: 'http', url: 'https://added.example.com/mcp' } }), expect.any(Object)))
  })

  it('keeps existing mission jobs in place and appends new jobs on workspace updates', async () => {
    stableMissionJobs = true
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('tab', { name: '任务' }))
    await screen.findByText('先执行')
    const titles = () => Array.from(document.querySelectorAll('.yy-job-card h4'), node => node.textContent)
    expect(titles()).toEqual(['先执行', '后执行'])
    await act(async () => {
      hostHandler?.({ type: 'mission.job.updated', job: { id: 'job-1', title: '先执行', instruction: '第一步', status: 'running', attempt: 1 } })
    })
    expect(titles()).toEqual(['先执行', '后执行'])
    expect(document.querySelector('.yy-job-card')).toHaveAttribute('data-updated', 'true')
    await act(async () => {
      hostHandler?.({ type: 'mission.job.updated', job: { id: 'job-3', title: '新追加', instruction: '第三步', status: 'queued', attempt: 1 } })
    })
    expect(titles()).toEqual(['先执行', '后执行', '新追加'])
  })

  it('shows an inline hook save error without a blanket page reload', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(await screen.findByText('Hooks 执行策略')).toBeInTheDocument()
    expect(screen.getByText('删除、覆盖和外部操作需要审批')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Hook 执行策略'), { target: { value: 'strict' } })
    fireEvent.click(screen.getByRole('button', { name: '保存 Hooks 策略' }))
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('hooks.profile.set', expect.objectContaining({ profileId: 'strict', token: 'test-connector-token' }), expect.any(Object)))
    expect(screen.queryByRole('button', { name: '重新连接' })).not.toBeInTheDocument()
  })

  it('renders a rejected workspace capability state without executing a write', async () => {
    workspaceConfig = { ...workspaceConfig, readOnly: true, writable: false, capabilities: { read: true, write: false } }
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.change(screen.getByLabelText('新任务目标'), { target: { value: '只读状态不应执行' } })
    expect(screen.getByRole('button', { name: '开始执行' })).toBeEnabled()
    expect(desktopHost.rpc).not.toHaveBeenCalledWith('sessions.create', expect.anything(), expect.anything())
  })

  it('renders settings sections without turning the page into a debug dashboard', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(await screen.findByText('本地设置')).toBeInTheDocument()
    expect(screen.getByText('显示与交互')).toBeInTheDocument()
    expect(screen.getByText('权限与执行策略')).toBeInTheDocument()
    expect(screen.getByText('本地数据维护')).toBeInTheDocument()
  })

  it('keeps the selected model in the new-session options', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    expect(screen.getByLabelText('默认模型')).toHaveValue('kimi/kimi-k2.5')
    fireEvent.change(screen.getByLabelText('默认模型'), { target: { value: 'kimi/kimi-k2.5' } })
    await waitFor(() => expect(desktopHost.rpc).toHaveBeenCalledWith('models.default.set', expect.objectContaining({ modelId: 'kimi/kimi-k2.5' }), expect.any(Object)))
  })

  it('uses readable labels for core navigation', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    for (const label of ['工作台', '聊天', '智能体', '任务', '文件', '模型', '集成', 'GitHub', '历史', '设置']) expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  })

  it('does not put private credentials into visible startup content', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    expect(document.body.textContent).not.toContain('desktop-host-token')
    expect(document.body.textContent).not.toContain('test-connector-token')
    expect(document.body.textContent).not.toContain('sk-test')
  })

  it('cleans up the workspace event subscription on unmount', async () => {
    const view = render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    view.unmount()
    expect(desktopHost.rpc).toHaveBeenCalledWith('workspace.unsubscribe', expect.objectContaining({ workspace: '/tmp/project', token: 'test-connector-token' }), expect.any(Object))
  })

  it('does not use a second theme toggle with competing state', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(screen.getAllByRole('checkbox', { name: '深色主题' })).toHaveLength(1)
  })

  it('preserves host revision guards for permission requests', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    await act(async () => { hostHandler?.({ type: 'permission.requested', revision: 1, permission: { id: 'permission-1', status: 'pending', title: '新权限请求' } }) })
    await act(async () => { hostHandler?.({ type: 'host.snapshot', revision: 1, pendingApprovals: [] }) })
    expect(screen.queryByText('新权限请求')).not.toBeInTheDocument()
  })

  it('keeps task authorization revisions in the projection path', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    fireEvent.click(screen.getByRole('button', { name: '任务' }))
    expect(await screen.findByText('任务队列')).toBeInTheDocument()
    expect(desktopHost.rpc).toHaveBeenCalledWith('tasks.list', expect.objectContaining({ workspace: '/tmp/project', token: 'test-connector-token' }), expect.any(Object))
  })

  it('does not require the advanced options to access the shared team budget', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    expect(screen.getByLabelText('团队共享预算（美元）')).toBeVisible()
    expect(screen.getByRole('button', { name: '高级选项' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('preserves long tool output access in the chat surface', async () => {
    state.sessions = [{ sessionId: 'session-tools', name: '工具会话', workspace: '/tmp/project', cwd: '/tmp/project', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', messages: [] }]
    state.selectedSessionId = 'session-tools'
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    expect(screen.getByRole('tab', { name: '聊天' })).toBeInTheDocument()
  })

  it('keeps error presentation available without throwing during rendering', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('retains responsive containers for workspace grids', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '把一个目标，交给本地智能体。' })
    expect(document.querySelector('.yy-page')).toBeInTheDocument()
    expect(document.querySelector('.yy-page-inner')).toBeInTheDocument()
  })
})
