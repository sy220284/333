import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { formatWorkspaceGitDiff } from '../desktop/electron/workspaceGitDiff.mjs'

test('桌面 Git 差异包含未跟踪文件，并明确区分仅文件名与真实补丁', () => {
  const dir=mkdtempSync(join(tmpdir(),'yaoyao-git-diff-'))
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'})
  try{
    git('init','-q')
    writeFileSync(join(dir,'tracked.txt'),'old\n')
    git('add','tracked.txt')
    git('-c','user.name=Test','-c','user.email=test@example.org','commit','-qm','base')
    writeFileSync(join(dir,'new file.txt'),'not yet staged\n')
    writeFileSync(join(dir,'tracked.txt'),'edited\n')
    const actual=formatWorkspaceGitDiff(
      git('diff','--no-ext-diff','--no-color','--','.'),
      git('diff','--cached','--no-ext-diff','--no-color','--','.'),
      git('ls-files','--others','--exclude-standard','-z','--','.'),
    )
    assert.match(actual,/未暂存修改/)
    assert.match(actual,/未跟踪文件/)
    assert.match(actual,/new file\.txt/)
    assert.match(actual,/edited/)
    assert.doesNotMatch(actual,/暂无已暂存或未暂存/)
  }finally{rmSync(dir,{recursive:true,force:true})}
})

test('无变化时显示空状态，过多新文件只展开前200项', () => {
  assert.match(formatWorkspaceGitDiff('','',''),/无已暂存/)
  const names=[...Array.from({length:204},(_,i)=>`new-${i}.md`),''].join('\0')
  const actual=formatWorkspaceGitDiff('','',names)
  assert.match(actual,/另有 4 个未跟踪文件/)
  assert.doesNotMatch(actual,/new-203\.md/)
  assert.match(actual,/new-199\.md/)
})
