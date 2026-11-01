/** Credential storage contract, verified against each 2.1.88 backend and consumer. */
export interface SecureStorage {
  readonly name: string
  read(): SecureStorageData | null
  readAsync(): Promise<SecureStorageData | null>
  update(data: SecureStorageData): { success: boolean; warning?: string }
  delete(): boolean
}

/** Persisted MCP discovery metadata; avoid persisting full SDK responses on macOS. */
export interface StoredMcpDiscoveryState {
  authorizationServerUrl: string
  resourceMetadataUrl?: string
  resourceMetadata?: Record<string, unknown>
  authorizationServerMetadata?: Record<string, unknown>
}

export interface StoredMcpOAuth {
  serverName: string
  serverUrl: string
  accessToken: string
  expiresAt: number
  refreshToken?: string
  scope?: string
  clientId?: string
  clientSecret?: string
  stepUpScope?: string
  discoveryState?: StoredMcpDiscoveryState
}

/** Data stored in macOS Keychain or .credentials.json, not ordinary settings. */
export interface SecureStorageData {
  claudeAiOauth?: {
    accessToken: string
    refreshToken: string | null
    expiresAt: number | null
    scopes: string[]
    subscriptionType: string | null
    rateLimitTier: string | null
  }
  mcpOAuth?: Record<string, StoredMcpOAuth>
  mcpOAuthClientConfig?: Record<string, { clientSecret?: string }>
  mcpXaaIdp?: Record<string, { idToken: string; expiresAt: number }>
  mcpXaaIdpConfig?: Record<string, { clientSecret: string }>
  trustedDeviceToken?: string
  pluginSecrets?: Record<string, Record<string, string>>
}
