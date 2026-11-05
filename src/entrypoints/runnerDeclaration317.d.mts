export declare const RUNNER_DECLARES_ARG_KEY: 'runner-declares'
export declare const DECLARES_DIFF_FINDS_NESTED_REPOSITORY: 'diff-finds-nested-repository'
export declare const DECLARES_NO_REPOSITORY_CHECKED_OUT: 'no-repository-checked-out'
export declare function runnerDeclarationArgument(declarations: readonly string[]): string
export declare function parseRunnerDeclaration(arg: string | undefined): {
  nestedRepository: boolean
  noRepositoryCheckedOut: boolean
} | null
export declare function adoptRunnerDeclaration(arg: string, state: {
  setRunnerDeclaredNestedRepositoryDiff(value: boolean): void
  setRunnerDeclaredNoRepositoryCheckedOut(value: boolean): void
}): void
