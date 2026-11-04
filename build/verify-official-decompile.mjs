import { createHash } from 'node:crypto'
import { createReadStream, openSync, closeSync, readSync, readFileSync, lstatSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Reproducible C19-T01 source-of-truth check: every extracted Bun module must
// match both its decompiler manifest and the ORIGINAL executable bytes.
// This check intentionally never rewrites the decompilation or the repository.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
function argument(flag) {
  const index = argv.indexOf(flag)
  if (index === -1 || !argv[index + 1] || argv[index + 1].startsWith('--')) {
    throw new Error(`Required argument missing: ${flag}`)
  }
  return resolve(argv[index + 1])
}
const decompiled = argument('--decompiled')
const binary = argument('--binary')
const sourceDir = join(decompiled, '01_完整嵌入文件_原样')
const catalog = JSON.parse(readFileSync(join(decompiled, '00_说明和核验/模块总清单.json'), 'utf8'))
const release = JSON.parse(readFileSync(join(projectRoot, 'docs/upgrade/m1-evidence/target-release.json'), 'utf8'))
const expectedVersion = release.target_version
const expectedHash = release.verified_x64_sha256
const hexHash = bytes => createHash('sha256').update(bytes).digest('hex')

function regularFile(path) {
  if (!lstatSync(path).isFile()) throw new Error(`File is not regular: ${path}`)
  return statSync(path).size
}
async function sha256File(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}
const binarySize = regularFile(binary)
const actualBinaryHash = await sha256File(binary)
if (catalog.release !== `${expectedVersion}-linux-x64` ||
    catalog.input_sha256 !== expectedHash ||
    actualBinaryHash !== expectedHash) {
  throw new Error(`Official binary/source release mismatch: ${catalog.release} ${actualBinaryHash}`)
}
if (!Array.isArray(catalog.files) || catalog.module_count !== catalog.files.length ||
    catalog.files.length === 0) throw new Error('Invalid or incomplete Bun module catalog')
const seen = new Set()
const fd = openSync(binary, 'r')
let byteCount = 0
const byLoader = {}
try {
  for (const record of catalog.files) {
    const { file, size, sha256, offset_in_executable: offset } = record
    if (typeof file !== 'string' || !file || file === '.' || file === '..' ||
        isAbsolute(file) || file.includes('\\') || file.split('/').some(part => !part || part === '.' || part === '..') || seen.has(file)) {
      throw new Error(`Invalid/duplicate embedded path: ${file}`)
    seen.add(file)
    if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(offset) ||
        offset < 0 || offset + size > binarySize || !/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error(`Invalid module bounds/hash: ${file}`)
    }
    const extractedPath = join(sourceDir, file)
    if (regularFile(extractedPath) !== size) throw new Error(`Module size mismatch: ${file}`)
    const actual = readFileSync(extractedPath)
    if (hexHash(actual) !== sha256) throw new Error(`Module digest mismatch: ${file}`)
    const nativeBytes = Buffer.allocUnsafe(size)
    let consumed = 0
    while (consumed < size) {
      const count = readSync(fd, nativeBytes, consumed, size - consumed, offset + consumed)
      if (!count) throw new Error(`Unexpected EOF while verifying: ${file}`)
      consumed += count
    byteCount += size
    byLoader[record.loader] = (byLoader[record.loader] ?? 0) + 1
  }
} finally {
  closeSync(fd)
}
if (catalog.total_extracted_bytes !== byteCount) {
  throw new Error(`Catalog byte count mismatch: ${catalog.total_extracted_bytes} != ${byteCount}`)
}
process.stdout.write(`${JSON.stringify({
  result: 'PASS', version: expectedVersion, binary_sha256: actualBinaryHash,
  extracted_modules: seen.size, verified_original_bytes: byteCount, by_loader: byLoader,
})}\n`)
