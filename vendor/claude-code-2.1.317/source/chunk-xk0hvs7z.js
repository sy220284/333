// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Mi,Wi,UA,tc,tD}from"/$bunfs/root/chunk-ycr3h5db.js";function mKe(r){return r instanceof Error&&"code"in r&&r.code==="CLAUDEAI_BEARER_REJECTED"}function Qfn(r){if(r instanceof tD)return!0;if(mKe(r))return!1;if(r instanceof UA&&(r.status===403||r.status===401))return r.code!==Mi.ClientHttpAuthentication&&r.code!==Mi.ClientHttpForbidden;if(r instanceof Error&&!(r instanceof tc)&&!(r instanceof Wi)&&"code"in r&&(r.code===403||r.code===401))return!0;return!1}
export{mKe,Qfn};
