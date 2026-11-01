import { existsSync, mkdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, extname, resolve } from 'node:path';

if (typeof Bun === 'undefined' || !Bun.build) throw Error('Bun bundler required');
const root = resolve(import.meta.dir, '..');
const snapshot = join(root, '.rebuild/deps/node_modules');
if (!existsSync(snapshot)) throw Error('Run node build/restore-dependencies.mjs first');
const builtins = new Set(builtinModules.map(x => x.replace(/^node:/, '')));
const native = {
  'audio-capture-napi': 'audio-capture-src',
  'image-processor-napi': 'image-processor-src',
  'modifiers-napi': 'modifiers-napi-src',
  'url-handler-napi': 'url-handler-src'
};
function snapshotFile(id) {
  const base = join(snapshot, id);
  const candidates = [];
  if (id === 'react') candidates.push(join(base, 'cjs/react.production.js'));
  if (id === 'react/compiler-runtime') candidates.push(join(snapshot, 'react/cjs/react-compiler-runtime.production.js'));
  candidates.push(base);
  for (const extension of ['.js','.mjs','.cjs','.ts','.tsx','.json']) candidates.push(base + extension);
  for (const suffix of ['index.js','index.mjs','index.ts','index.tsx','dist/esm/index.js','dist/index.js','src/index.ts','lib/index.js','esm/index.mjs','index.cjs']) candidates.push(join(base, suffix));
  return candidates.find(x => extname(x) && existsSync(x));
}
function localFile(id) {
  const name = join(root, id);
  const paths = [name, name.replace(/\.js$/, '.ts'), name.replace(/\.js$/, '.tsx'), join(name, 'index.ts')];
  return paths.find(x => extname(x) && existsSync(x));
}
const unresolved = new Set();
const plugin = {
  name: 'frozen-release-dependencies',
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, args => {
      const id = args.path;
      if (id.startsWith('node:') || id.startsWith('bun:') || builtins.has(id)) return;
      if (id.startsWith('src/')) {
        const path = localFile(id);
        if (path) return { path };
        return;
      }
      if (native[id]) return { path: join(root, 'native', native[id], 'index.ts') };
      const path = snapshotFile(id);
      if (path) return { path };
      unresolved.add(id);
    });
  }
};
mkdirSync(join(root, 'dist'), { recursive: true });
const result = await Bun.build({
  entrypoints: [join(root, 'src/main.tsx')],
  outdir: join(root, 'dist'),
  target: 'node',
  format: 'esm',
  sourcemap: 'external',
  splitting: false,
  features: [],
  minify: false,
  define: { 'process.env.USER_TYPE': '"external"' },
  plugins: [plugin]
});
if (!result.success) {
  for (const error of result.logs) console.error(error);
  console.error('Unresolved public dependency modules: ' + [...unresolved].sort().join(', '));
  process.exitCode = 1;
} else {
  console.log('Compiled ' + result.outputs.length + ' artifacts from extracted source');
}
