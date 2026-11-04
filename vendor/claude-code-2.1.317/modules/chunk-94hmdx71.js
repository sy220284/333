// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{i}from"./chunk-jdmxbspc.js";var V1t="CLAUDE_CODE_RELAUNCH_TERMINAL_SIZE";function xYn(){let{columns:r,rows:e}=process.stdout;if(!r||!e)return{};return{[V1t]:`${r}x${e}`}}function qqs(){let r=i.CLAUDE_CODE_RELAUNCH_TERMINAL_SIZE;if(delete process.env[V1t],r===void 0||!process.stdout.isTTY)return;let e=/^([1-9]\d{0,3})x([1-9]\d{0,3})$/.exec(r);if(!e)return;process.stdout.columns||=Number(e[1]),process.stdout.rows||=Number(e[2])}
export{V1t,xYn,qqs};
