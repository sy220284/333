/**
 * Shared priority order for the 2.1.317 command queue.
 * Snapshot iteration and bulk drains must agree with dequeue(): urgent
 * commands run first, with FIFO preserved within each priority.
 */
export const QUEUE_PRIORITY_ORDER = Object.freeze({ now: 0, next: 1, later: 2 })

export function sortQueuedCommandsByPriority(commands) {
  // JavaScript stable sorting preserves FIFO for commands of equal priority.
  // Never mutate the queue itself: callers remove commands by object identity.
  return [...commands].sort((a, b) =>
    QUEUE_PRIORITY_ORDER[a.priority ?? 'next'] -
    QUEUE_PRIORITY_ORDER[b.priority ?? 'next'],
  )
}
