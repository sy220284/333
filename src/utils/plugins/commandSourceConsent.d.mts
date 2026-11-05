export type CommandSourceDisclosure = {
  kind: 'command_source'
  pluginId: string
  command: string
  mode: 'copy' | 'link'
  catalogRevision: string
  sha256: string
  acceptCommandMatched?: boolean
}
export function commandSourceDigest(disclosure: {
  kind: string; pluginId: string; command: string; mode?: string; archiveUrl?: string; catalogRevision: string
}): string
export function commandSourceDisclosure(
  args: { pluginId: string; command: string; mode: 'copy' | 'link'; catalogRevision: string },
  suppliedDigest?: string,
): CommandSourceDisclosure
export function canonicalCatalogTree(value: unknown): unknown
export function localCatalogRevision(marketplaceJson: string | unknown, packageJson?: string | unknown | null): string
export function isAuthorizedSourceCommand(
  disclosure: CommandSourceDisclosure,
  options?: { yes?: boolean; acceptCommand?: string; isNestedSession?: boolean },
): boolean
export function installedSourceCommandKey(source: { source: string; command: string; mode: string } | null | undefined): string | undefined
