import type { QueuePriority, QueuedCommand } from '../types/textInputTypes.js'
export declare const QUEUE_PRIORITY_ORDER: Readonly<Record<QueuePriority, number>>
export declare function sortQueuedCommandsByPriority<T extends Pick<QueuedCommand, 'priority'>>(
  commands: readonly T[],
): T[]
