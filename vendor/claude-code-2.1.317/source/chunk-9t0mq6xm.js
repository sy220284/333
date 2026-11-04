// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{KE}from"/$bunfs/root/chunk-nj8ddyrh.js";function ABs(e,n){let a=KE().safeParse(n.dangerouslyDisableSandbox);if(a.success&&a.data)return{deniedFlag:"dangerouslyDisableSandbox",message:`unsandboxed execution (dangerouslyDisableSandbox) is not available to ${e}. If the command failed with a sandbox violation, the operation cannot be performed in this context \u2014 do not retry it.`};let o=KE().safeParse(n.run_in_background);if(o.success&&o.data)return{deniedFlag:"run_in_background",message:`run_in_background is not available to ${e} \u2014 run the command in the foreground.`};return{sanitizedInput:{...n,dangerouslyDisableSandbox:!1,run_in_background:!1}}}
export{ABs};
