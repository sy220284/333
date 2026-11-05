import * as React from 'react'

export function CondensedLogo(): ReactNode {
  const { columns } = useTerminalSize()
  const agent = useAppState(s => s.agent)
  const effortValue = useAppState(s => s.effortValue)
  const model = useMainLoopModel()
  const modelDisplayName = renderModelSetting(model)
  const { version, cwd, billingType, agentName: agentNameFromSettings } = getLogoDisplayData()

  // Prefer AppState.agent (set from --agent CLI flag) over settings
  const agentName = agent ?? agentNameFromSettings

  // Calculate available width for independent 333 mark and information
  const textWidth = Math.max(columns - 15, 20)

  // Truncate version to fit within available width, accounting for "Claude Code v" prefix
  const versionPrefix = '333 v'
  const truncatedVersion = truncate(
    version,
    Math.max(textWidth - versionPrefix.length, 6),
  )

  const effortSuffix = getEffortSuffix(model, effortValue)
  const { shouldSplit, truncatedModel, truncatedBilling } =
    formatModelAndBilling(
      modelDisplayName + effortSuffix,
      billingType,
      textWidth,
    )

  // Truncate path, accounting for agent name if present
  const separator = ' · '
  const atPrefix = '@'
  const cwdAvailableWidth = agentName
    ? textWidth - atPrefix.length - stringWidth(agentName) - separator.length
    : textWidth
  const truncatedCwd = truncatePath(cwd, Math.max(cwdAvailableWidth, 10))

  // OffscreenFreeze: the logo sits at the top of the message list and is the
  // first thing to enter scrollback. useMainLoopModel() subscribes to model
  // changes and getLogoDisplayData() reads getCwd()/subscription state — any
  // of which changing while in scrollback would force a full terminal reset.
  return (
    <OffscreenFreeze>
      <Box flexDirection="row" gap={2} alignItems="center">
      <BrandMark />

      {/* Info */}
      <Box flexDirection="column">
        <Text>
          <Text bold>333</Text>{' '}
          <Text dimColor>v{truncatedVersion}</Text>
        </Text>
        {shouldSplit ? (
          <>
            <Text dimColor>{truncatedModel}</Text>
            <Text dimColor>{truncatedBilling}</Text>
          </>
        ) : (
          <Text dimColor>
            {truncatedModel} · {truncatedBilling}
          </Text>
        )}
        <Text dimColor>
          {agentName ? `@${agentName} · ${truncatedCwd}` : truncatedCwd}
        </Text>
      </Box>
      </Box>
    </OffscreenFreeze>
  )
}
