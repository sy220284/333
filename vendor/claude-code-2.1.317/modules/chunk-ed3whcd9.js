// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{sa}from"./chunk-9x9nwakp.js";import{rD}from"./chunk-v3d60sym.js";function qZe(r){return r instanceof Error&&"code"in r&&r.code==="CLAUDEAI_BEARER_REJECTED"}function cdn(r){if(r instanceof rD)return!0;if(qZe(r))return!1;if(r instanceof Error&&!(r instanceof sa)&&"code"in r){if(r.code===403)return!r.message.includes("Server returned 403 after trying upscoping");if(r.code===401)return!r.message.includes("Server returned 401 after successful authentication")}return!1}
export{qZe,cdn};
