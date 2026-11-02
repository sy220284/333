import type { StdoutMessage } from '../../entrypoints/sdk/controlTypes.js'

/**
 * Common runtime contract implemented by WebSocketTransport and SSETransport.
 * HybridTransport inherits WebSocketTransport. RemoteIO and transportUtils
 * consume this interface; transport-specific setOnEvent is intentionally
 * available only on SSETransport after narrowing.
 */
export interface Transport {
  connect(): Promise<void>
  write(message: StdoutMessage): Promise<void>
  close(): void
  isConnectedStatus(): boolean
  isClosedStatus(): boolean
  setOnData(callback: (data: string) => void): void
  setOnClose(callback: (closeCode?: number) => void): void
}
