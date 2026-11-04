// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{STe,qL}from"./chunk-wxyh2ndv.js";import{i}from"./chunk-jdmxbspc.js";import{IV}from"./chunk-yp8dgdes.js";function SB(){return i.CLAUDE_CODE_REMOTE_SESSION_ORIGIN==="review"}function cP(){return IV()&&SB()}function aks(){return cP()?["CLAUDE_CODE_SESSION_ACCESS_TOKEN","CLAUDE_SESSION_INGRESS_TOKEN_FILE"]:[]}function OUi(r,e){if(!cP())return!1;if(r==="CLAUDE_CODE_SESSION_ACCESS_TOKEN"){if(e!=="")STe(e);return!0}if(r==="CLAUDE_CODE_OAUTH_TOKEN"){if(e!=="")qL(e);return!0}return!1}
export{SB,cP,aks,OUi};
