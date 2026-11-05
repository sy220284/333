import React from 'react'
import { Text } from '../ink.js'
import type { ValidationError } from '../utils/settings/validation.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from './design-system/Dialog.js'
import { ValidationErrorsList } from './ValidationErrorsList.js'

type Props = {
  settingsErrors: ValidationError[]
  onContinue: () => void
  onExit: () => void
}

/**
 * Dialog shown when settings files have validation errors.
 * User must choose to continue (skipping invalid files) or exit to fix them.
 */
export function InvalidSettingsDialog({
  settingsErrors,
  onContinue,
  onExit,
}: Props): React.ReactNode {
  function handleSelect(value: string): void {
    if (value === 'exit') {
      onExit()
    } else {
      onContinue()
    }
  }

  return (
    <Dialog title="设置错误" onCancel={onExit} color="warning">
      <ValidationErrorsList errors={settingsErrors} />
      <Text dimColor>
        包含错误的设置文件将整体跳过，其中其他有效设置也不会生效。
      </Text>
      <Select
        options={[
          { label: '退出并手动修复', value: 'exit' },
          {
            label: '忽略这些设置并继续',
            value: 'continue',
          },
        ]}
        onChange={handleSelect}
      />
    </Dialog>
  )
}
