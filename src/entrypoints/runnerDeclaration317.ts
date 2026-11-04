// Claude Code 2.1.317 official startup contract:
// chunk-2vgwqj10.js:4-14, cli.js:66,91-94.
// The declaration is a trusted runner-to-child launch argument, and only the
// nested-repository capability currently changes startup state.
export const RUNNER_DECLARES_ARG_KEY = 'runner-declares'
export const DECLARES_DIFF_FINDS_NESTED_REPOSITORY = 'diff-finds-nested-repository'
export const DECLARES_NO_REPOSITORY_CHECKED_OUT = 'no-repository-checked-out'
const prefix = '--' + RUNNER_DECLARES_ARG_KEY + '='

export function runnerDeclarationArgument(declarations: readonly string[]): string {
  return prefix + declarations.join(',')
}

export type RunnerDeclarationFlags317 = {
  nestedRepository: boolean
  noRepositoryCheckedOut: boolean
}

export function parseRunnerDeclaration(arg: unknown): RunnerDeclarationFlags317 | null {
  if (typeof arg !== 'string' || !arg.startsWith(prefix)) return null
  const entries = arg.slice(prefix.length).split(',')
  const nestedRepository = entries.includes(DECLARES_DIFF_FINDS_NESTED_REPOSITORY)
  return {
    nestedRepository,
    noRepositoryCheckedOut: nestedRepository &&
      entries.includes(DECLARES_NO_REPOSITORY_CHECKED_OUT),
  }
}

export type RunnerDeclarationState317 = {
  setRunnerDeclaredNestedRepositoryDiff: (enabled: boolean) => void
  setRunnerDeclaredNoRepositoryCheckedOut: (enabled: boolean) => void
}

export function adoptRunnerDeclaration(arg: unknown, state: RunnerDeclarationState317): void {
  const flags = parseRunnerDeclaration(arg)
  if (!flags?.nestedRepository) return
  state.setRunnerDeclaredNestedRepositoryDiff(true)
  if (flags.noRepositoryCheckedOut)
    state.setRunnerDeclaredNoRepositoryCheckedOut(true)
}
