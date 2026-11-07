export type Item = Record<string, unknown>
export type AppEvent = {event:string;sessionId?:string;turnId?:string;message?:Item;state?:Item;permission?:Item;request?:Item;task?:Item;error?:string;[key:string]:unknown}
export interface DesktopAPI {
  call<T=unknown>(method:string,args?:Record<string,unknown>):Promise<T>
  subscribe(listener:(event:AppEvent)=>void):()=>void
}
declare global {interface Window {yaoyao:DesktopAPI}}
export const api=window.yaoyao
