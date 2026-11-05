export function classifySdkCallbackFailure(
  onFailure: 'block' | undefined,
  error: unknown,
): { blocked: boolean; detail: string }
