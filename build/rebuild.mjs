import { existsSync, mkdirSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, resolve } from 'node:path';

if (typeof Bun === 'undefined' || !Bun.build) throw Error('Bun bundler required');
const root = resolve(import.meta.dir, '..');
const snapshot = join(root, '.rebuild/deps/node_modules');
if (!existsSync(snapshot)) throw Error('Run node build/restore-dependencies.mjs first');
const builtins = new Set(builtinModules.map(x => x.replace(/^node:/, '')));
const native = {
  'audio-capture-napi': 'audio-capture-src',
  'image-processor-napi': 'image-processor-src',
  'modifiers-napi': 'modifiers-napi-src',
  'url-handler-napi': 'url-handler-src',
};
function isFile(f) {
  return existsSync(f) && statSync(f).isFile();
}
function candidates(base) {
  const options = [];
  for (const ext of ['', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.json']) options.push(base + ext);
  const prefixes = ['', 'source', 'src', 'build/src', 'build', 'dist/esm', 'dist/mjs', 'dist', 'lib', 'esm', 'cjs'];
  for (const prefix of prefixes) for (const entry of ['index.js','index.mjs','index.ts','index.tsx','index.cjs']) {
    options.push(join(base, prefix, entry));
  }
  return options;
}
function resolvePackage(moduleId) {
  if (moduleId === 'react') return join(snapshot, 'react/cjs/react.production.js');
  if (moduleId === 'react/compiler-runtime') return join(snapshot, 'react/cjs/react-compiler-runtime.production.js');
  const parts = moduleId.split('/');
  const scoped = parts[0].startsWith('@');
  const pkg = scoped ? parts.slice(0, 2).join('/') : parts[0];
  const remainder = parts.slice(scoped ? 2 : 1).join('/');
  const base = join(snapshot, pkg);
  const paths = remainder
    ? [join(base, remainder), ...['source','src','build/src','build','dist/esm','dist/mjs','dist','lib','esm'].map(x => join(base,x,remainder))]
    : [base];
  for (const p of paths) for (const c of candidates(p)) if (isFile(c)) return c;
  return undefined;
}
function localFile(id) {
  const base = join(root, id);
  return [base,base.replace(/\.js$/,'.ts'),base.replace(/\.js$/,'.tsx'),join(base,'index.ts')].find(isFile);
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
      const path = resolvePackage(id);
      if (path) return { path };
      unresolved.add(id);
    });
  },
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
  jsx: { runtime: 'classic', factory: 'React.createElement', fragment: 'React.Fragment', importSource: 'react', sideEffects: false, development: false },
  define: { 'process.env.USER_TYPE': '"external"', 'process.env.NODE_ENV': '"production"' },
  plugins: [plugin],
});
if (!result.success) {
  for (const error of result.logs) console.error(error);
  console.error('Unresolved public dependency modules: ' + [...unresolved].sort().join(', '));
  process.exitCode = 1;
} else {
  console.log('Compiled ' + result.outputs.length + ' artifacts from extracted source');
}
