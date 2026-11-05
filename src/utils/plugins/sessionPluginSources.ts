import { randomBytes } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { mkdtemp, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises'
import { isIP } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { extractSessionZip } from './sessionZipExtractor.js'
import { registerCleanup } from '../cleanupRegistry.js'

const MAX_ZIP_BYTES = 64 * 1024 * 1024
const MAX_REDIRECTS = 4

function privateAddress(address: string): boolean {
  const v = address.toLowerCase()
  if (isIP(v) === 4) {
    const p = v.split('.').map(Number)
    return p[0] === 0 || p[0] === 10 || p[0] === 127 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      p[0] >= 224 || (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
  }
  if (isIP(v) === 6) {
    if (v === '::1' || v === '::' || v.startsWith('fe80:') ||
      v.startsWith('fc') || v.startsWith('fd')) return true
    if (v.startsWith('::ffff:')) return privateAddress(v.slice(7))
    return false
  }
  return true
}

type PublicTarget = {
  url: URL
  hostname: string
  addresses: Array<{ address: string; family: number }>
}

/**
 * The TLS socket must connect to an address validated at lookup time. Doing a
 * separate DNS preflight followed by fetch(url) allows rebinding between them.
 * TLS SNI, HTTP Host and certificate validation still use the original domain.
 */
export function createPinnedPluginLookup317(
  hostname: string,
  addresses: Array<{ address: string; family: number }>,
) {
  if (addresses.length === 0 || addresses.some(entry => privateAddress(entry.address))) {
    throw new Error('--plugin-url destination must be a public host')
  }
  return (requestedHost, options, callback) => {
    if (requestedHost !== hostname) {
      callback(new Error('Plugin download attempted to resolve an unexpected host'))
      return
    }
    if (options.all) callback(null, addresses)
    else callback(null, addresses[0].address, addresses[0].family)
  }
}

async function validateRemoteUrl(raw: string): Promise<PublicTarget> {
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('Invalid --plugin-url') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('--plugin-url requires an HTTPS URL without embedded credentials or custom ports')
  }
  const hostname = url.hostname.replace(/^\\[|\\]$/g, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('--plugin-url cannot access local services')
  }
  const family = isIP(hostname)
  const addresses = family
    ? [{ address: hostname, family }]
    : await lookup(hostname, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some(host => privateAddress(host.address))) {
    throw new Error('--plugin-url destination must be a public host')
  }
  return { url, hostname, addresses }
}

async function requestPinnedZip(target: PublicTarget): Promise<import('node:http').IncomingMessage> {
  const pinnedLookup = createPinnedPluginLookup317(target.hostname, target.addresses)
  return await new Promise((resolve, reject) => {
    const request = httpsRequest(target.url, {
      agent: false,
      lookup: pinnedLookup,
      signal: AbortSignal.timeout(30000),
      headers: { accept: 'application/zip, application/octet-stream' },
    }, resolve)
    request.once('error', reject)
    request.end()
  })
}

async function downloadZip(raw: string): Promise<Uint8Array> {
  let target = await validateRemoteUrl(raw)
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const response = await requestPinnedZip(target)
    if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
      const location = response.headers.location
      // Release the old TCP/TLS socket before opening the redirected endpoint.
      response.destroy()
      if (!location || i === MAX_REDIRECTS) throw new Error('Plugin download exceeded redirect limit')
      target = await validateRemoteUrl(new URL(location, target.url).href)
      continue
    }
    if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
      response.destroy()
      throw new Error(`Plugin download failed (HTTP ${response.statusCode})`)
    }
    const advertised = response.headers['content-length']
    if (advertised && Number(advertised) > MAX_ZIP_BYTES) {
      response.destroy()
      throw new Error('Plugin archive exceeds 64 MiB')
    }
    const parts: Uint8Array[] = []
    let length = 0
    try {
      for await (const chunk of response) {
        const bytes = chunk as Uint8Array
        length += bytes.length
        if (length > MAX_ZIP_BYTES) throw new Error('Plugin archive exceeds 64 MiB')
        parts.push(bytes)
      }
    } catch (error) {
      response.destroy()
      throw error
    }
    const out = new Uint8Array(length)
    let offset = 0
    for (const part of parts) { out.set(part, offset); offset += part.length }
    if (length < 4 || out[0] !== 0x50 || out[1] !== 0x4b || out[2] !== 3 || out[3] !== 4) {
      throw new Error('Downloaded plugin is not a ZIP archive')
    }
    return out
  }
  throw new Error('Plugin download exceeded redirect limit')
}

async function pluginRoots(directory: string): Promise<string[]> {
  const children = await readdir(directory, { withFileTypes:true })
  const rootManifest = await stat(join(directory,'.claude-plugin','plugin.json')).then(x=>x.isFile(),()=>false)
  if (rootManifest || children.some(x=>x.name==='skills'||x.name==='commands'||x.name==='agents')) {
    return [directory]
  }
  const possible = children.filter(x=>x.isDirectory())
  const found: string[]=[]
  for(const child of possible) {
    const dir=join(directory,child.name)
    if (await stat(join(dir,'.claude-plugin','plugin.json')).then(x=>x.isFile(),()=>false)) found.push(dir)
  }
  if(found.length>0)return found
  if (possible.length === 1) {
    const only = possible[0]
    if (only) return [join(directory, only.name)]
  }
  throw new Error('Plugin ZIP has no discoverable plugin manifest or directory')
}

/**
 * Prepare explicit session plugins, including local .zip and --plugin-url.
 * All extracted data lives in one session-scoped temporary directory.
 */
export async function prepareSessionPluginPaths(directories: string[], urls: string[]): Promise<string[]> {
  const hasZip = directories.some(p=>p.toLowerCase().endsWith('.zip'))
  if (!urls.length && !hasZip) return directories
  const root = await mkdtemp(join(tmpdir(),'claude-inline-plugins-'))
  registerCleanup(async()=>{ await rm(root,{recursive:true,force:true}) })
  const paths: string[]=[]
  let count=0
  for (const raw of directories) {
    if (!raw.toLowerCase().endsWith('.zip')) {
      paths.push(raw)
      continue
    }
    const location = resolve(raw)
    const buf = await readFile(location)
    if (buf.length>MAX_ZIP_BYTES) throw new Error('Local inline plugin ZIP exceeds 64 MiB')
    const dest=join(root,String(count++))
    await extractSessionZip(location,dest)
    paths.push(...await pluginRoots(dest))
  }
  for (const url of urls) {
    const buf=await downloadZip(url)
    const archive=join(root,`${count}-${randomBytes(4).toString('hex')}.zip`)
    const dest=join(root,String(count++))
    await writeFile(archive,buf,{mode:0o600})
    await extractSessionZip(archive,dest)
    paths.push(...await pluginRoots(dest))
  }
  return paths
}
