// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Xd}from"/$bunfs/root/chunk-q4dxzstm.js";function EYs(t){if(Xd())return;return t.remoteSessionName??t.standaloneAgentContext?.name}function jet(t,e){let n=t.standaloneAgentContext;if(!Object.keys(e).some((o)=>n?.[o]!==e[o]))return t;return{...t,standaloneAgentContext:{...n,name:n?.name??"",...e}}}
export{EYs,jet};
