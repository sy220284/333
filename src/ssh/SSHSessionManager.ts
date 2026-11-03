import type { RemoteMessageContent } from '../utils/teleport/api.js'

/**
 * Consumer-side contract for the SSH manager returned by SSHSession.createManager.
 * All members are used by useSSHSession, which owns the connection lifecycle,
 * tool permission prompts and interrupt controls.
 *
 * This file is a TypeScript-only contract. The SSH_REMOTE implementation
 * remains separately gated and requires its own runtime restoration.
 */
export interface SSHSessionManager {
  connect(): void
  disconnect(): void
  sendInterrupt(): void
  sendMessage(content: RemoteMessageContent): Promise<boolean>
}
