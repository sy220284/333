import { constants } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, win32 } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

// 2.1.310 chunk-veg1r3k2.js: trusted settings precede project/local tips.
const TRUSTED = ['policySettings', 'flagSettings', 'userSettings']
const UNTRUSTED = ['projectSettings', 'localSettings']
const MAX_TIPS: 200 = 200
const MAX_TIP_LENGTH = 500
const MAX_FILE_BYTES = 262144
const VALID_ID = /^[A-Za-z0-9._-]{1,64}$/
const TRANSIENT_ERRORS = new Set(['EAGAIN', 'EBUSY', 'EINTR', 'EIO', 'EMFILE', 'ENFILE'])
const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g
// The target removes individual variation selectors as well as control characters.
// biome-ignore lint/suspicious/noMisleadingCharacterClass: each code point is intentionally removed
const INVISIBLE = /[\p{Cc}\p{Cf}\u2028\u2029\u180e\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/gu

function cleanText(value) {
  return stripVTControlCharacters(value.replace(UNPAIRED_SURROGATE, ''))
    .replace(/[\t\n\r\u2028\u2029]+/g, ' ')
    .replace(INVISIBLE, '')
    .replace(/ {2,}/g, ' ')
    .trim()
}

function cleanLabel(value) {
  if (value === undefined) return 'Tip'
  let label = cleanText(value)
  if (label.length > 40) {
    label = label.slice(0, 40)
    if (/[\uD800-\uDBFF]$/.test(label)) label = label.slice(0, -1)
  }
  return label || 'Tip'
}

function isNetworkPath(value) {
  const devicePath = /^[\\/]\?\?[\\/]/
  return /^[\\/]{2}/.test(value) || devicePath.test(value) ||
    value.includes('??') && devicePath.test(win32.normalize(value))
}

function localFilePath(value, warn) {
  if (!value) return undefined
  if (!isAbsolute(value) && value !== '~' && !value.startsWith('~/')) {
    warn('spinnerTipsOverride.tipsFile must be an absolute or ~/ path')
    return undefined
  }
  if (isNetworkPath(value)) {
    warn('spinnerTipsOverride.tipsFile must be a local path')
    return undefined
  }
  const result = value === '~' ? homedir() : value.startsWith('~/') ? join(homedir(), value.slice(2)) : value
  if (isNetworkPath(result)) return undefined
  return result
}

async function readFileTips(path, warn) {
  try {
    const flags = process.platform === 'win32' ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK
    const handle = await open(await realpath(path), constants.O_RDONLY | flags)
    let text
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
        warn('spinnerTipsOverride.tipsFile is not a regular file or is too large')
        return { entries: [], transient: false }
      }
      const buffer = Buffer.alloc(MAX_FILE_BYTES + 1)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      if (bytesRead > MAX_FILE_BYTES) {
        warn('spinnerTipsOverride.tipsFile is too large')
        return { entries: [], transient: false }
      }
      text = buffer.toString('utf8', 0, bytesRead).replace(/^\uFEFF/, '')
    } finally {
      await handle.close()
    }
    const parsed = JSON.parse(text)
    const entries = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? parsed.tips : undefined
    if (!Array.isArray(entries)) {
      warn('spinnerTipsOverride.tipsFile must contain a tips array')
      return { entries: [], transient: false }
    }
    return { entries: entries.filter(item => typeof item === 'string' || !!item && typeof item === 'object' && !Array.isArray(item)), transient: false }
  } catch (error) {
    warn(`spinnerTipsOverride.tipsFile could not be read: ${error.message}`)
    return { entries: [], transient: TRANSIENT_ERRORS.has(error.code) }
  }
}

/** Create one provider per process so trusted files are read once. */
export function createCustomTipProvider({ getOverride, isEnabled, remotePolicyHasTipsFile, warn }) {
  const fileCache = new Map()
  const sources = names => names.flatMap(source => {
    if (!isEnabled(source)) return []
    const override = getOverride(source)
    return override ? [{ source, override }] : []
  })
  const firstDefined = (items, field) => items.find(item => item.override[field] !== undefined)?.override[field]
  function suppressDefault() {
    const trusted = sources(TRUSTED)
    return firstDefined(trusted, 'excludeDefault') === true &&
      trusted.some(({ override }) => !!override.tipsFile || (override.tips?.length ?? 0) > 0)
  }
  async function loadFile(path) {
    let pending = fileCache.get(path)
    if (!pending) {
      pending = readFileTips(path, warn)
      fileCache.set(path, pending)
    }
    const result = await pending
    if (result.transient && fileCache.get(path) === pending) fileCache.delete(path)
    return result.entries
  }
  async function collect() {
    const trusted = sources(TRUSTED)
    const untrusted = sources(UNTRUSTED)
    const label = cleanLabel(firstDefined(trusted, 'label'))
    const fileSource = trusted.find(({ override }) => !!override.tipsFile)
    const remoteFile = fileSource?.source === 'policySettings' && remotePolicyHasTipsFile()
    if (remoteFile) warn('spinnerTipsOverride.tipsFile from remote managed settings is ignored')
    const path = remoteFile ? undefined : localFilePath(fileSource?.override.tipsFile, warn)
    const fileTips = path ? await loadFile(path) : []
    const tips = []
    const seen = new Set()
    let index = 0
    function add(entry, fallbackId, tipLabel) {
      let id = fallbackId, text = entry, cooldownSessions = 0, priority = 0
      if (typeof entry !== 'string') {
        if (!entry || typeof entry.text !== 'string' || typeof entry.id !== 'string' || !VALID_ID.test(entry.id)) {
          warn('spinnerTipsOverride: object tip needs a valid id and text')
          return
        }
        id = `org-tip:${entry.id}`
        text = entry.text
        if (Number.isInteger(entry.cooldownSessions) && entry.cooldownSessions >= 0) cooldownSessions = Math.min(entry.cooldownSessions, 1000)
        if (typeof entry.priority === 'number' && Number.isFinite(entry.priority)) priority = Math.max(-10, Math.min(10, Math.trunc(entry.priority)))
      }
      if (tips.length >= MAX_TIPS) return
      const content = cleanText(text)
      if (!content || content.length > MAX_TIP_LENGTH || seen.has(id)) {
        warn('spinnerTipsOverride: empty, overlong or duplicate tip')
        return
      }
      seen.add(id)
      tips.push({ id, label: tipLabel, content: async () => content, cooldownSessions, priority, isRelevant: async () => true, providerAgnostic: true })
    }
    for (const { source, override } of trusted) {
      for (const entry of override.tips ?? []) add(entry, `custom-tip-${index++}`, label)
      if (source === fileSource?.source) fileTips.forEach((entry, i) => { add(entry, `org-tip:file:${i}`, label) })
    }
    const trustedCount = tips.length
    for (const { source, override } of untrusted) {
      if (override.tipsFile || override.label !== undefined) warn(`spinnerTipsOverride.tipsFile/label in ${source} are ignored`)
      for (const entry of override.tips ?? []) {
        const id = `custom-tip-${index++}`
        if (typeof entry === 'string') add(entry, id, 'Tip')
        else warn(`spinnerTipsOverride object tip in ${source} is ignored`)
      }
    }
    return { tips, trustedCount }
  }
  return { collect, suppressDefault }
}
