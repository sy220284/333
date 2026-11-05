/** Only macOS exposes the required Swift/TCC desktop control runtime. */
export function supportsComputerUsePlatform(platform: NodeJS.Platform): boolean {
  return platform === 'darwin'
}
