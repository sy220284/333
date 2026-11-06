/** The single source of truth for the independently packaged CLI/desktop entrypoints. */
export function createReleasePackageManifest(releaseVersion, desktopNativeName) {
  if (!/^\d+\.\d+\.\d+$/.test(releaseVersion)) throw new Error('Invalid release version')
  if (desktopNativeName !== 'desktopHost' && desktopNativeName !== 'desktopHost.exe')
    throw new Error('Invalid desktop executable name')
  return {
    name: `yaoyaoche-agent-cli-${releaseVersion}-source-rebuild`,
    version: `${releaseVersion}-rebuild.1`,
    private: true,
    description: `摇摇车 independent remote-model coding agent, compatible with release ${releaseVersion}`,
    type: 'module',
    bin: {
      yaoyaoche: './launcher.cjs',
      'yaoyaoche-desktop': `./${desktopNativeName}`,
    },
    engines: { node: '>=18' },
  }
}
