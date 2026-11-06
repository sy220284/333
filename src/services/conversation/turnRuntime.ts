/** Transport-neutral turn orchestration. The caller supplies the existing
 * query loop and receives an ordered event stream and state transitions. */
export type TurnPhase = 'idle' | 'running' | 'completed' | 'cancelled' | 'failed'
export type TurnSnapshot = Readonly<{ phase: TurnPhase; generation: number; error?: string }>

export function createConversationTurnRuntime<Params, Event, Result>(
  execute: (params: Params) => AsyncGenerator<Event, Result, unknown>,
) {
  let snapshot: TurnSnapshot = { phase: 'idle', generation: 0 }
  let active: AbortController | undefined
  const listeners = new Set<() => void>()
  const getSnapshot = (): TurnSnapshot => snapshot
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const transition = (phase: TurnPhase, error?: string) => {
    snapshot = { phase, generation: snapshot.generation + 1, ...(error === undefined ? {} : { error }) }
    for (const listener of listeners) listener()
  }
  const cancel = (reason: string = 'user-cancel'): void => { active?.abort(reason) }
  const run = async (
    params: Params,
    onEvent: (event: Event) => void,
    controller: AbortController = new AbortController(),
  ): Promise<Result> => {
    if (active) throw new Error('Conversation turn is already running')
    if (controller.signal.aborted) throw new Error('Conversation turn was cancelled before starting')
    active = controller
    transition('running')
    try {
      const stream = execute(params)
      while (true) {
        const step = await stream.next()
        if (step.done) {
          transition(controller.signal.aborted ? 'cancelled' : 'completed')
          return step.value
        }
        onEvent(step.value)
      }
    } catch (error) {
      transition(controller.signal.aborted ? 'cancelled' : 'failed',
        error instanceof Error ? error.message : String(error))
      throw error
    } finally {
      active = undefined
    }
  }
  return { getSnapshot, subscribe, run, cancel }
}
