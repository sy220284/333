import { createHash } from 'node:crypto'

export type CommandSourceDisclosure317 = {
  kind: 'command_source'
  pluginId: string
  command: string
  mode: 'copy' | 'link'
  catalogRevision: string
  sha256?: string
}
export type ArchiveSourceDisclosure317 = {
  kind: string
  pluginId: string
  command: string
  archiveUrl: string
  catalogRevision: string
}
export type SourceCommandDisclosure317 =
  | CommandSourceDisclosure317
  | ArchiveSourceDisclosure317

/**
 * Claude Code 2.1.317 source command acceptance identity.
 * The digest is bound to the command text, plugin, source mode and the
 * current marketplace revision; it must be recalculated after every refresh.
 */
export function installedSourceCommandKey(source: { source: "command"; command: string; mode: "copy"|"link" }) : string | undefined {
  if (!source || source.source !== 'command') return undefined
  return source.mode === 'link' ? source.command + '\n[mode: link]' : source.command
}

export function commandSourceDigest(disclosure: SourceCommandDisclosure317): string {
  const tuple = disclosure.kind === 'command_source'
    ? [disclosure.kind, disclosure.pluginId, disclosure.command, disclosure.mode, disclosure.catalogRevision]
    : [disclosure.kind, disclosure.pluginId, disclosure.command, disclosure.archiveUrl, disclosure.catalogRevision]
  return createHash('sha256').update(JSON.stringify(tuple), 'utf8').digest('hex')
}

export function commandSourceDisclosure({ pluginId, command, mode, catalogRevision }: { pluginId: string; command: string; mode: "copy"|"link"; catalogRevision: string }, suppliedDigest: string|undefined) : { acceptCommandMatched?: boolean; sha256: string; kind: "command_source"; pluginId: string; command: string; mode: "copy" | "link"; catalogRevision: string; } {
  if (typeof pluginId !== 'string' || !pluginId.includes('@')) throw new TypeError('Plugin identifier is required')
  if (typeof command !== 'string' || command.trim() === '') throw new TypeError('Source command must be non-empty')
  if (mode !== 'copy' && mode !== 'link') throw new TypeError('Source mode must be copy or link')
  if (typeof catalogRevision !== 'string' || catalogRevision === '') {
    throw new TypeError('Marketplace revision must be known')
  }
  const shown = { kind: 'command_source' as const, pluginId, command, mode, catalogRevision }
  return {
    ...shown,
    sha256: commandSourceDigest(shown),
    ...(suppliedDigest === undefined ? {} : {
      acceptCommandMatched: typeof suppliedDigest === 'string' &&
        suppliedDigest.trim().toLowerCase() === commandSourceDigest(shown),
    }),
  }
}

/** Recursively sort object keys into the official marketplace hash tree. */
export function canonicalCatalogTree(value: unknown): unknown {
  if (Array.isArray(value)) return ['[', ...value.map(canonicalCatalogTree)]
  if (value !== null && typeof value === 'object') {
    return ['{', ...Object.keys(value).sort().map(key => [key, canonicalCatalogTree(value[key])])]
  }
  return value
}

export function localCatalogRevision(marketplaceJson: string, packageJson: string | null = null) : string {
  const catalog = canonicalCatalogTree(
    typeof marketplaceJson === 'string' ? JSON.parse(marketplaceJson) : marketplaceJson,
  )
  const pkg = packageJson === null ? null : canonicalCatalogTree(
    typeof packageJson === 'string' ? JSON.parse(packageJson) : packageJson,
  )
  const digest = createHash('sha256').update(JSON.stringify([catalog, pkg]), 'utf8').digest('hex')
  return 'sha256:' + digest
}

/** A mismatch must not authorize anything. Never auto-accept a stale digest. */
export function isAuthorizedSourceCommand(shown: { sha256: string }, { yes = false, acceptCommand, isNestedSession = false }: {yes?: boolean; acceptCommand?: string; isNestedSession?: boolean} = {}) : boolean {
  if (isNestedSession) return false
  if (yes) return true
  return typeof acceptCommand === 'string' &&
    acceptCommand.trim().toLowerCase() === shown.sha256
}
