// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{bc}from"./chunk-w3qnpecn.js";import{AE,by}from"./chunk-91mtjsdc.js";function Nse(e,t){return`${bc(e)??""}/${bc(t)??""}`}function $3s(e){return bc(e)??""}function N9n({serverName:e,toolName:t,mcpTaskId:o,toolUseId:s,pollIntervalMs:a,abortController:n,backgroundedToDeliverMessage:i,protocol:p,driveAbortController:c,ttlExpiresAt:l}){let r=AE("mcp_task");return{...by(r,"mcp_task",Nse(e,t),s),type:"mcp_task",status:"running",serverName:e,toolName:t,mcpTaskId:o??r,mcpStatus:"working",pollIntervalMs:a,abortController:n,backgroundedToDeliverMessage:i,protocol:p,driveAbortController:c,ttlExpiresAt:l}}
export{Nse,$3s,N9n};
