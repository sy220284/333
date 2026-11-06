import { contextBridge, ipcRenderer } from 'electron'

type DesktopEvent = Record<string, unknown>
contextBridge.exposeInMainWorld('yaoyao', Object.freeze({
  call(method: string, args: Record<string, unknown> = {}) {
    return ipcRenderer.invoke('desktop:call', method, args)
  },
  subscribe(listener: (event: DesktopEvent) => void) {
    const handler = (_event: Electron.IpcRendererEvent, data: DesktopEvent) => listener(data)
    ipcRenderer.on('desktop:event', handler)
    return () => ipcRenderer.removeListener('desktop:event', handler)
  }
}))
