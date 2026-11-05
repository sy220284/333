export declare const ACCOUNT_EMAIL_DISCLOSURE_REASON: string
export declare function shouldConfirmAccountEmailDisclosure(
  toolName: string,
  input: Record<string, unknown>,
  email: string | undefined,
): boolean
