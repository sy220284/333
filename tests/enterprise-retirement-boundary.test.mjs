import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, join, extname, relative } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const src = join(root, 'src')
const liveSource = new Set(['.ts', '.tsx', '.js', '.mjs', '.mts', '.jsx', '.cjs'])
const forbiddenPaths = [
  'src/cli/gateway',
  'src/cli/selfHostedRunner',
  'src/services/policyLimits',
  'src/services/remoteManagedSettings',
  'src/services/api/adminRequests.ts',
  'src/services/mcp/claudeai.ts',
  'src/tools/RemoteTriggerTool',
  'src/skills/bundled/scheduleRemoteAgents.ts',
  '.github/workflows/m6-gateway-providers-317.yml',
  '.github/workflows/m6-self-hosted-runner-317.yml',
]
const forbiddenImports = [
  /(?:cli\/gateway\/|cli\/selfHostedRunner\/)/,
  /(?:services\/policyLimits\/|services\/remoteManagedSettings\/)/,
  /(?:services\/api\/adminRequests(?:\.|['"]))/,
  /(?:tools\/RemoteTriggerTool\/|bundled\/scheduleRemoteAgents)/,
]
const forbiddenEndpointFragments = [
  '/api/claude_code/settings',
  '/api/claude_code/policy_limits',
  '/admin_requests',
]

function collect(rootDir) {
  const files = []
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && liveSource.has(extname(path))) files.push(path)
    }
  }
  walk(rootDir)
  return files
}

test('企业服务端、云端策略、组织管理员与官方远程智能体入口均已退役', () => {
  for (const path of forbiddenPaths) {
    assert.equal(existsSync(join(root, path)), false, '仍存在企业模块：' + path)
  }
  const main = readFileSync(join(src, 'main.tsx'), 'utf8').split('//# sourceMappingURL=')[0]
  const tools = readFileSync(join(src, 'tools.ts'), 'utf8').split('//# sourceMappingURL=')[0]
  assert.doesNotMatch(main, /\.command\(['"]gateway['"]\)/)
  assert.doesNotMatch(tools, /selfHostedRunnerWizardTools|RemoteTriggerTool/)
})

test('个人版生产源码没有引用已退役企业模块或官方企业配置端点', () => {
  const files = collect(src)
  assert.ok(files.length > 1000, '生产源码扫描覆盖量异常')
  for (const file of files) {
    const content = readFileSync(file, 'utf8').split('//# sourceMappingURL=')[0]
    const path = relative(root, file)
    for (const pattern of forbiddenImports)
      assert.doesNotMatch(content, pattern, path + ' 引用退役模块')
    for (const endpoint of forbiddenEndpointFragments)
      assert.equal(content.includes(endpoint), false, path + ' 仍包含官方企业接口 ' + endpoint)
  }
})

test('个人版保留多模型、费用计量、本地任务、权限和诊断的正式源码', () => {
  for (const path of [
    'src/services/api/multimodel/registry.ts',
    'src/services/api/multimodel/pricing.ts',
    'src/utils/modelCost.ts',
    'src/services/agentCenter/missionJobs.ts',
    'src/services/conversation/toolAuthorization.ts',
    'src/services/analytics/localDiagnostics.ts',
    'src/services/desktop/gateway.ts',
  ]) {
    assert.ok(existsSync(join(root, path)), '个人版能力不应随企业模块消失：' + path)
  }
})

test('待分配清单严格排除个人多设备执行池，保留五项可复用能力', () => {
  const tasks = JSON.parse(readFileSync(join(root, 'docs/features/personal-capability-extraction-backlog.json'), 'utf8')).tasks
  assert.deepEqual(tasks.map(task => task.id), [
    'PERSONAL-001', 'PERSONAL-002', 'PERSONAL-003', 'PERSONAL-005', 'PERSONAL-006',
  ])
  const doc = readFileSync(join(root, 'docs/features/personal-capability-extraction-backlog.zh-CN.md'), 'utf8')
  assert.doesNotMatch(doc, /PERSONAL-004|个人多设备任务执行池|自有机器执行池/)
  assert.equal(tasks.some(task => /多设备|Runner/.test(task.title)), false)
})

test('个人 MCP 仅使用自身配置，组织专属 MCP 代理及独占配置不会再被接入', () => {
  const paths = [
    'src/services/mcp/config.ts',
    'src/services/mcp/types.ts',
    'src/services/mcp/utils.ts',
    'src/services/mcp/client.ts',
    'src/services/mcp/useManageMCPConnections.ts',
    'src/cli/handlers/mcpAuth.ts',
    'src/components/mcp/MCPSettings.tsx',
    'src/commands/plugin/ManagePlugins.tsx',
  ]
  const patterns = [
    /doesEnterpriseMcpConfigExist|getEnterpriseMcpFilePath|managed-mcp\.json/,
    /claudeai-proxy|McpClaudeAIProxyServerConfig/,
    /fetchClaudeAIMcpConfigsIfEligible|createClaudeAiProxyFetch/,
    /api\/organizations\/.*mcp\/start-auth/,
  ]
  for (const path of paths) {
    const content = readFileSync(join(root, path), 'utf8').split('//# sourceMappingURL=')[0]
    for (const pattern of patterns) assert.doesNotMatch(content, pattern, path)
  }
  const code = readFileSync(join(root, 'src/services/mcp/config.ts'), 'utf8')
  assert.match(code, /getMcpConfigsByScope\('user'\)/)
  assert.match(code, /getMcpConfigsByScope\('project'\)/)
  assert.match(code, /getMcpConfigsByScope\('local'\)/)
})
