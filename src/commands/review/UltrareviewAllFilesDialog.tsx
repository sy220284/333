import React, { useRef, useState } from 'react'
import { Select } from '../../components/CustomSelect/select.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Text } from '../../ink.js'

type Props = {
  baseBranch: string
  billsExtraUsage: boolean
  onProceed: (signal: AbortSignal) => Promise<void>
  onCancel: () => void
  onError: (error: unknown) => void
}

/**
 * 2.1.317 full-tree review is a scope escalation: a trusted workspace
 * alone does not authorize uploading every tracked file to the cloud.
 */
export function UltrareviewAllFilesDialog({
  baseBranch, billsExtraUsage, onProceed, onCancel, onError,
}: Props) {
  const [isLaunching, setIsLaunching] = useState(false)
  const controller = useRef(new AbortController())

  const cancel = () => {
    controller.current.abort()
    onCancel()
  }
  const choose = (choice: string) => {
    if (choice !== 'proceed') {
      cancel()
      return
    }
    if (isLaunching) return
    setIsLaunching(true)
    void onProceed(controller.current.signal).catch(error => {
      setIsLaunching(false)
      onError(error)
    })
  }

  return (
    <Dialog title="Ultrareview 全文件审查确认" onCancel={cancel} color="background">
      <Box flexDirection="column" gap={1}>
        <Text>当前分支与 {baseBranch} 没有共同 Git 历史。继续将把此仓库全部已跟踪文件作为快照上传，用于云端审查。</Text>
        {billsExtraUsage && <Text>此审查同时会按额外用量计费。</Text>}
        {isLaunching
          ? <Text color="background">正在准备全文件快照…</Text>
          : <Select
              options={[
                { label: '确认上传全部已跟踪文件并开始审查', value: 'proceed' },
                { label: '取消', value: 'cancel' },
              ]}
              onChange={choose}
              onCancel={cancel}
            />}
      </Box>
    </Dialog>
  )
}
