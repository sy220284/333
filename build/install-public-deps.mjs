import { mkdirSync, symlinkSync, existsSync, realpathSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
function npm(args) {
  if (process.platform === 'win32') {
    const entry = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    if (!existsSync(entry)) throw Error(`npm CLI missing from the installed Node runtime: ${entry}`);
    execFileSync(process.execPath, [entry, ...args], {stdio:'inherit'});
    return;
  }
  execFileSync('npm', args, {stdio:'inherit'});
}
const root = resolve(import.meta.dirname,'..');
const buildVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const npmroot = join(root,'.rebuild/public');
mkdirSync(npmroot,{recursive:true});
const versions = {
  "@alcalzone/ansi-tokenize": "0.3.1",
  "@anthropic-ai/bedrock-sdk": "1.1.1",
  "@anthropic-ai/foundry-sdk": "1.1.1",
  "@anthropic-ai/mcpb": "2.1.2",
  "@anthropic-ai/sandbox-runtime": "0.0.81",
  "@anthropic-ai/sdk": "1.5.0",
  "@anthropic-ai/vertex-sdk": "1.1.2",
  "@aws-crypto/crc32": "5.2.0",
  "@aws-sdk/client-bedrock": "3.1162.0",
  "@aws-sdk/client-bedrock-runtime": "3.1162.0",
  "@aws-sdk/client-sts": "3.1162.0",
  "@aws-sdk/core": "3.980.0",
  "@aws-sdk/credential-provider-node": "3.972.93",
  "@aws-sdk/credential-providers": "3.1162.0",
  "@azure/identity": "4.14.1",
  "@azure/msal-common": "16.16.0",
  "@commander-js/extra-typings": "15.0.0",
  "@growthbook/growthbook": "2.0.0",
  "@js-sdsl/ordered-map": "4.4.2",
  "@modelcontextprotocol/client": "2.4.0",
  "@modelcontextprotocol/core": "2.4.0",
  "@modelcontextprotocol/server": "2.4.0",
  "@opentelemetry/api": "1.10.0",
  "@opentelemetry/core": "3.0.0",
  "@opentelemetry/exporter-logs-otlp-grpc": "0.300.0",
  "@opentelemetry/exporter-logs-otlp-http": "0.300.0",
  "@opentelemetry/exporter-logs-otlp-proto": "0.300.0",
  "@opentelemetry/exporter-metrics-otlp-grpc": "0.300.0",
  "@opentelemetry/exporter-metrics-otlp-http": "0.300.0",
  "@opentelemetry/exporter-metrics-otlp-proto": "0.300.0",
  "@opentelemetry/exporter-prometheus": "0.300.0",
  "@opentelemetry/exporter-trace-otlp-grpc": "0.300.0",
  "@opentelemetry/exporter-trace-otlp-http": "0.300.0",
  "@opentelemetry/exporter-trace-otlp-proto": "0.300.0",
  "@opentelemetry/resources": "3.0.0",
  "@opentelemetry/sdk-logs": "3.0.0",
  "@opentelemetry/sdk-metrics": "3.0.0",
  "@opentelemetry/sdk-trace": "3.0.0",
  "@opentelemetry/semantic-conventions": "1.44.0",
  "@smithy/core": "3.39.0",
  "@smithy/node-http-handler": "4.14.2",
  "@typespec/ts-http-runtime": "0.3.9",
  "ajv": "8.20.0",
  "asciichart": "1.5.25",
  "auto-bind": "5.0.1",
  "axios": "1.21.0",
  "bidi-js": "1.1.0",
  "bignumber.js": "11.1.5",
  "cacache": "21.0.1",
  "chalk": "6.0.1",
  "chokidar": "6.0.0",
  "cli-boxes": "4.0.1",
  "cli-highlight": "2.1.11",
  "code-excerpt": "4.0.0",
  "commander": "15.0.0",
  "detect-libc": "2.1.2",
  "diff": "9.0.0",
  "ecdsa-sig-formatter": "1.0.11",
  "emoji-regex": "11.0.0",
  "env-paths": "4.0.0",
  "execa": "10.2.1",
  "fflate": "0.8.3",
  "figures": "6.1.0",
  "form-data": "4.0.6",
  "fuse.js": "7.5.0",
  "get-east-asian-width": "1.7.0",
  "google-auth-library": "11.3.3",
  "graceful-fs": "4.2.11",
  "highlight.js": "11.12.0",
  "https-proxy-agent": "9.1.0",
  "human-signals": "8.0.1",
  "ignore": "7.0.14",
  "indent-string": "5.0.0",
  "jsonc-parser": "3.3.1",
  "lodash-es": "4.18.1",
  "lru-cache": "11.5.3",
  "marked": "18.1.3",
  "p-map": "7.1.1",
  "picomatch": "4.0.7",
  "pkce-challenge": "6.0.0",
  "plist": "5.0.0",
  "proper-lockfile": "4.1.2",
  "protobufjs": "8.8.1",
  "qrcode": "1.5.4",
  "react": "19.3.1",
  "react-reconciler": "0.34.0",
  "retry": "0.13.1",
  "semver": "7.8.6",
  "sharp": "0.35.5",
  "shell-quote": "1.12.0",
  "signal-exit": "4.1.0",
  "stack-utils": "2.0.6",
  "strip-ansi": "7.2.0",
  "supports-hyperlinks": "5.0.0",
  "tree-kill": "1.2.2",
  "tslib": "2.9.1",
  "turndown": "7.2.5",
  "undici": "8.12.3",
  "usehooks-ts": "3.1.1",
  "vscode-jsonrpc": "10.0.0",
  "vscode-languageserver-protocol": "3.18.5",
  "vscode-languageserver-types": "3.18.5",
  "wrap-ansi": "10.0.2",
  "ws": "8.22.1",
  "xss": "1.0.17",
  "yaml": "2.9.1",
  "zod": "4.6.7"
};
const overrides = {"tmp":"0.2.7","zod":"$zod"};
writeFileSync(join(npmroot,'package.json'), `${JSON.stringify({private:true,name:'release-rebuild-dependencies',version:buildVersion,dependencies:versions,overrides},null,2)}\n`);
const lock = join(root,'build/public-dependencies.lock.json');
const activeLock = join(npmroot,'package-lock.json');
if (existsSync(lock)) {
  const pinned = JSON.parse(readFileSync(lock,'utf8'));
  if (JSON.stringify(pinned.packages?.['']?.dependencies) !== JSON.stringify(versions)) {
    throw Error('Frozen npm package manifest does not match build/install-public-deps.mjs');
  }
  copyFileSync(lock,activeLock);
} else {
  throw Error('Missing checked-in build/public-dependencies.lock.json. Rebuild requires a pinned dependency graph.');
}
if (!existsSync(activeLock)) throw Error('The pinned dependency lockfile was not copied');
const digest = createHash('sha256').update(readFileSync(lock)).digest('hex');
const marker = join(npmroot,'.installed-sha256');
const cached = existsSync(marker) && existsSync(join(npmroot,'node_modules','react','package.json')) && readFileSync(marker,'utf8') === digest;
if (!cached) {
  npm(['ci','--prefix',npmroot,'--ignore-scripts','--no-audit','--no-fund','--legacy-peer-deps']);
  writeFileSync(marker,digest);
} else {
  console.log('Reusing installed packages from the frozen npm dependency lock');
}
if (!existsSync(join(npmroot,'node_modules'))) throw Error('npm dependency install failed');
const nodeModules = join(root,'node_modules');
const publicNodeModules = join(npmroot,'node_modules');
if (existsSync(nodeModules)) {
  if (realpathSync(nodeModules) !== realpathSync(publicNodeModules)) {
    throw Error('Root node_modules does not refer to the frozen public dependencies');
  }
} else {
  symlinkSync(publicNodeModules,nodeModules,process.platform === 'win32' ? 'junction' : 'dir');
}
console.log('Installed published dependencies for independent source rebuild');
