// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var r=new Set(["update","upgrade","doctor","forward-home-settings"]);function i(o){return!1}function s(o){let n=o.indexOf("mcp");return n!==-1&&o[n+1]==="serve"}function a(o){let n=o.indexOf("agents");return n!==-1&&o.includes("--json",n+1)}function c(o){return o.some((n,e)=>(n==="plugin"||n==="plugins")&&o[e+1]==="eval")}function l(o){return o.some((n)=>n==="remote-control"||n==="rc")}export{r as NON_REPL_SUBCOMMANDS,a as isAgentsJsonInvocation,s as isMcpServeInvocation,c as isPluginEvalInvocation,i as isProjectVerbInvocation,l as isRemoteControlInvocation};
