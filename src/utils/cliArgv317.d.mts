export function getCliFlagValues(flag: string, argv?: readonly string[]): string[]
export function getCliFlagValue(flag: string, argv?: readonly string[]): string | undefined
export function findCliArgument(predicate: (word: string) => boolean, argv?: readonly string[]): number
export function hasCliFlag(flag: string, argv?: readonly string[]): boolean
export function beforeDoubleDash(argv: readonly string[]): readonly string[]
export function firstCliPositionalIndex(argv: readonly string[]): number
export function isPrintModeLaunch(argv?: readonly string[]): boolean
export function isStreamJsonLaunch(argv?: readonly string[]): boolean
export function rejectDeepLinkArgumentInjection(argv?: readonly string[]): string | null
