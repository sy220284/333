import {expect,test} from 'bun:test'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readWorkspaceTextBounded} from '../desktop/electron/workspaceFileRead.js'

test('文本预览按大小限制、二进制检测和 UTF-8 内容进行真实磁盘读取',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'desktop-file-read-'))
  try{
    const path=join(folder,'sample.txt')
    await writeFile(path,'你好，工作区')
    expect(await readWorkspaceTextBounded(path,128)).toBe('你好，工作区')
    await writeFile(path,Buffer.from([65,0,66]))
    await expect(readWorkspaceTextBounded(path,128)).rejects.toThrow('二进制')
    await writeFile(path,Buffer.alloc(2*1024*1024+1,65))
    await expect(readWorkspaceTextBounded(path)).rejects.toThrow('文件过大')
    await expect(readWorkspaceTextBounded(folder)).rejects.toThrow('不是普通文件')
  }finally{await rm(folder,{recursive:true,force:true})}
})
