import * as React from 'react'
import type { LocalJSXCommandContext } from '../../commands.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { WorkflowHistoryDialog } from '../../components/tasks/WorkflowHistoryDialog.js'
export async function call(onDone:LocalJSXCommandOnDone,context:LocalJSXCommandContext):Promise<React.ReactNode>{
 return <WorkflowHistoryDialog toolUseContext={context} onDone={onDone}/>
}
