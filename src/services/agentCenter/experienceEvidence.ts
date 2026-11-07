/** Evidence checks for reusable long-term norms. Only real project-local
 * file hashes and accepted Git/Job records count as machine-verifiable.
 * External references always require a separate human review note.
 */
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { listMissionJobs } from './missionJobs.js'

const execute = promisify(execFile)
export type ExperienceEvidenceCheck = {
  ref: string
  status: 'verified' | 'manual' | 'missing'
  detail: string
  fingerprint?: string
}
export async function inspectExperienceEvidence(
  projectDir: string,
  refs: string[],
  missionRoot?: string,
): Promise<ExperienceEvidenceCheck[]> {
  return Promise.all(refs.map(async ref => {
    if (ref.startsWith('file:')) {
      const name = ref.slice(5)
      if (!name || isAbsolute(name) || /^[A-Za-z]:/.test(name) ||
          name.split(/[\\/]/).includes('..'))
        return { ref, status: 'missing', detail: '需要项目内的安全相对路径' } as ExperienceEvidenceCheck
      let project: string, file: string
      try {
        project = await realpath(projectDir)
        file = await realpath(resolve(project,name))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          return { ref,status:'missing',detail:'项目内来源文件不存在' } as ExperienceEvidenceCheck
        throw error
      }
      const subpath = relative(project,file)
      if (!subpath || subpath==='..' || subpath.startsWith('..'+sep) || isAbsolute(subpath))
        return {ref,status:'missing',detail:'来源文件超出项目边界'} as ExperienceEvidenceCheck
      const details=await stat(file)
      if (!details.isFile() || details.size>16_000_000)
        return {ref,status:'missing',detail:'来源必须为不超过16MB的普通文件'} as ExperienceEvidenceCheck
      const fingerprint=createHash('sha256').update(await readFile(file)).digest('hex')
      return {ref,status:'verified',detail:'真实项目文件与内容指纹已核对',fingerprint}
    }
    if (ref.startsWith('commit:')) {
      const sha=ref.slice(7)
      if (!/^[0-9a-f]{40,64}$/.test(sha))
        return {ref,status:'missing',detail:'Git 提交编号格式无效'} as ExperienceEvidenceCheck
      try {
        const result=await execute('git',['cat-file','-t',sha],{cwd:projectDir,timeout:5000})
        if (result.stdout.trim()==='commit')
          return {ref,status:'verified',detail:'Git 提交对象存在且类型正确',fingerprint:sha}
      } catch {
        return {ref,status:'missing',detail:'当前项目没有该 Git 提交对象'} as ExperienceEvidenceCheck
      }
      return {ref,status:'missing',detail:'Git 对象类型不是提交'} as ExperienceEvidenceCheck
    }
    if (ref.startsWith('job:')) {
      const match=/^job:(mission_[0-9a-f]{16})\/(job_[0-9a-f]{16})$/.exec(ref)
      if (!match) return {ref,status:'missing',detail:'任务证据编号无效'} as ExperienceEvidenceCheck
      const jobs=await listMissionJobs(match[1],projectDir,missionRoot)
      const job=jobs.find(item=>item.id===match[2])
      if (!job) return {ref,status:'missing',detail:'长期任务不存在或归属其他项目'} as ExperienceEvidenceCheck
      return job.status==='completed'
        ? {ref,status:'verified',detail:'长期任务已通过完成审核',fingerprint:job.runId??job.id}
        : {ref,status:'manual',detail:'长期任务尚未通过最终审核'}
    }
    return {ref,status:'manual',detail:'外部来源需人工打开原件并记录核验结论'} as ExperienceEvidenceCheck
  }))
}
