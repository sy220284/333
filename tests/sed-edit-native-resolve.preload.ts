import { resolve } from 'node:path'

// The independent production rebuild maps native NAPI modules to checked-in
// TypeScript/native adapters. Register those same real implementations for
// Bun's direct source-level test loader.
const nativeAdapters: Record<string, string> = {
  'color-diff-napi': '../src/native-ts/color-diff/index.ts',
  'audio-capture-napi': '../native/audio-capture-src/index.ts',
  'image-processor-napi': '../native/image-processor-src/index.ts',
  'modifiers-napi': '../native/modifiers-napi-src/index.ts',
  'url-handler-napi': '../native/url-handler-src/index.ts',
}
Bun.plugin({
  name: 'm1-release-native-adapters',
  setup(build) {
    build.onResolve({ filter: /^(color-diff-napi|audio-capture-napi|image-processor-napi|modifiers-napi|url-handler-napi)$/ }, args => {
      const adapter = nativeAdapters[args.path]
      if (adapter === undefined) throw new Error(`Unknown native adapter: ${args.path}`)
      return { path: resolve(import.meta.dir, adapter) }
    })
  },
})

