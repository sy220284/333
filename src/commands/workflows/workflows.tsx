import * as React from 'react'
import type { LocalJSXCommandContext } from '../../commands.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { BackgroundTasksDialog } from '../../components/tasks/BackgroundTasksDialog.js'
export async function call(onDone:LocalJSXCommandOnDone,context:LocalJSXCommandContext):Promise<React.ReactNode>{
 return <BackgroundTasksDialog onlyWorkflows toolUseContext={context} onDone={onDone}/>
}
