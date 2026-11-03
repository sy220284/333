/** Type-only mapping; runtime is supplied by source-map-restored @ant package. */
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { Tool,CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ComputerUseHostAdapter,ComputerUseSessionContext,CoordinateMode } from './types.js'
import type { ScreenshotResult } from './executor.js'
export type * from './executor.js'
export type * from './types.js'
export { DEFAULT_GRANT_FLAGS } from './types.js'
export { API_RESIZE_PARAMS,targetImageSize } from './imageResize.js'
export type CuCallToolResult=CallToolResult&{screenshot?:ScreenshotResult;telemetry?:{granted_count?:number;denied_count?:number;denied_browser_count?:number;denied_terminal_count?:number;error_kind?:string}}
export declare function buildComputerUseTools(caps:{screenshotFiltering:'native'|'none';platform:'darwin'|'win32';teachMode?:boolean},mode:CoordinateMode,appNames?:string[]):Tool[]
export declare function createComputerUseMcpServer(adapter:ComputerUseHostAdapter,mode:CoordinateMode,context?:ComputerUseSessionContext):Server
export declare function bindSessionContext(adapter:ComputerUseHostAdapter,mode:CoordinateMode,context:ComputerUseSessionContext):(name:string,args:unknown)=>Promise<CuCallToolResult>
