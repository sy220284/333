/**
 * A file can be omitted from post-compaction restoration only when the
 * preserved conversation includes both its Read call and a successful result.
 * Repeated Reads always return their content in 2.1.317.
 */
export function collectPreservedReadFilePaths(messages, readToolName, normalizePath) {
  const successfulResultIds = new Set()
  for (const message of messages) {
    if (message.type !== 'user' || !Array.isArray(message.message?.content)) {
      continue
    }
    for (const block of message.message.content) {
      if (block.type === 'tool_result' && block.is_error !== true) {
        successfulResultIds.add(block.tool_use_id)
      }
    }
  }

  const paths = new Set()
  for (const message of messages) {
    if (message.type !== 'assistant' || !Array.isArray(message.message?.content)) {
      continue
    }
    for (const block of message.message.content) {
      if (
        block.type !== 'tool_use' ||
        block.name !== readToolName ||
        !successfulResultIds.has(block.id)
      ) {
        continue
      }
      const filePath = block.input?.file_path
      if (typeof filePath === 'string') {
        paths.add(normalizePath(filePath))
      }
    }
  }
  return paths
}
