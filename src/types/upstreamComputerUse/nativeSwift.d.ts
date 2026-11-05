/** Contract of native computer-use-swift. */
import type {DisplayGeometry,InstalledApp,RunningApp,ResolvePrepareCaptureResult,ScreenshotResult} from './executor.js'
export interface ComputerUseAPI {
  apps:{
    prepareDisplay(ids:string[],host:string,displayId?:number):Promise<{activated?:string;hidden:string[]}>
    previewHideSet(ids:string[],displayId?:number):Promise<Array<{bundleId:string;displayName:string}>>
    findWindowDisplays(ids:string[]):Promise<Array<{bundleId:string;displayIds:number[]}>>
    appUnderPoint(x:number,y:number):Promise<{bundleId:string;displayName:string}|null>
    listInstalled():Promise<InstalledApp[]>
    iconDataUrl(path:string):string|null
    listRunning():Promise<RunningApp[]>
    open(bundleId:string):Promise<void>
    unhide(ids:string[]):Promise<void>
  }
  display:{getSize(id?:number):DisplayGeometry;listAll():DisplayGeometry[]}
  tcc:{checkAccessibility():boolean;checkScreenRecording():boolean}
  hotkey:{registerEscape(onEscape:()=>void):boolean;unregister():void;notifyExpectedEscape():void}
  screenshot:{
    captureExcluding(ids:string[],quality:number,targetWidth:number,targetHeight:number,displayId?:number):Promise<ScreenshotResult>
    captureRegion(ids:string[],x:number,y:number,w:number,h:number,targetWidth:number,targetHeight:number,quality:number,displayId?:number):Promise<{base64:string;width:number;height:number}>
  }
  resolvePrepareCapture(ids:string[],host:string,quality:number,targetWidth:number,targetHeight:number,displayId?:number,autoResolve?:boolean,doHide?:boolean):Promise<ResolvePrepareCaptureResult>
  _drainMainRunLoop?():void
}
