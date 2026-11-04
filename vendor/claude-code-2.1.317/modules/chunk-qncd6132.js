// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{kb}from"./chunk-wxyh2ndv.js";import{ee,BG}from"./chunk-f95bhbz8.js";import{Pa}from"./chunk-50jvyf08.js";var n="Error POSTing to endpoint: MCP server not allowed";function TAi(t){if(!(t instanceof Error))return!1;let e=t.message.trimEnd();if(e===`Streamable HTTP error: ${n}`)return"code"in t&&t.code===403;if(e!==n)return!1;return"status"in t?t.status===403:("telemetryMessage"in t)&&typeof t.telemetryMessage==="string"&&t.telemetryMessage.startsWith("SdkHttpError ")}function fOe(){return(kb()??[]).find((t)=>t.name===Pa)}function Aas(){return BG()?ee().mcpEntryRowNotServed:null}function $Ee(t){return Aas()===t}
export{TAi,fOe,Aas,$Ee};
