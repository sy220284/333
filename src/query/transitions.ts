/**
 * Query-loop state transitions. Derived from every 'state.transition' write
 * and terminal return in query.ts, including recovery and cancellation.
 *
 * The discriminant is deliberately closed: accidental new termination
 * reasons must be added here and reviewed by callers.
 */
export type Continue =
  | { reason: 'collapse_drain_retry'; committed: unknown }
  | { reason: 'reactive_compact_retry' }
  | { reason: 'max_output_tokens_escalate' }
  | { reason: 'max_output_tokens_recovery'; attempt: number }
  | { reason: 'stop_hook_blocking' }
  | { reason: 'token_budget_continuation' }
  | { reason: 'next_turn' }

export type Terminal =
  | { reason: 'blocking_limit' }
  | { reason: 'image_error' }
  | { reason: 'model_error'; error: unknown }
  | { reason: 'aborted_streaming' }
  | { reason: 'prompt_too_long' }
  | { reason: 'completed' }
  | { reason: 'stop_hook_prevented' }
  | { reason: 'aborted_tools' }
  | { reason: 'hook_stopped' }
  | { reason: 'max_turns'; turnCount: number }
