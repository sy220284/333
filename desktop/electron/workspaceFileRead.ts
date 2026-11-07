/** Bounded text preview. Keep native SDK file access separate from the editor preview.
 * Check before opening, and cap bytes even if a file grows during the read. */
import { open, stat } from 'node:fs/promises'

export async function readWorkspaceTextBounded(path:string,maxBytes=2*1024*1024):Promise<string>{
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new RangeError('文件预览上限无效')
  const details=await stat(path)
  if(!details.isFile()||details.size>maxBytes)throw new Error('文件过大或不是普通文件，请通过工具逐段阅读')
  const file=await open(path,'r')
  try{
    const current=await file.stat()
    if(!current.isFile()||current.size>maxBytes)throw new Error('文件过大或不是普通文件，请通过工具逐段阅读')
    const buffer=Buffer.allocUnsafe(maxBytes+1)
    let total=0
    while(total<buffer.length){
      const {bytesRead}=await file.read(buffer,total,buffer.length-total,total)
      if(bytesRead===0)break
      total+=bytesRead
    }
    if(total>maxBytes)throw new Error('文件过大，请通过工具逐段阅读')
    const bytes=buffer.subarray(0,total)
    if(bytes.includes(0))throw new Error('二进制文件暂不提供文本预览')
    return bytes.toString('utf8')
  }finally{await file.close()}
}
