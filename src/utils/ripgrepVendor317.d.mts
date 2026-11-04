export declare function resolvePackagedRipgrep(input: {
  execPath?: string
  argv0?: string
  scriptPath?: string
  modulePath?: string
  arch: string
  platform: string
}): { path: string | null; candidates: string[] }
