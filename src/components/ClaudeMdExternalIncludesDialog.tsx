import React, { useCallback } from 'react'
import { logEvent } from 'src/services/analytics/index.js'
import { Box, Link, Text } from '../ink.js'
import type { ExternalClaudeMdInclude } from '../utils/claudemd.js'
import { saveCurrentProjectConfig } from '../utils/config.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from './design-system/Dialog.js'

type Props = {
  onDone(): void
  isStandaloneDialog?: boolean
  externalIncludes?: ExternalClaudeMdInclude[]
}

export function ClaudeMdExternalIncludesDialog({
  onDone,
  isStandaloneDialog,
  externalIncludes,
}: Props): React.ReactNode {
  React.useEffect(() => {
    // Log when dialog is shown
    logEvent('tengu_claude_md_includes_dialog_shown', {})
  }, [])

  const handleSelection = useCallback(
    (value: 'yes' | 'no') => {
      if (value === 'no') {
        logEvent('tengu_claude_md_external_includes_dialog_declined', {})
        // Mark that we've shown the dialog but it was declined
        saveCurrentProjectConfig(current => ({
          ...current,
          hasClaudeMdExternalIncludesApproved: false,
          hasClaudeMdExternalIncludesWarningShown: true,
        }))
      } else {
        logEvent('tengu_claude_md_external_includes_dialog_accepted', {})
        saveCurrentProjectConfig(current => ({
          ...current,
          hasClaudeMdExternalIncludesApproved: true,
          hasClaudeMdExternalIncludesWarningShown: true,
        }))
      }

      onDone()
    },
    [onDone],
  )

  const handleEscape = useCallback(() => {
    handleSelection('no')
  }, [handleSelection])

  return (
    <Dialog
      title="允许 CLAUDE.md 引用外部文件吗？"
      color="warning"
      onCancel={handleEscape}
      hideBorder={!isStandaloneDialog}
      hideInputGuide={!isStandaloneDialog}
    >
      此项目的 CLAUDE.md 引用了当前工作目录之外的文件。对于第三方仓库，请勿允许这种访问。<Text>
        This project&apos;s CLAUDE.md imports files outside the current working
        directory. Never allow this for third-party repositories.
      </Text>

      {externalIncludes && externalIncludes.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>外部引用：</Text>
          {externalIncludes.map((include, i) => (
            <Text key={i} dimColor>
              {'  '}
              {include.path}
            </Text>
          ))}
        </Box>
      )}

      <Text dimColor>
        重要提示：仅允许 Claude Code 访问可信文件，访问不可信文件可能造成安全风险。{' '}
        <Link url="https://code.claude.com/docs/en/security" />{' '}
      </Text>

      <Select
        options={[
          { label: '是，允许外部引用', value: 'yes' },
          { label: '否，禁用外部引用', value: 'no' },
        ]}
        onChange={value => handleSelection(value as 'yes' | 'no')}
      />
    </Dialog>
  )
}
