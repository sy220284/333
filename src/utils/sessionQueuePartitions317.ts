/**
 * Session-owned queues. Each conversation retains its own command identity and
 * immutable React snapshot. Removing the final entry releases the partition.
 * Both REPL and SDK use this store through messageQueueManager.
 */
export class SessionQueuePartitions317<T> {
  private readonly partitions = new Map<string, { commands: T[]; snapshot: readonly T[] }>()
  private readonly empty: readonly T[] = Object.freeze([] as T[])

  get(sessionId: string): T[] {
    let partition = this.partitions.get(sessionId)
    if (!partition) {
      partition = { commands: [], snapshot: this.empty }
      this.partitions.set(sessionId, partition)
    }
    return partition.commands
  }

  /** Read without allocating a partition during idle-session polling. */
  getExisting(sessionId: string): T[] | undefined {
    return this.partitions.get(sessionId)?.commands
  }

  snapshot(sessionId: string): readonly T[] {
    return this.partitions.get(sessionId)?.snapshot ?? this.empty
  }

  changed(sessionId: string): void {
    const partition = this.partitions.get(sessionId)
    if (!partition) throw new Error('Cannot publish a queue without a session')
    if (partition.commands.length === 0) {
      this.partitions.delete(sessionId)
    } else {
      partition.snapshot = Object.freeze([...partition.commands])
    }
  }

  *entries(): Generator<readonly [string, T[]]> {
    for (const [sessionId, partition] of this.partitions) {
      yield [sessionId, partition.commands] as const
    }
  }

  reset(sessionId: string): void {
    this.partitions.delete(sessionId)
  }
}
