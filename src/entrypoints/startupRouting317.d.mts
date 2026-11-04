export declare function classifyStartupArgs(args: string[]): {
  flagWords: string[]
  command: string | undefined
  backgroundRequest: boolean
  tmuxWorktreeRequest: boolean
}
