import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getTeamDir, getTeamFilePath, setMemberActive, writeTeamFileAsync, cleanupTeamDirectories } from '../src/utils/swarm/teamHelpers.js'
import type { TeamFile } from '../src/utils/swarm/teamHelpers.js'
import { writeToMailbox } from '../src/utils/teammateMailbox.js'

const initialEnv = process.env.YAOYAOCHE_CONFIG_DIR
const roots: string[] = []
afterEach(async () => {
  if (initialEnv === undefined) delete process.env.YAOYAOCHE_CONFIG_DIR
  else process.env.YAOYAOCHE_CONFIG_DIR = initialEnv
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive:true, force:true })))
})

async function setup(teamName: string): Promise<TeamFile> {
  const root=await mkdtemp(join(tmpdir(),'team-lifecycle-'))
  roots.push(root)
  process.env.YAOYAOCHE_CONFIG_DIR=root
  const file:TeamFile={
    name:teamName,createdAt:Date.now(),leadAgentId:'team-lead@'+teamName,
    members:[{agentId:'team-lead@'+teamName,name:'team-lead',
      joinedAt:Date.now(),tmuxPaneId:'',cwd:root,subscriptions:[]},
    {agentId:'worker@'+teamName,name:'worker',joinedAt:Date.now(),
      tmuxPaneId:'pane-worker',cwd:root,subscriptions:[],isActive:true}],
  }
  await writeTeamFileAsync(teamName,file,true)
  return file
}

async function missing(path: string): Promise<boolean> {
  try { await stat(path); return false }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error }
}

test('317#028 deleted teams reject late inbox writes and never recreate the team', async()=>{
  const team='deleted-team-'+Date.now()
  await setup(team)
  await writeToMailbox('worker',{from:'team-lead',text:'first',timestamp:new Date().toISOString()},team)
  await cleanupTeamDirectories(team)
  await expect(writeToMailbox('worker',{from:'team-lead',text:'too late',timestamp:new Date().toISOString()},team)).rejects.toThrow()
  await expect(writeTeamFileAsync(team,{name:team,createdAt:1,leadAgentId:'old',members:[]})).rejects.toThrow()
  await setMemberActive(team,'worker',false)
  expect(await missing(getTeamDir(team))).toBe(true)
})

test('317#028 mailbox writes racing cleanup cannot resurrect deleted directories', async()=>{
  const team='racing-team-'+Date.now()
  await setup(team)
  const done=await Promise.allSettled([
    writeToMailbox('worker',{from:'team-lead',text:'race',timestamp:new Date().toISOString()},team),
    cleanupTeamDirectories(team),
    writeToMailbox('worker',{from:'team-lead',text:'later',timestamp:new Date().toISOString()},team),
  ])
  expect(done.some(item=>item.status==='fulfilled')).toBe(true)
  expect(await missing(getTeamDir(team))).toBe(true)
  expect(await missing(getTeamFilePath(team))).toBe(true)
})

test('317#029 stale team snapshots cannot overwrite a new team with the same name', async()=>{
  const team='identity-team-'+Date.now()
  const old=await setup(team)
  await cleanupTeamDirectories(team)
  const replacement:TeamFile={...old,createdAt:old.createdAt+2000}
  await writeTeamFileAsync(team,replacement,true)
  await expect(writeTeamFileAsync(team,old)).rejects.toThrow('was replaced')
  const actual=JSON.parse(await readFile(getTeamFilePath(team),'utf8')) as TeamFile
  expect(actual.createdAt).toBe(replacement.createdAt)
})
