/**
 * A true value in any enabled settings source must override a weaker false
 * from another source. Explicit organization or device restrictions cannot
 * be undone by lower-priority project settings.
 */
export function isRemoteControlDisabledFromSources(
  sources: ReadonlyArray<{ disableRemoteControl?: boolean } | null | undefined>,
): boolean {
  return sources.some(settings => settings?.disableRemoteControl === true)
}
