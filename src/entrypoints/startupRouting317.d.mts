export declare function classifyStartupArgs(args: string[]): {
  flagWords: string[]
  command: string | undefined
  sessionVerbIndex: number
  backgroundRequest: boolean
  tmuxWorktreeRequest: boolean
}
