/**
 * Preserve the exact Claude Code 2.1.317 PreCompact hook limit:
 * 10,000 UTF-16 code units of each successful hook's output, with a
 * visible explanation when truncated. The appended explanation is metadata;
 * the limit applies to the contributed text, not to the whole message.
 */
export const MAX_PRECOMPACT_HOOK_OUTPUT = 10000

export function capPreCompactHookOutput(rawOutput: string, command: string) : { output: string; truncated: boolean; originalLength: number; } {
  const output = rawOutput.trim()
  if (output.length <= MAX_PRECOMPACT_HOOK_OUTPUT) {
    return {output, truncated:false, originalLength:output.length}
  }

  let head = output.slice(0, MAX_PRECOMPACT_HOOK_OUTPUT)
  const lastCodeUnit = head.charCodeAt(head.length - 1)
  // A split high surrogate must not turn into the replacement character.
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) head = head.slice(0,-1)

  return {
    output: head + '\n\n[PreCompact hook ['+command+'] output cut: '+output.length+
      ' characters is over the '+MAX_PRECOMPACT_HOOK_OUTPUT+'-character limit]',
    truncated:true,
    originalLength:output.length,
  }
}
