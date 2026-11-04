// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
function cyr(e){let n=e.indexOf("--handle-uri");if(n===-1||!e[n+1])return null;if(e.length>n+2)return`claude: rejected deep-link invocation \u2014 unexpected arguments after the URI.
`+"The OS protocol handler passes exactly `--handle-uri <uri>`; extra arguments indicate argument injection via the URL. If invoking --handle-uri manually, place other flags before it.";return null}
export{cyr};
