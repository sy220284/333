/** Contract of native computer-use-input. */
export interface ComputerUseInputAPI{
  key(key:string,action:'press'|'release'):Promise<void>
  keys(keys:string[]):Promise<void>
  typeText(text:string):Promise<void>
  moveMouse(x:number,y:number,absolute:boolean):Promise<void>
  mouseButton(button:'left'|'right'|'middle',action:'click'|'press'|'release',count?:number):Promise<void>
  mouseScroll(amount:number,direction:'vertical'|'horizontal'):Promise<void>
  mouseLocation():{x:number;y:number}
  getFrontmostAppInfo():{bundleId:string;appName:string}|null
}
export type ComputerUseInput={isSupported:false}|(ComputerUseInputAPI&{isSupported:true})
