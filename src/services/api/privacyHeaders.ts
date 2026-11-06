/**
 * Strip only SDK-added runtime/platform diagnostics from outbound model requests.
 * Authentication, model-version negotiation and user-specified headers remain intact.
 */
export function stripSdkDiagnosticHeaders(headers: Headers): void {
  // Headers iterators are live. Snapshot names before deleting consecutive keys.
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith('x-stainless-')) headers.delete(name)
  }
}
