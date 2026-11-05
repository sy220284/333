export declare const NATIVE_317_API_VERSION: '2023-06-01'
export declare function native317RequestHeaders(
  input: RequestInfo | URL,
  init?: RequestInit,
): Headers

export declare function native317MessagesRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { apiKey?: string },
): { input: RequestInfo | URL; init: RequestInit | undefined }
