import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adapters = {
  'color-diff-napi': 'src/native-ts/color-diff/index.ts',
  'audio-capture-napi': 'native/audio-capture-src/index.ts',
  'image-processor-napi': 'native/image-processor-src/index.ts',
  'modifiers-napi': 'native/modifiers-napi-src/index.ts',
  'url-handler-napi': 'native/url-handler-src/index.ts',
}

// Bun's source-level test loader does not apply the build/rebuild.mjs
// dependency resolver. Expose the exact same checked-in implementations as
// local package entries for this isolated CI test; no mock modules are used.
for (const [name, localPath] of Object.entries(adapters)) {
  const target = join(root, localPath)
  if (!existsSync(target)) throw new Error(`Missing production adapter: ${target}`)
  // In 333 the public node_modules directory may be a symlink into
  // .rebuild/public/node_modules. Compute relative paths from the physical
  // location Bun resolves, or an ESM re-export would point outside the repo.
  const packageDir = join(realpathSync(join(root, 'node_modules')), name)
  if (existsSync(packageDir)) throw new Error(`Unexpected pre-existing package: ${name}`)
  mkdirSync(packageDir, { recursive: true })
  const importPath = relative(packageDir, target).replaceAll('\\', '/')
  writeFileSync(join(packageDir, 'package.json'),
    JSON.stringify({ name, private: true, type: 'module', exports: './index.ts' }))
  writeFileSync(join(packageDir, 'index.ts'), `export * from '${importPath}'\n`)
}
