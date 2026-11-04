/**
 * Historical tool identities retained by Claude Code 2.1.317.
 * Source: official Linux x64 decompilation, chunk-d01ffsyh.js (g/Xl/oce).
 * This table is for permission-rule evaluation and historical data only.
 * Tool execution must always resolve through the current tool registry.
 */
const HISTORICAL_TOOL_NAMES = Object.freeze({
  Task: 'Agent',
  KillShell: 'TaskStop',
  KillBash: 'TaskStop',
  ListPeers: 'ListAgents',
  Brief: 'SendUserMessage',
  ListMcpResources: 'ListMcpResourcesTool',
  ReadMcpResource: 'ReadMcpResourceTool',
  ReadMcpResourceDir: 'ReadMcpResourceDirTool',
})

export function normalizeHistoricalToolName(name) {
  return Object.hasOwn(HISTORICAL_TOOL_NAMES, name)
    ? HISTORICAL_TOOL_NAMES[name]
    : name
}

/** Compare identities only: never change tool registrations or authorize new paths. */
export function permissionToolNamesMatch(ruleToolName, runtimeToolName) : boolean {
  return normalizeHistoricalToolName(ruleToolName) ===
    normalizeHistoricalToolName(runtimeToolName)
}

/** Read-only historical-name lookup for old permission and session records. */
export function getHistoricalToolNamesFor(currentName) : string[] {
  return Object.entries(HISTORICAL_TOOL_NAMES)
    .filter(([, newName]) => newName === currentName)
    .map(([legacyName]) => legacyName)
}
