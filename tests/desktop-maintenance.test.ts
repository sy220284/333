import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDesktopTaskJournal, getDesktopProjectStateDirectory } from '../src/services/desktop/taskJournal.js'
import { createDesktopSessionSettingsJournal } from '../src/services/desktop/sessionSettingsJournal.js'
import { planLocalProjectPurge, executeLocalProjectPurge } from '../src/services/desktop/maintenance.js'

test('删除本地项目数据前会列出且真实清理同项目任务与会话配置，不影响其他项目',async()=>{
  const root=await mkdtemp(join(tmpdir(),'desktop-maintenance-'))
  const project=join(root,'project')
  const other=join(root,'other-project')
  const storage=join(root,'private-data')
  await (await import('node:fs/promises')).mkdir(project,{recursive:true})
  await (await import('node:fs/promises')).mkdir(other,{recursive:true})
  const id=randomUUID()
  const task=createDesktopTaskJournal(project,storage)
  const session=createDesktopSessionSettingsJournal(project,storage)
  const otherSession=createDesktopSessionSettingsJournal(other,storage)
  try{
    await task.write(id,[])
    await session.write(id,{model:'fixture-model',permissionMode:'plan'})
    await otherSession.write(id,{model:'second-model',permissionMode:'dontAsk'})
    const projectDir=getDesktopProjectStateDirectory(project,storage)
    const otherDir=getDesktopProjectStateDirectory(other,storage)
    const plan=await planLocalProjectPurge(project,storage)
    const target=plan.items.filter(item=>item.kind==='dir'&&item.path===projectDir)
    expect(target).toHaveLength(1)
    expect(target[0]?.reason).toContain('权限模式')
    const removed=await executeLocalProjectPurge(target)
    expect(removed.errors).toHaveLength(0)
    expect(removed.deleted).toBe(1)
    await expect(stat(projectDir)).rejects.toMatchObject({code:'ENOENT'})
    expect((await stat(otherDir)).isDirectory()).toBe(true)
  }finally{await rm(root,{recursive:true,force:true})}
})
