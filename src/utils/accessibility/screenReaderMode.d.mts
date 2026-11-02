export type ScreenReaderMode = {enabled:boolean,source?:'flag'|'env'|'settings'}
export function resolveScreenReaderMode(input?: {
  argv?:string[],
  env?:Record<string,string|boolean|undefined>,
  trustedSettings?:Array<{settings?:{axScreenReader?:boolean}|null}|null>,
}):ScreenReaderMode
export function screenReaderChildEnvironment(mode:ScreenReaderMode):Record<string,string>
export function flattenAccessibleTree(root:unknown):string
export function accessibleOutputDelta(previous?:string,current?:string):string

export function createScreenReaderAnnouncementQueue(options?:{quietMs?:number,holdMs?:number,max?:number}):{
  queue(text:string,options?:{hold?:boolean,now?:number}):void
  remaining(now?:number):number
  endStartupQuiet():void
  drain(now?:number):string[]
  pending():number
}
