import { join, win32 } from 'node:path'

/**
 * 2.1.317 chunk-a0skhscn.js Gte()/ZN(): exec artifacts on Unix share
 * the socket path prefix; Windows named pipes use <config>/daemon/pty-pids.
 */
export function ptyExecFiles317(socketPath: string, configHome: string,
  platform: NodeJS.Platform = process.platform): { exit: string; late: string } {
  if (platform === 'win32') {
    const name = win32.basename(socketPath)
    const dir = join(configHome, 'daemon', 'pty-pids')
    return { exit: join(dir, name + '.exec-exit'), late: join(dir, name + '.late') }
  }
  return { exit: socketPath + '.exec-exit', late: socketPath + '.late' }
}
