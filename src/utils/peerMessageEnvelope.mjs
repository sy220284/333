const allowedAddress = /^[A-Za-z0-9%:_/.\\-]{1,300}$/
const closingTag = /<\s*\/\s*cross-session-message\s*>/giu

/** 2.1.310 tags remote-origin prompts so they are distinct from human input.
 * A nested closing delimiter must not end the envelope early.
 */
export function wrapCrossSessionMessage(message, from = 'unknown') {
  if (typeof message !== 'string' || !message.trim()) throw new Error('Cross-session message must contain text')
  if (!allowedAddress.test(from)) throw new Error('Invalid peer sender address')
  return `<cross-session-message from="${from}">\n${message.replace(closingTag, '<\\/cross-session-message>')}\n</cross-session-message>`
}
