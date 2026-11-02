/**
 * 外部文件补全命令的标准输入。
 * 旧版真实构造点：hooks/fileSuggestions.ts:727-730
 * 来源：createBaseHookInput (utils/hooks.ts:301-332) + query。
 *
 * 不接纳任意额外字段；工作区信任和命令权限仍由
 * executeFileSuggestionCommand 的运行入口判断。
 */
export type FileSuggestionCommandInput = {
  session_id: string
  transcript_path: string
  cwd: string
  query: string
  permission_mode?: string
  agent_id?: string
  agent_type?: string
}
