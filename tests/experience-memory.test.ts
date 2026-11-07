import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  validateExperienceDraft, proposeProjectExperience, listProjectExperiences,
  approveProjectExperience, retireProjectExperience, findRelevantExperiences,
} from '../src/services/agentCenter/experienceMemory.js'

const draft = {
  key: 'subtitle-timebase-v1',
  title: '变帧率视频字幕对齐规范',
  scenario: '变帧率素材经过剪辑或重定时后，原始字幕出现逐步偏移',
  principle: '采用统一时间基准对齐视频与字幕，避免直接混用帧编号和时间戳',
  procedure: ['先核对素材时间基准和最终编辑时间轴', '重映射字幕并逐一检查视频首中尾三个样本'],
  applicability: '素材变帧率且字幕来自原始时间轴',
  invalidWhen: '素材和字幕已经在最终恒定帧率时间轴对齐',
  verification: '核验导出文件的时间戳并对照三个抽样片段',
  evidenceRefs: ['artifact:subtitle-qc:verified-01'],
  tags: ['字幕', '视频剪辑', '时间轴'],
}
async function fixture(run: (root: string, project: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'experience-rule-'))
  try { await run(root, join(root, 'project')) }
  finally { await rm(root, { recursive: true, force: true }) }
}
test('经验必须具备场景、操作方法、失效条件及验证证据', () => {
  expect(() => validateExperienceDraft({ ...draft, evidenceRefs: [] })).toThrow()
  expect(() => validateExperienceDraft({ ...draft, procedure: [] })).toThrow()
  expect(() => validateExperienceDraft({ ...draft, invalidWhen: '' })).toThrow()
  expect(validateExperienceDraft(draft).key).toBe('subtitle-timebase-v1')
})
test('候选不自动召回；人工审核后可检索；废弃后不能再召回', async () => {
  await fixture(async (root, project) => {
    const pending = await proposeProjectExperience(project, draft, root)
    expect(pending.status).toBe('candidate')
    expect(await listProjectExperiences(project, { root })).toHaveLength(0)
    expect(await findRelevantExperiences(project, '字幕', root)).toHaveLength(0)
    const approved = await approveProjectExperience(project, pending.id, 'human-review', root)
    expect(approved.status).toBe('approved')
    expect((await findRelevantExperiences(project, '字幕 时间轴', root))[0]?.id).toBe(pending.id)
    expect((await listProjectExperiences(project, { root }))[0]?.verifiedBy).toBe('human-review')
    await retireProjectExperience(project, pending.id, '工具版本变更，需要重新验证', root)
    expect(await findRelevantExperiences(project, '字幕', root)).toHaveLength(0)
    expect(await listProjectExperiences(project, { root })).toHaveLength(0)
  })
})
test('同一经验重复提议幂等，不同版本需先废弃，项目互相隔离', async () => {
  await fixture(async (root, project) => {
    const first = await proposeProjectExperience(project, draft, root)
    const second = await proposeProjectExperience(project, draft, root)
    expect(second.id).toBe(first.id)
    await expect(proposeProjectExperience(project, { ...draft, principle: `${draft.principle}。` }, root))
      .rejects.toThrow('已存在')
    expect(await listProjectExperiences(join(root, 'other'), { includeCandidates: true, root })).toHaveLength(0)
    await retireProjectExperience(project, first.id, '旧规范已被新版测试流程替代', root)
    const replacement = await proposeProjectExperience(project, { ...draft, principle: draft.principle + '。' }, root)
    expect(replacement.id).not.toBe(first.id)
    expect(replacement.status).toBe('candidate')
    expect((await listProjectExperiences(project, { includeCandidates: true, root })).length).toBe(2)
  })
})
test('并发同 key 提议保留一条记录', async () => {
  await fixture(async (root, project) => {
    const outcomes = await Promise.all([1, 2, 3, 4].map(() => proposeProjectExperience(project, draft, root)))
    expect(new Set(outcomes.map(x => x.id)).size).toBe(1)
    expect((await listProjectExperiences(project, { includeCandidates: true, root })).length).toBe(1)
  })
})
