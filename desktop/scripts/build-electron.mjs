import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
await mkdir(resolve(root, 'dist-electron'), { recursive: true })
for (const entry of ['main', 'preload']) {
  await build({
    entryPoints: [resolve(root, 'electron', `${entry}.ts`)],
    outfile: resolve(root, 'dist-electron', `${entry}.cjs`),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: ['electron'],
    sourcemap: true,
    logLevel: 'info'
  })
}
