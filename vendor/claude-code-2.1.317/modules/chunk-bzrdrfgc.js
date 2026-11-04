// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var pye="claude.ai ",AV="claude_ai_";function yn(t){let r=t.replace(/[^a-zA-Z0-9_-]/g,"_");if(t.startsWith("claude.ai "))r=r.replace(/_+/g,"_").replace(/^_|_$/g,"");return r}var e="claudeai_";function bB(t){return yn(t).toLowerCase().replace(/[-_]+/g,"_").replace(/^_|_$/g,"")}var GFi="org-connector-",fvs=128;function EWe(t){if(t.length>fvs)return!1;let r=`${bB(t)}_`;return r.startsWith("org_connector_")||r.startsWith("orgconnector_")}function vpt(t){let r=`${bB(t)}_`;return r.startsWith("claude_ai_")||r.startsWith(e)}
export{pye,AV,yn,bB,GFi,fvs,EWe,vpt};
