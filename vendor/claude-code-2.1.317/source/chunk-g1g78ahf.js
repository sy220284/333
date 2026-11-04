// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{D}from"/$bunfs/root/chunk-shqxr5r7.js";var Dn="SendMessage",vLn="ccd_session_mgmt",FDt=200,quo=["type","recipient","recipient_kind","content","request_id","approve"];function __s(e){return"to"in e&&(("message"in e)||("notify_when_idle"in e))}function TQt(e){if(!D(e)||!__s(e)||!quo.some((n)=>(n in e)))return;let o={...e};for(let n of quo)delete o[n];return o}
export{Dn,vLn,FDt,quo,__s,TQt};
