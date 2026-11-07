import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  registerProjectArtifact, listProjectArtifacts, verifyProjectArtifact, approveProjectArtifact,
} from '../src/services/agentCenter/artifactRegistry.js'

async function fixture(fn:(root:string,project:string)=>Promise<void>){
  const root=await mkdtemp(join(tmpdir(),'artifact-index-'))
  const project=join(root,'project')
  await mkdir(project)
  try{await fn(root,project)}finally{await rm(root,{force:true,recursive:true})}
}
test('真实文件登记、SHA256校验与明确人工审核',async()=>{
  await fixture(async(root,project)=>{
    await writeFile(join(project,'report.md'),'已核对报告版本1')
    const draft=await registerProjectArtifact(project,{
      title:'研究报告初稿',kind:'document',path:'report.md',
    },root)
    expect(draft.status).toBe('registered')
    expect(draft.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect((await verifyProjectArtifact(project,draft.id,root)).matches).toBe(true)
    const approved=await approveProjectArtifact(project,draft.id,'审核人',
      '已核查文章实际正文、数据引用和文件可打开性',root)
    expect(approved.status).toBe('approved')
    expect((await approveProjectArtifact(project,draft.id,'审核人',
      '已核查文章实际正文、数据引用和文件可打开性',root)).id).toBe(draft.id)
    expect((await listProjectArtifacts(project,root)).length).toBe(1)
    expect(await readFile(join(project,'report.md'),'utf8')).toContain('报告')
  })
})
test('源文件修改引发版本升级，旧审核状态保留且不能冒用',async()=>{
  await fixture(async(root,project)=>{
    await writeFile(join(project,'clip.mp4'),'video-byte-v1')
    const prior=await registerProjectArtifact(project,{
      title:'视频导出样本',kind:'video',path:'clip.mp4',
    },root)
    expect((await registerProjectArtifact(project,{
      title:'视频导出样本',kind:'video',path:'clip.mp4',
    },root)).id).toBe(prior.id)
    await writeFile(join(project,'clip.mp4'),'video-byte-v2')
    expect((await verifyProjectArtifact(project,prior.id,root)).matches).toBe(false)
    await expect(approveProjectArtifact(project,prior.id,'审核人',
      '已经检查视频渲染帧和音视频同步结果',root)).rejects.toThrow('变化')
    const newer=await registerProjectArtifact(project,{
      title:'视频导出样本',kind:'video',path:'clip.mp4',
    },root)
    expect(newer.version).toBe(2)
    expect((await listProjectArtifacts(project,root)).find(x=>x.id===prior.id)?.status).toBe('superseded')
  })
})
test('项目内文件路径保护、软链接越界及跨项目隔离',async()=>{
  await fixture(async(root,project)=>{
    await writeFile(join(root,'secret.txt'),'private')
    await symlink(join(root,'secret.txt'),join(project,'escape.txt'))
    await expect(registerProjectArtifact(project,{
      title:'越界文件',kind:'document',path:'escape.txt',
    },root)).rejects.toThrow('超出当前项目')
    await expect(registerProjectArtifact(project,{
      title:'相对路径越界',kind:'document',path:'../secret.txt',
    },root)).rejects.toThrow('相对路径')
    await writeFile(join(project,'safe.txt'),'real project data')
    await registerProjectArtifact(project,{title:'真实项目资料',kind:'document',path:'safe.txt'},root)
    expect(await listProjectArtifacts(join(root,'other'),root)).toHaveLength(0)
  })
})
