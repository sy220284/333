/**
 * A file can be omitted from post-compaction restoration only when the
 * preserved conversation includes both its Read call and a successful result.
 * Repeated Reads always return their content in 2.1.317.
 */
export function collectPreservedReadFilePaths(messages, readToolName, normalizePath, isFullResult = result => Boolean(result)) {
  const successfulResultIds = new Set()
  for (const message of messages) {
    if (message.type !== 'user' || !Array.isArray(message.message?.content)) {
      continue
    }
    for (const block of message.message.content) {
      if (block.type === 'tool_result' && block.is_error !== true && isFullResult(block)) {
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

/**
 * These strings still occur in the actual 2.1.317 bundle's historical
 * transcript recognizer (chunk-aqqhd5p4.js:605-606). Current Read executions
 * always return bytes; a historical hint cannot be used as file content.
 */
const HISTORICAL_READ_HINT_PREFIXES = [
  'File unchanged since last read.',
  'Wasted call — file unchanged since your last Read.',
  '<system-reminder>This file is already in your context',
]

/** A compaction marker or result without file bytes cannot replace a Read. */
export function hasFullReadResultContent(result, clearedMarker, persistedPrefix, provenancePrefix) {
  if (result.is_error === true) return false
  if (typeof result.content !== 'string') return true
  const content = result.content.startsWith(provenancePrefix)
    ? result.content.slice(provenancePrefix.length)
    : result.content
  return content !== clearedMarker &&
    !content.startsWith(persistedPrefix) &&
    !HISTORICAL_READ_HINT_PREFIXES.some(prefix => content.startsWith(prefix))
}

/**
 * Original 2.1.317 transcript reconstruction tracks truncated Read outputs
 * (chunk-328ynszm.js:1302-1315). When the model saw a partial view, retaining
 * raw bytes for cache comparisons must never grant Edit/Write permission.
 */
export function isPartialReadResult(message, result) {
  return message?.toolUseResult?.file?.truncatedByTokenCap === true ||
    (typeof result.content === 'string' &&
      result.content.includes('[Truncated: PARTIAL view'))
}
