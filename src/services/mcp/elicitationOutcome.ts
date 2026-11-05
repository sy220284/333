/**
 * Claude Code 2.1.310: a headless MCP elicitation may time out without
 * anyone approving the request. Tell the model why the tool did not finish
 * and prevent automatic repetition of a potentially side-effectful call.
 *
 * A cancellation in the SDK control channel may be an explicit refusal or
 * the result of an unanswered/aborted request. Both mean approval was absent.
 */
export function describeMcpUrlElicitationRejection(
  toolName: string,
  action: 'cancel' | 'decline',
  headless: boolean,
): string {
  if (action === 'cancel' && headless) {
    return (
      `The MCP tool "${toolName}" could not complete because its required URL elicitation ` +
      'was cancelled or no answer was received. No approval to proceed was received. ' +
      'Do not automatically repeat this tool call; wait for a new user instruction.'
    )
  }
  return (
    `URL elicitation was ${action === 'decline' ? 'declined' : 'cancelled'} by the user. ` +
    `The tool "${toolName}" could not complete because it requires the user to open a URL.`
  )
}
