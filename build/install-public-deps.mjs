import { mkdirSync, symlinkSync, existsSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname,'..');
const npmroot = join(root,'.rebuild/public');
mkdirSync(npmroot,{recursive:true});
const versions = {
  "@alcalzone/ansi-tokenize": "^0.1.0",
  "@anthropic-ai/bedrock-sdk": "^0.26.4",
  "@anthropic-ai/foundry-sdk": "^0.2.3",
  "@anthropic-ai/mcpb": "^2.1.2",
  "@anthropic-ai/sandbox-runtime": "^0.0.44",
  "@anthropic-ai/sdk": "^0.52.0",
  "@anthropic-ai/vertex-sdk": "^0.14.4",
  "@aws-crypto/crc32": "*",
  "@aws-sdk/client-bedrock": "^3.1020.0",
  "@aws-sdk/client-bedrock-runtime": "^3.700.0",
  "@aws-sdk/client-sts": "^3.1020.0",
  "@aws-sdk/core": "*",
  "@aws-sdk/credential-provider-node": "*",
  "@aws-sdk/credential-providers": "*",
  "@azure/identity": "^4.13.1",
  "@azure/msal-common": "*",
  "@commander-js/extra-typings": "12.1.0",
  "@growthbook/growthbook": "^1.3.0",
  "@js-sdsl/ordered-map": "*",
  "@modelcontextprotocol/sdk": "^1.12.0",
  "@opentelemetry/api": "^1.9.0",
  "@opentelemetry/api-logs": "^0.57.0",
  "@opentelemetry/core": "^1.30.0",
  "@opentelemetry/exporter-logs-otlp-grpc": "^0.214.0",
  "@opentelemetry/exporter-logs-otlp-http": "^0.214.0",
  "@opentelemetry/exporter-logs-otlp-proto": "^0.214.0",
  "@opentelemetry/exporter-metrics-otlp-grpc": "^0.214.0",
  "@opentelemetry/exporter-metrics-otlp-http": "^0.214.0",
  "@opentelemetry/exporter-metrics-otlp-proto": "^0.214.0",
  "@opentelemetry/exporter-prometheus": "^0.214.0",
  "@opentelemetry/exporter-trace-otlp-grpc": "^0.214.0",
  "@opentelemetry/exporter-trace-otlp-http": "^0.214.0",
  "@opentelemetry/exporter-trace-otlp-proto": "^0.214.0",
  "@opentelemetry/resources": "^2.6.1",
  "@opentelemetry/sdk-logs": "^0.57.0",
  "@opentelemetry/sdk-metrics": "^1.30.0",
  "@opentelemetry/sdk-trace-base": "^1.30.0",
  "@opentelemetry/semantic-conventions": "^1.28.0",
  "@smithy/core": "*",
  "@smithy/node-http-handler": "*",
  "@typespec/ts-http-runtime": "*",
  "ajv": "^8.17.0",
  "asciichart": "^1.5.0",
  "auto-bind": "^5.0.0",
  "axios": "^1.7.0",
  "bidi-js": "^1.0.0",
  "bignumber.js": "*",
  "cacache": "*",
  "chalk": "^5.4.0",
  "chokidar": "^4.0.0",
  "cli-boxes": "^3.0.0",
  "cli-highlight": "*",
  "code-excerpt": "^4.0.0",
  "detect-libc": "*",
  "diff": "^7.0.0",
  "ecdsa-sig-formatter": "*",
  "emoji-regex": "^10.4.0",
  "env-paths": "^3.0.0",
  "execa": "^9.5.0",
  "fflate": "^0.8.2",
  "figures": "^6.1.0",
  "form-data": "*",
  "fuse.js": "^7.0.0",
  "get-east-asian-width": "^1.3.0",
  "google-auth-library": "^9.15.0",
  "graceful-fs": "*",
  "highlight.js": "^11.11.0",
  "https-proxy-agent": "^7.0.0",
  "human-signals": "*",
  "ignore": "^7.0.0",
  "indent-string": "^5.0.0",
  "jsonc-parser": "^3.3.0",
  "lodash-es": "^4.17.0",
  "lru-cache": "^11.0.0",
  "marked": "^15.0.0",
  "p-map": "^7.0.0",
  "picomatch": "^4.0.0",
  "pkce-challenge": "*",
  "plist": "*",
  "proper-lockfile": "^4.1.0",
  "protobufjs": "*",
  "qrcode": "^1.5.0",
  "react": "^19.1.0",
  "react-reconciler": "^0.33.0",
  "retry": "*",
  "semver": "^7.7.0",
  "sharp": "^0.34.5",
  "shell-quote": "^1.8.0",
  "signal-exit": "^4.1.0",
  "stack-utils": "^2.0.0",
  "strip-ansi": "^7.1.0",
  "supports-hyperlinks": "^3.1.0",
  "tree-kill": "^1.2.0",
  "tslib": "*",
  "turndown": "^7.2.2",
  "undici": "^7.3.0",
  "usehooks-ts": "^3.1.0",
  "vscode-jsonrpc": "^8.2.0",
  "wrap-ansi": "^9.0.0",
  "ws": "^8.18.0",
  "xss": "^1.0.0",
  "yaml": "^2.8.3",
  "zod": "^3.25.0"
};
writeFileSync(join(npmroot,'package.json'), JSON.stringify({private:true,name:'release-rebuild-dependencies',version:'2.1.88',dependencies:versions},null,2)+'\n');
const lock = join(root,'build/public-dependencies.lock.json');
const activeLock = join(npmroot,'package-lock.json');
if (existsSync(lock)) {
  const pinned = JSON.parse(readFileSync(lock,'utf8'));
  if (JSON.stringify(pinned.packages?.['']?.dependencies) !== JSON.stringify(versions)) {
    throw Error('Frozen npm package manifest does not match build/install-public-deps.mjs');
  }
  copyFileSync(lock,activeLock);
} else if (!existsSync(activeLock)) {
  // One-time bootstrap. The resulting lock must be committed before release.
  execFileSync('npm',['install','--prefix',npmroot,'--ignore-scripts','--no-audit','--no-fund','--legacy-peer-deps'],{stdio:'inherit'});
}
if (!existsSync(activeLock)) throw Error('A public dependency lockfile was not created');
if (!existsSync(lock)) copyFileSync(activeLock,lock);
const digest = createHash('sha256').update(readFileSync(lock)).digest('hex');
const marker = join(npmroot,'.installed-sha256');
const cached = existsSync(marker) && existsSync(join(npmroot,'node_modules','react','package.json')) && readFileSync(marker,'utf8') === digest;
if (!cached) {
  execFileSync('npm',['ci','--prefix',npmroot,'--ignore-scripts','--no-audit','--no-fund','--legacy-peer-deps'],{stdio:'inherit'});
  writeFileSync(marker,digest);
} else {
  console.log('Reusing installed packages from the frozen npm dependency lock');
}
if (!existsSync(join(npmroot,'node_modules'))) throw Error('npm dependency install failed');
symlinkSync(join(npmroot,'node_modules'),join(root,'node_modules'),'dir');
console.log('Installed published dependencies for independent source rebuild');
