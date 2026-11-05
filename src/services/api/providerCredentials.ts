/**
 * Native cloud credential providers shared by interactive Claude API sessions
 * and the enterprise gateway. Keep credential ownership per SDK client, so
 * one tenant's identity and refresh state cannot leak into another request.
 */
export const FOUNDRY_AZURE_SCOPE = 'https://cognitiveservices.azure.com/.default'

/**
 * Azure Identity's native provider keeps one DefaultAzureCredential per SDK
 * client and handles token expiration/refresh. The SDK calls it when needed.
 * Loading the dependency remains lazy for users who do not use Foundry.
 */
export async function createFoundryAzureTokenProvider(): Promise<() => Promise<string>> {
  const { DefaultAzureCredential, getBearerTokenProvider } = await import('@azure/identity')
  return getBearerTokenProvider(
    new DefaultAzureCredential(),
    FOUNDRY_AZURE_SCOPE,
  )
}
