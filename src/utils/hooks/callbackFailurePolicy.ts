/**
 * SDK hook matcher failure policy. Used by the interactive hook dispatcher;
 * matching 'block' stops a tool action when the callback throws or responds
 * with invalid data. All other configurations report a non-blocking error.
 */
export function classifySdkCallbackFailure(onFailure, error) {
  return {
    blocked: onFailure === 'block',
    detail: error instanceof Error ? error.message : String(error),
  }
}
