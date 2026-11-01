/** Claude OAuth API and persisted token contracts derived from 2.1.88 consumers. */
export type SubscriptionType = 'pro' | 'max' | 'team' | 'enterprise'
export type RateLimitTier = string
export type BillingType = string

export interface OAuthProfileResponse {
  account: {
    uuid: string
    email: string
    display_name?: string | null
    created_at?: string
    has_claude_max?: boolean
    has_claude_pro?: boolean
  }
  organization: {
    uuid: string
    organization_type?: string
    rate_limit_tier?: RateLimitTier | null
    has_extra_usage_enabled?: boolean | null
    billing_type?: BillingType | null
    subscription_created_at?: string | null
  }
}

export interface OAuthTokenExchangeResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
  account?: { uuid: string; email_address: string }
  organization?: { uuid: string }
}

export interface OAuthTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
  scopes: string[]
  subscriptionType: SubscriptionType | null
  rateLimitTier: RateLimitTier | null
  profile?: OAuthProfileResponse
  tokenAccount?: { uuid: string; emailAddress: string; organizationUuid?: string }
}

export interface UserRolesResponse {
  organization_role?: string
  workspace_role?: string
  organization_name?: string
}

export type ReferralCampaign = 'claude_code_guest_pass'

export interface ReferrerRewardInfo {
  currency: string
  amount_minor_units: number
}

export interface ReferralEligibilityResponse {
  eligible: boolean
  remaining_passes?: number
  referral_code_details?: { referral_link?: string; campaign?: ReferralCampaign }
  referrer_reward?: ReferrerRewardInfo | null
}

export interface ReferralRedemptionsResponse {
  redemptions?: Array<Record<string, unknown>>
  limit?: number
}
