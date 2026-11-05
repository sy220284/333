/**
 * Official 2.1.317 remoteControl worker config and headless bridge adapter.
 * Source: chunk-jkh1zydw.js (le / ye), chunk-e7pnv332.js.
 */
export type RemoteControlConfig317 = {
  dir: string
  name?: string
  spawnMode: 'same-dir' | 'worktree'
  capacity: number
  permissionMode?: 'acceptEdits' | 'auto' | 'bypassPermissions' | 'default' | 'dontAsk' | 'plan'
  sandbox?: boolean
  sessionTimeoutSeconds?: number
  createSessionOnStart: boolean
}
type Issue317 = {
  code: string; path: string[]; message: string; expected?: string;
  keys?: string[]; minimum?: number; inclusive?: boolean
}
const permissionModes = new Set([
  'acceptEdits','auto','bypassPermissions','default','dontAsk','plan','manual',
])
const configKeys = new Set([
  'dir','name','spawnMode','capacity','permissionMode','sandbox',
  'sessionTimeoutSeconds','createSessionOnStart',
])
export function validateRemoteControlConfig317(value: unknown):
  {ok: true} & RemoteControlConfig317 | {ok: false; issues: Issue317[]} {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return {ok:false,issues:[{code:'invalid_type',path:[],expected:'object',
      message:'Invalid input: expected object'}]}
  const data = value as Record<string,unknown>
  const issues: Issue317[] = []
  const check = (key: string, valid: boolean, expected: string) => {
    if (!valid) issues.push({code:'invalid_type',path:[key],expected,
      message:'Invalid input: expected '+expected+' for '+key})
  }
  check('dir', typeof data.dir === 'string','string')
  if (data.name !== undefined) check('name',typeof data.name === 'string','string')
  if (data.spawnMode !== undefined) check('spawnMode',
    data.spawnMode === 'same-dir' || data.spawnMode === 'worktree','same-dir | worktree')
  const capacity = data.capacity ?? 32
  check('capacity',typeof capacity === 'number' && Number.isSafeInteger(capacity) && capacity > 0,
    'positive integer')
  if (data.permissionMode !== undefined) check('permissionMode',
    typeof data.permissionMode === 'string' && permissionModes.has(data.permissionMode),'permission mode')
  if (data.sandbox !== undefined) check('sandbox',typeof data.sandbox === 'boolean','boolean')
  if (data.sessionTimeoutSeconds !== undefined) check('sessionTimeoutSeconds',
    typeof data.sessionTimeoutSeconds === 'number' &&
    Number.isSafeInteger(data.sessionTimeoutSeconds) && data.sessionTimeoutSeconds > 0,'positive integer')
  if (data.createSessionOnStart !== undefined) check('createSessionOnStart',
    typeof data.createSessionOnStart === 'boolean','boolean')
  const unknownKeys = Object.keys(data).filter(key => !configKeys.has(key))
  if (unknownKeys.length) issues.push({code:'unrecognized_keys',path:[],keys:unknownKeys,
    message:'Unrecognized keys: '+unknownKeys.join(', ')})
  if (issues.length) return {ok:false,issues}
  return {
    ok:true,
    dir:data.dir as string,
    ...(data.name !== undefined && {name:data.name as string}),
    spawnMode: (data.spawnMode ?? 'same-dir') as 'same-dir'|'worktree',
    capacity:capacity as number,
    ...(data.permissionMode !== undefined && {
      permissionMode: (data.permissionMode === 'manual' ? 'default' : data.permissionMode)
        as RemoteControlConfig317['permissionMode'],
    }),
    ...(data.sandbox !== undefined && {sandbox:data.sandbox as boolean}),
    ...(data.sessionTimeoutSeconds !== undefined && {
      sessionTimeoutSeconds:data.sessionTimeoutSeconds as number}),
    createSessionOnStart:(data.createSessionOnStart ?? false) as boolean,
  }
}

export async function runRemoteControlWorker317(
  config: RemoteControlConfig317, signal: AbortSignal, log: (message: string) => void,
  getAccessToken: () => string | undefined,
  onAuth401: (failedToken: string) => Promise<boolean>,
): Promise<void> {
  const { runBridgeHeadless } = await import('../bridge/bridgeMain.js')
  await runBridgeHeadless({
    dir:config.dir, name:config.name, spawnMode:config.spawnMode,
    capacity:config.capacity, permissionMode:config.permissionMode,
    sandbox:false,
    ...(config.sessionTimeoutSeconds !== undefined &&
      {sessionTimeoutMs:config.sessionTimeoutSeconds * 1000}),
    createSessionOnStart:config.createSessionOnStart,
    getAccessToken, onAuth401, log,
  },signal)
}
