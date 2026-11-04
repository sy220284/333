// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{eEs}from"/$bunfs/root/chunk-nj8ddyrh.js";import{cke,Uje,gQ}from"/$bunfs/root/chunk-mf6cjfte.js";function QEe(){if(!cke())throw Error("the MDM settings have not been read yet");if(gQ())throw Error("an admin-owned settings document could not be read");if(eEs()!==void 0)throw Error("the managed-settings path was overridden");let e=Uje()[0]?.forceLoginOrgUUID;if(e===void 0)return;return typeof e==="string"?[e]:e}
export{QEe};
