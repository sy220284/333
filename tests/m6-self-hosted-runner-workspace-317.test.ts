import { expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { prepareRunnerWorkspace317 } from '../src/cli/selfHostedRunner/runnerWorkspace317.ts'

function git(args:string[]):string {
  return execFileSync('git',args,{encoding:'utf8'}).trim()
}
function seed(root:string,repo='owner/project'):string {
  const bare=join(root,repo+'.git')
  mkdirSync(dirname(bare),{recursive:true})
  git(['init','--bare','--initial-branch=main',bare])
  const writer=join(root,'writer-'+repo.split('/').at(-1))
  git(['init','--initial-branch=main',writer])
  writeFileSync(join(writer,'README.md'),'verified repository data')
  git(['-C',writer,'add','.'])
  git(['-C',writer,'-c','user.name=Test','-c','user.email=test@example.org','commit','-m','initial'])
  git(['-C',writer,'remote','add','origin',bare])
  git(['-C',writer,'push','origin','main'])
  return 'file://'+bare
}
function makeRoot():string {return mkdtempSync(join(tmpdir(),'runner-workspace-317-'))}
test('317 Runner: checkout a real repository and prepare the designated outcome branch',async()=>{
  const root=makeRoot(),signal=new AbortController().signal
  try {
    const url=seed(root)
    const work=join(root,'work')
    mkdirSync(work)
    const result=await prepareRunnerWorkspace317({
      root:work,sources:[{type:'git_repository',url,revision:'main'}],
      pushTargets:[{type:'git_repository',git_info:{repo:'owner/project',
        branches:['feature/runner']}}],signal,
    })
    expect(result.cwd).toBe(join(work,'owner_project'))
    expect(result.repositories).toEqual([result.cwd])
    expect(readFileSync(join(result.cwd,'README.md'),'utf8')).toBe('verified repository data')
    expect(git(['-C',result.cwd,'branch','--show-current'])).toBe('feature/runner')
    expect(git(['-C',result.cwd,'remote','get-url','origin'])).toBe(url)
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('317 Runner: multiple isolated checkouts and valid relative server working directory',async()=>{
  const root=makeRoot(),signal=new AbortController().signal
  try {
    const first=seed(root,'owner/project'), second=seed(root,'other/library')
    const work=join(root,'work'); mkdirSync(work)
    const result=await prepareRunnerWorkspace317({
      root:work,sources:[{type:'git_repository',url:first,revision:'main'},
        {type:'git_repository',url:second,revision:'main'}],
      pushTargets:[],requestedCwd:'owner_project',signal,
    })
    expect(result.repositories).toHaveLength(2)
    expect(result.cwd).toBe(join(work,'owner_project'))
    expect(existsSync(join(work,'other_library','README.md'))).toBe(true)
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('317 Runner: failed source preparation rolls back all staged repositories',async()=>{
  const root=makeRoot(),signal=new AbortController().signal
  try {
    const first=seed(root)
    const work=join(root,'work');mkdirSync(work)
    await expect(prepareRunnerWorkspace317({root:work,
      sources:[{type:'git_repository',url:first,revision:'main'},
        {type:'git_repository',url:'file:///this-repository-does-not-exist',
          revision:'main'}],pushTargets:[],signal,
    })).rejects.toThrow()
    expect(readdirSync(work)).toEqual([])
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('317 Runner: rejects traversal, unsupported URL and unsafe ref before executing Git',async()=>{
  const root=makeRoot(),signal=new AbortController().signal
  try{
    const work=join(root,'work');mkdirSync(work)
    for(const invalid of [
      {type:'git_repository',url:'file:///tmp/owner/project.git',revision:'../escape'},
      {type:'git_repository',url:'https://user:secret@example.com/owner/project.git',revision:'main'},
      {type:'git_repository',url:'https://example.com/owner/%2Fetc.git',revision:'main'},
    ]){
      await expect(prepareRunnerWorkspace317({
        root:work,sources:[invalid],pushTargets:[],signal,
      })).rejects.toThrow()
    }
    expect(readdirSync(work)).toEqual([])
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('317 Runner: requested working directory symlink is rejected and published clone is rolled back',async()=>{
  const root=makeRoot(),signal=new AbortController().signal
  try{
    const url=seed(root),work=join(root,'work');mkdirSync(work)
    symlinkSync(root,join(work,'escape'),'dir')
    await expect(prepareRunnerWorkspace317({
      root:work,sources:[{type:'git_repository',url,revision:'main'}],
      pushTargets:[],requestedCwd:'escape',signal,
    })).rejects.toThrow('outside the session workspace')
    expect(existsSync(join(work,'owner_project'))).toBe(false)
    expect(readdirSync(work)).toEqual(['escape'])
  }finally{rmSync(root,{recursive:true,force:true})}
})
