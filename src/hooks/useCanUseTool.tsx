/** Thin terminal adapter for the renderer-neutral permission policy. */
import * as React from 'react'
import { useCallback } from 'react'
import { Text } from '../ink.js'
import { getTerminalFocused } from '../ink/terminal-focus-state.js'
import type { ToolPermissionContext } from '../Tool.js'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import { createPermissionQueueOps } from './toolPermission/PermissionContext.js'
import { createToolAuthorization, type CanUseToolFn } from '../services/conversation/toolAuthorization.js'

export type { CanUseToolFn } from '../services/conversation/toolAuthorization.js'

export default function useCanUseTool(
  setToolUseConfirmQueue: React.Dispatch<React.SetStateAction<ToolUseConfirm[]>>,
  setToolPermissionContext: (context: ToolPermissionContext) => void,
): CanUseToolFn {
  return useCallback(createToolAuthorization({
    setToolPermissionContext,
    queueOps: createPermissionQueueOps(setToolUseConfirmQueue),
    isPromptFocused: getTerminalFocused,
    onAutoModeDenied(tool, input, toolUseContext) {
      toolUseContext.addNotification?.({
        key: 'auto-mode-denied',
        priority: 'immediate',
        jsx: <><Text color="error">{tool.userFacingName(input).toLowerCase()} denied by auto mode</Text><Text dimColor> · /permissions</Text></>,
      })
    },
  }), [setToolUseConfirmQueue, setToolPermissionContext])
}
