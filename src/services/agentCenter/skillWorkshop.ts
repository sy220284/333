/**
 * Project-scoped Skill workshop. Generating a draft never runs it.
 * Publishing is an explicit desktop action; existing files are preserved.
 */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { z } from 'zod/v4'
import * as lockfile from '../../utils/lockfile.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

const schema = z.strictObject({
  id: z.string().uuid(),
  slug: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  description: z.string().trim().min(12).max(240).refine(text => !/[\r\n\u0000]/.test(text), '描述不能换行'),
  instructions: z.string().trim().min(60).max(20000),
  projectDir: z.string().min(1),
  state: z.enum(['candidate', 'published']),
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().optional(),
})
export type SkillDraft = z.infer<typeof schema>
function draftDirectory(projectDir: string, root: string): string {
  if (!projectDir.trim()) throw new Error('技能候选必须属于明确的项目')
  const key = createHash('sha256').update(resolve(projectDir)).digest('hex')
  return join(root, 'capability-drafts', key)
}
function draftPath(projectDir: string, id: string, root: string): string {
  if (!z.string().uuid().safeParse(id).success) throw new Error('无效技能候选 ID')
  return join(draftDirectory(projectDir, root), id + '.json')
}
function skillMarkdown(draft: SkillDraft): string {
  return '---\nname: ' + draft.slug + '\ndescription: ' + JSON.stringify(draft.description) +
    '\n---\n\n' + draft.instructions.trim() + '\n'
}
async function readDraft(projectDir: string, id: string, root: string): Promise<SkillDraft> {
  const path = draftPath(projectDir, id, root)
  const raw = await readFile(path, 'utf8')
  if (Buffer.byteLength(raw) > 30000) throw new Error('技能候选文件过大')
  const item = schema.parse(JSON.parse(raw))
  if (item.projectDir !== resolve(projectDir) || item.id !== id) throw new Error('技能候选归属其他项目')
  return item
}
async function atomicReplace(path: string, value: SkillDraft): Promise<void> {
  const temp = path + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temp, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 })
    await rename(temp, path)
  } finally { await rm(temp, { force: true }) }
}
export async function createSkillDraft(
  projectDir: string,
  input: { slug: string; description: string; instructions: string },
  root = getClaudeConfigHomeDir(),
): Promise<SkillDraft> {
  const now = new Date().toISOString()
  const draft = schema.parse({
    ...input, id: randomUUID(), projectDir: resolve(projectDir), state: 'candidate',
    createdAt: now,
  })
  const dir = draftDirectory(projectDir, root)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await writeFile(draftPath(projectDir, draft.id, root), JSON.stringify(draft, null, 2),
    { flag: 'wx', mode: 0o600 })
  return draft
}
export async function listSkillDrafts(
  projectDir: string, root = getClaudeConfigHomeDir(),
): Promise<SkillDraft[]> {
  const dir = draftDirectory(projectDir, root)
  let files: string[]
  try { files = await readdir(dir) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const drafts = await Promise.all(files.filter(file => /^[a-f0-9-]{36}\.json$/.test(file))
    .map(file => readDraft(projectDir, file.slice(0, -5), root)))
  return drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
export async function publishSkillDraft(
  projectDir: string, id: string, root = getClaudeConfigHomeDir(),
): Promise<{ draft: SkillDraft; path: string }> {
  const path = draftPath(projectDir, id, root)
  const unlock = await lockfile.lock(path, { retries: { retries: 7, minTimeout: 25, maxTimeout: 200 } })
  try {
    const draft = await readDraft(projectDir, id, root)
    const project = await realpath(projectDir)
    const claudeDir = join(project, '.claude')
    await mkdir(claudeDir, { recursive: true, mode: 0o700 })
    if (!(await realpath(claudeDir)).startsWith(project + sep))
      throw new Error('技能目标目录超出了项目范围')
    const skillsRoot = join(claudeDir, 'skills')
    await mkdir(skillsRoot, { recursive: true, mode: 0o700 })
    if (!(await realpath(skillsRoot)).startsWith(project + sep))
      throw new Error('技能目标目录超出了项目范围')
    const destination = join(skillsRoot, draft.slug)
    await mkdir(destination, { recursive: true, mode: 0o700 })
    const verified = await realpath(destination)
    if (!verified.startsWith(project + sep)) throw new Error('技能目标目录超出了项目范围')
    const file = join(verified, 'SKILL.md')
    const markdown = skillMarkdown(draft)
    try {
      await writeFile(file, markdown, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const existingFile = await lstat(file)
      if (!existingFile.isFile() || existingFile.isSymbolicLink())
        throw new Error('技能目标存在非普通文件，拒绝覆盖或沿用')
      const existing = await readFile(file, 'utf8')
      if (existing !== markdown) throw new Error('同名技能已存在不同内容，请选择其他名称或明确执行版本升级')
    }
    if (draft.state === 'published') return { draft, path: file }
    const published = schema.parse({
      ...draft, state: 'published', publishedAt: new Date().toISOString(),
    })
    await atomicReplace(path, published)
    return { draft: published, path: file }
  } finally { await unlock() }
}
