export declare function expandAutoModeRules(rules: readonly string[] | undefined, defaults: readonly string[]): string[]
export declare function renderAutoModeRuleBlock(rules: readonly string[] | undefined, originalBlock: string, builtins?: readonly string[]): string
export declare function parseTaggedAutoModeBullets(template: string, tagName: string): string[]
export declare function mergeAutoModeRulesBySource(
  sources: Partial<Record<'userSettings' | 'flagSettings' | 'policySettings', {
    allow?: string[]; soft_deny?: string[]; hard_deny?: string[]; deny?: string[]; environment?: string[]
  }>>,
  managedAllowLocked?: boolean,
): { allow?: string[]; soft_deny?: string[]; hard_deny?: string[]; environment?: string[] } | undefined
