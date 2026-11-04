// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{createHash as r}from"crypto";var FS=/^[0-9a-f]{64}$/;function rt(e){if(typeof e!=="string"&&!ArrayBuffer.isView(e))throw Object.assign(TypeError("sha256Hex: the data is neither text nor bytes"),{code:"ERR_INVALID_ARG_TYPE"});return r("sha256").update(e).digest("hex")}
export{FS,rt};
