/**
 * Validated reusable project practices, not session summaries.
 * Reading never executes a model; proposing never makes a rule authoritative.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod/v4'
import * as lockfile from '../../utils/lockfile.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { inspectExperienceEvidence, type ExperienceEvidenceCheck } from './experienceEvidence.js'

const ruleFields = z.strictObject({
  key: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,95}$/),
  title: z.string().trim().min(5).max(160),
  scenario: z.string().trim().min(12).max(1400),
  principle: z.string().trim().min(12).max(1400),
  procedure: z.array(z.string().trim().min(6).max(600)).min(2).max(16),
  applicability: z.string().trim().min(8).max(1000),
  invalidWhen: z.string().trim().min(8).max(1000),
  verification: z.string().trim().min(10).max(1200),
  evidenceRefs: z.array(z.string().trim().min(3).max(400)).min(1).max(20),
  tags: z.array(z.string().trim().min(2).max(48)).min(1).max(12),
  counterexample: z.string().trim().min(8).max(1200).optional(),
})
const experienceSchema = ruleFields.extend({
  id: z.string().uuid(),
  status: z.enum(['candidate', 'approved', 'retired']),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  verifiedBy: z.string().min(1).max(128).optional(),
  reviewNote: z.string().trim().min(16).max(1500).optional(),
  evidenceSnapshot: z.array(z.strictObject({
    ref: z.string().min(3).max(400),
    status: z.enum(['verified','manual','missing']),
    fingerprint: z.string().optional(),
  })).max(20).optional(),
  retiredReason: z.string().min(8).max(1000).optional(),
})
const documentSchema = z.strictObject({
  version: z.literal(1),
  projectDir: z.string().min(1),
  revision: z.number().int().nonnegative(),
  experiences: z.array(experienceSchema).max(500),
})
export type ExperienceDraft = z.infer<typeof ruleFields>
export type ProjectExperience = z.infer<typeof experienceSchema>
type Document = z.infer<typeof documentSchema>

function projectPath(projectDir: string, root: string): string {
  if (!projectDir.trim()) throw new Error('经验必须绑定项目目录')
  return join(root, 'experience-memory', `${createHash('sha256').update(resolve(projectDir)).digest('hex')}.json`)
}
function verifyProject(doc: Document, projectDir: string): void {
  if (doc.projectDir !== resolve(projectDir)) throw new Error('经验属于另一项目')
}
async function readDocument(projectDir: string, root: string): Promise<Document> {
  const file = projectPath(projectDir, root)
  let raw: string
  try { raw = await readFile(file, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { version: 1, projectDir: resolve(projectDir), revision: 0, experiences: [] }
    throw error
  }
  if (Buffer.byteLength(raw) > 4_000_000) throw new Error('经验库超过容量限制')
  const doc = documentSchema.parse(JSON.parse(raw))
  verifyProject(doc, projectDir)
  return doc
}
async function mutate(
  projectDir: string,
  transform: (doc: Document) => { doc: Document; item: ProjectExperience },
  root: string,
): Promise<ProjectExperience> {
  const file = projectPath(projectDir, root)
  await mkdir(join(root, 'experience-memory'), { recursive: true, mode: 0o700 })
  try {
    await writeFile(file, JSON.stringify({
      version: 1, projectDir: resolve(projectDir), revision: 0, experiences: [],
    }), { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const unlock = await lockfile.lock(file, { retries: { retries: 8, minTimeout: 25, maxTimeout: 250 } })
  try {
    const current = await readDocument(projectDir, root)
    const { doc, item } = transform(current)
    if (doc === current) return item
    const next = documentSchema.parse({ ...doc, revision: current.revision + 1 })
    const data = JSON.stringify(next, null, 2)
    if (Buffer.byteLength(data) > 4_000_000) throw new Error('经验库超过容量限制')
    const temp = `${file}.${randomUUID()}.tmp`
    try {
      await writeFile(temp, data, { flag: 'wx', mode: 0o600 })
      await rename(temp, file)
    } finally { await rm(temp, { force: true }) }
    return item
  } finally { await unlock() }
}
export async function listProjectExperiences(
  projectDir: string,
  options: { includeCandidates?: boolean; root?: string } = {},
): Promise<ProjectExperience[]> {
  const root = options.root ?? getClaudeConfigHomeDir()
  const doc = await readDocument(projectDir, root)
  const selected = doc.experiences.filter(item => options.includeCandidates || item.status === 'approved')
  if (options.includeCandidates) return selected
  const verified = await Promise.all(selected.map(async item => {
    const snapshots = item.evidenceSnapshot?.filter(check=>check.ref.startsWith('file:') ||
      /^artifact:[0-9a-f-]{36}$/.test(check.ref)) ?? []
    if (!snapshots.length) return item
    const checks = await inspectExperienceEvidence(projectDir,snapshots.map(check=>check.ref),root)
    return checks.every((check,index)=>check.status==='verified' &&
      check.fingerprint===snapshots[index]?.fingerprint) ? item : null
  }))
  return verified.filter((item): item is ProjectExperience => item !== null)
}
export function validateExperienceDraft(input: unknown): ExperienceDraft {
  return ruleFields.parse(input)
}
/** Proposals are not recalled as trusted knowledge. Same semantic key is idempotent. */
export async function proposeProjectExperience(
  projectDir: string, input: ExperienceDraft, root = getClaudeConfigHomeDir(),
): Promise<ProjectExperience> {
  const data = ruleFields.parse(input)
  return mutate(projectDir, doc => {
    const existing = doc.experiences.find(item => item.key === data.key && item.status !== 'retired')
    if (existing) {
      const { id: _id, status: _status, revision: _rev, createdAt: _created,
        updatedAt: _updated, verifiedBy: _verified, reviewNote: _reviewNote,
        evidenceSnapshot: _snapshot, retiredReason: _reason, ...original } = existing
      if (JSON.stringify(original) === JSON.stringify(data)) return { doc, item: existing }
      throw new Error('同一经验规范已存在；请先审核或废弃旧版本，再提出新版')
    }
    if (doc.experiences.length >= 500) throw new Error('经验库已满，需要先整理废弃规则')
    const timestamp = new Date().toISOString()
    const item: ProjectExperience = {
      ...data, id: randomUUID(), status: 'candidate', revision: 1,
      createdAt: timestamp, updatedAt: timestamp,
    }
    return { doc: { ...doc, experiences: [...doc.experiences, item] }, item }
  }, root)
}
/** Must be invoked after an authorized reviewer checks evidence in the original task. */
export async function approveProjectExperience(
  projectDir: string, id: string, reviewer: string, root = getClaudeConfigHomeDir(),
  reviewNote?: string,
): Promise<ProjectExperience> {
  if (!z.string().uuid().safeParse(id).success || !reviewer.trim()) throw new Error('需要有效经验 ID 与审核人')
  const note = z.string().trim().min(16).max(1500).parse(reviewNote)
  const candidate = (await readDocument(projectDir,root)).experiences.find(item=>item.id===id)
  if (!candidate) throw new Error('经验条目不存在')
  const inspection = await inspectExperienceEvidence(projectDir,candidate.evidenceRefs,root)
  if (inspection.some(check=>check.status==='missing'))
    throw new Error('引用证据缺失或越界，请重新核查项目成果后审核')
  return mutate(projectDir, doc => {
    const previous = doc.experiences.find(item => item.id === id)
    if (!previous) throw new Error('经验条目不存在')
    if (previous.status === 'approved') return { doc, item: previous }
    if (previous.status !== 'candidate') throw new Error('已废弃经验不能直接批准')
    if (JSON.stringify(previous.evidenceRefs) !== JSON.stringify(candidate.evidenceRefs))
      throw new Error('审核期间证据已变更，请重新核对')
    const item: ProjectExperience = {
      ...previous, status: 'approved', verifiedBy: reviewer.trim().slice(0, 128),
      reviewNote: note,
      evidenceSnapshot: inspection.map(({ref,status,fingerprint})=>
        ({ref,status,...(fingerprint ? {fingerprint} : {})})),
      revision: previous.revision + 1, updatedAt: new Date().toISOString(),
    }
    return { doc: { ...doc, experiences: doc.experiences.map(v => v.id === id ? item : v) }, item }
  }, root)
}
export async function retireProjectExperience(
  projectDir: string, id: string, reason: string, root = getClaudeConfigHomeDir(),
): Promise<ProjectExperience> {
  if (!z.string().uuid().safeParse(id).success || reason.trim().length < 8) throw new Error('需要有效经验 ID 与废弃原因')
  return mutate(projectDir, doc => {
    const previous = doc.experiences.find(item => item.id === id)
    if (!previous) throw new Error('经验条目不存在')
    if (previous.status === 'retired') return { doc, item: previous }
    const item: ProjectExperience = {
      ...previous, status: 'retired', retiredReason: reason.trim().slice(0, 1000),
      revision: previous.revision + 1, updatedAt: new Date().toISOString(),
    }
    return { doc: { ...doc, experiences: doc.experiences.map(v => v.id === id ? item : v) }, item }
  }, root)
}
/** Deterministic retrieval; only reviewed rules, bounded and task-relevant. */
export async function findRelevantExperiences(
  projectDir: string, query: string, root = getClaudeConfigHomeDir(),
): Promise<ProjectExperience[]> {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return []
  const tokens = normalized.split(/[\s,，;；、]+/).filter(t => t.length >= 2)
  if (!tokens.length) tokens.push(normalized)
  const candidates = await listProjectExperiences(projectDir, { root })
  return candidates.map(item => {
    const subject = [item.title, item.scenario, item.applicability, ...item.tags].join(' ').toLocaleLowerCase()
    return { item, score: tokens.filter(token => subject.includes(token)).length }
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.item.key.localeCompare(b.item.key))
    .slice(0, 8).map(x => x.item)
}

/** Read-only preflight; manual references need a review note before approval. */
export async function previewProjectExperienceEvidence(
  projectDir: string, id: string, root = getClaudeConfigHomeDir(),
): Promise<{checks: ExperienceEvidenceCheck[]; mayApprove: boolean; requiresHumanReview: boolean}> {
  if (!z.string().uuid().safeParse(id).success) throw new Error('经验规范 ID 无效')
  const item = (await readDocument(projectDir,root)).experiences.find(record=>record.id===id)
  if (!item) throw new Error('经验规范不存在')
  const checks = await inspectExperienceEvidence(projectDir,item.evidenceRefs,root)
  return {
    checks,
    mayApprove: checks.every(check=>check.status!=='missing'),
    requiresHumanReview:checks.some(check=>check.status==='manual'),
  }
}
