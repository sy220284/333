/** 本地 Whisper 语言参数解析；与 React 和官方服务端解耦。 */
const DEFAULT_STT_LANGUAGE = 'auto'

// 将语言偏好映射为 Whisper CLI 接受的语言代码；未知设置使用 auto 自动检测。
const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
  english: 'en',
  chinese: 'zh',
  mandarin: 'zh',
  中文: 'zh',
  简体中文: 'zh',
  繁體中文: 'zh',
  汉语: 'zh',
  漢語: 'zh',
  arabic: 'ar',
  العربية: 'ar',
  vietnamese: 'vi',
  'tiếng việt': 'vi',
  thai: 'th',
  ไทย: 'th',
  spanish: 'es',
  español: 'es',
  espanol: 'es',
  french: 'fr',
  français: 'fr',
  francais: 'fr',
  japanese: 'ja',
  日本語: 'ja',
  german: 'de',
  deutsch: 'de',
  portuguese: 'pt',
  português: 'pt',
  portugues: 'pt',
  italian: 'it',
  italiano: 'it',
  korean: 'ko',
  한국어: 'ko',
  hindi: 'hi',
  हिन्दी: 'hi',
  हिंदी: 'hi',
  indonesian: 'id',
  'bahasa indonesia': 'id',
  bahasa: 'id',
  russian: 'ru',
  русский: 'ru',
  polish: 'pl',
  polski: 'pl',
  turkish: 'tr',
  türkçe: 'tr',
  turkce: 'tr',
  dutch: 'nl',
  nederlands: 'nl',
  ukrainian: 'uk',
  українська: 'uk',
  greek: 'el',
  ελληνικά: 'el',
  czech: 'cs',
  čeština: 'cs',
  cestina: 'cs',
  danish: 'da',
  dansk: 'da',
  swedish: 'sv',
  svenska: 'sv',
  norwegian: 'no',
  norsk: 'no',
}

// 本地 Whisper 可识别的常用语言；完整语言检测可使用 auto。
const SUPPORTED_LANGUAGE_CODES = new Set([
  'auto',
  'zh',
  'ar',
  'vi',
  'th',
  'en',
  'es',
  'fr',
  'ja',
  'de',
  'pt',
  'it',
  'ko',
  'hi',
  'id',
  'ru',
  'pl',
  'tr',
  'nl',
  'uk',
  'el',
  'cs',
  'da',
  'sv',
  'no',
])

// 将系统语言、语言名称或区域代码规范化为本地 Whisper 语言参数。
export function normalizeLanguageForSTT(language: string | undefined): {
  code: string
  fellBackFrom?: string
} {
  if (!language) return { code: DEFAULT_STT_LANGUAGE }
  const lower = language.toLowerCase().trim()
  if (!lower) return { code: DEFAULT_STT_LANGUAGE }
  if (SUPPORTED_LANGUAGE_CODES.has(lower)) return { code: lower }
  const fromName = LANGUAGE_NAME_TO_CODE[lower]
  if (fromName) return { code: fromName }
  const base = lower.split('-')[0]
  if (base && SUPPORTED_LANGUAGE_CODES.has(base)) return { code: base }
  return { code: DEFAULT_STT_LANGUAGE, fellBackFrom: language }
}

