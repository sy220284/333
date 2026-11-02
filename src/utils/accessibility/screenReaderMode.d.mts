export type ScreenReaderMode = {enabled:boolean,source?:'flag'|'env'|'settings'}
export function resolveScreenReaderMode(input?: {
  argv?:string[],
  env?:Record<string,string|boolean|undefined>,
  trustedSettings?:Array<{settings?:{axScreenReader?:boolean}|null}|null>,
}):ScreenReaderMode
export function screenReaderChildEnvironment(mode:ScreenReaderMode):Record<string,string>
export function flattenAccessibleTree(root:unknown):string
export function accessibleOutputDelta(previous?:string,current?:string):string
