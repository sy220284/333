/** 自托管 Runner 仅连接用户明确指定的执行服务，不继承模型服务商云端地址。 */
export function resolveRunnerEndpoint(value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error('请通过 --api-url 或 SELF_HOSTED_RUNNER_API_URL 明确指定本地或自托管 Runner 服务地址')
  }
  let url: URL
  try {
    url = new URL(value.trim())
  } catch (error) {
    throw new Error('Runner 服务地址不是有效 URL', { cause: error })
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Runner 服务地址必须为不含凭据、路径、查询和片段的服务根地址')
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('远程 Runner 服务必须使用 HTTPS；本机 localhost/127.0.0.1/::1 允许 HTTP')
  }
  if (host === 'anthropic.com' || host.endsWith('.anthropic.com') ||
      host === 'claude.ai' || host.endsWith('.claude.ai') ||
      host === 'ant.dev' || host.endsWith('.ant.dev')) {
    throw new Error('Runner 的官方云端地址已停用，请配置自己的本地或自托管执行服务')
  }
  return url.origin
}
