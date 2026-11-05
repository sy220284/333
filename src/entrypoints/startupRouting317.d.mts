export declare function classifyStartupArgs(args: string[]): {
  flagWords: readonly string[]
  command: string | undefined
  sessionVerbIndex: number
  backgroundRequest: boolean
  tmuxWorktreeRequest: boolean
}
