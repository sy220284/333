import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
function source(path) { return readFileSync(resolve(root, path), 'utf8') }

const retiredModules = {
  'src/main.tsx': [
    'assistant/index.js', 'assistant/gate.js', 'ssh/createSSHSession.js',
    'server/parseConnectUrl.js', 'server/server.js', 'server/sessionManager.js',
    'server/backends/dangerousBackend.js', 'server/serverBanner.js',
    'server/serverLog.js', 'server/lockfile.js', 'server/connectHeadless.js',
    'utils/ccshareResume.js',
  ],
  'src/bridge/initReplBridge.ts': ['assistant/index.js'],
  'src/commands/bridge/bridge.tsx': ['assistant/index.js'],
  'src/hooks/useReplBridge.tsx': ['assistant/index.js', 'bridge/webhookSanitizer.js'],
  'src/components/messages/UserTextMessage.tsx': [
    'UserGitHubWebhookMessage.js', 'UserForkBoilerplateMessage.js',
    'UserCrossSessionMessage.js',
  ],
  'src/components/permissions/PermissionRequest.tsx': [
    'ReviewArtifactTool/ReviewArtifactTool.js', 'ReviewArtifactPermissionRequest.js',
  ],
  'src/entrypoints/cli.tsx': [
    'daemon/workerRegistry.js', 'daemon/main.js', 'cli/bg.js',
    'environment-runner/main.js', 'self-hosted-runner/main.js',
  ],
  'src/screens/REPL.tsx': ['ssh/createSSHSession.js', 'useSSHSession.js', 'WebBrowserPanel.js'],
  'src/utils/attachments.ts': ['sessionTranscript/sessionTranscript.js'],
}

test('no runtime reference remains to release-retired private modules', () => {
  for (const [path, imports] of Object.entries(retiredModules)) {
    const data = source(path).split('//# sourceMappingURL=')[0]
    for (const name of imports) {
      assert.ok(!data.includes(name), `${path}: retired import remains: ${name}`)
    }
  }
})

test('retiring private launchers keeps public 2.1.310 remote, session, tools and permissions', () => {
  const main = source('src/main.tsx')
  const bridge = source('src/bridge/initReplBridge.ts')
  const repl = source('src/screens/REPL.tsx')
  const permissions = source('src/components/permissions/PermissionRequest.tsx')
  const command = source('src/entrypoints/cli.tsx')
  assert.match(main, /getRemoteControlAtStartup\(\)/)
  assert.match(main, /loadTranscriptFromFile\(resolvedPath\)/)
  assert.match(main, /teleportToRemoteWithErrorHandling/)
  assert.match(bridge, /initBridgeCore\(/)
  assert.match(repl, /useRemoteSession\(/)
  assert.match(permissions, /case WorkflowTool:/)
  assert.match(permissions, /case MonitorTool:/)
  assert.match(command, /bridgeMain\(args\.slice\(1\)\)/)
})

test('retired SSH UI implementation removed with its imports', () => {
  assert.equal(existsSync(resolve(root, 'src/hooks/useSSHSession.ts')), false)
  assert.equal(existsSync(resolve(root, 'src/ssh/SSHSessionManager.ts')), false)
})

test('public background session parity remains independent from removed private BG dispatch', () => {
  const cli = source('src/entrypoints/cli.tsx')
  const live = source('src/utils/concurrentSessions.ts')
  assert.ok(!cli.includes("feature('BG_SESSIONS')"), 'old ps/daemon fast-path remains')
  assert.match(live, /registerSession\(\)/)
  assert.match(live, /updateSessionActivity/)
})
