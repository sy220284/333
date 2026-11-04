// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
function rq(r){try{if(!Bun.ant.setDumpable(!1))r("prctl(PR_SET_DUMPABLE,0) returned nonzero")}catch(e){r(`prctl unavailable: ${e instanceof Error?e.message:String(e)}`)}}
export{rq};
