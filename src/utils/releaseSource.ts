/** Explicit independent distribution source; prevents silently replacing 摇摇车 with another product. */
export function getIndependentReleaseBaseUrl(): string {
  const source = process.env.YAOYAOCHE_NATIVE_RELEASE_BASE_URL?.trim()
  if (!source) {
    throw new Error('摇摇车 当前尚未配置独立原生安装包发行源。发布独立安装包后请设置 YAOYAOCHE_NATIVE_RELEASE_BASE_URL。')
  }
  let url: URL
  try {
    url = new URL(source)
  } catch {
    throw new Error('YAOYAOCHE_NATIVE_RELEASE_BASE_URL 必须是完整的 HTTPS 地址')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('摇摇车 原生发行源必须是无凭据、无查询参数的 HTTPS 目录地址')
  }
  if (/claude-code-dist|anthropic/i.test(url.href)) {
    throw new Error('摇摇车 原生更新需要独立发行包源，不能使用 Claude Code 原厂下载地址')
  }
  return url.href.replace(/\/$/, '')
}
