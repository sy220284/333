// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{M7n,VEt}from"./chunk-thp9mgjc.js";var l=/^[CDG][A-Z0-9]{6,}$/;function RUo(e){let n=e.replace(/^#/,"");return l.test(n)?`https://slack.com/app_redirect?channel=${n}`:null}var t=new Set(["slack_send_message","slack_post_message"]),xUo="mcp-slack-send";function l8n(e){return t.has(e)}function v6s(e){let n=e.channel_id??e.channel;if(typeof n!=="string")return null;let r=M7n(n);if(!r)return null;return{label:`#${r.replace(/^#/,"")}`,url:RUo(n)}}function d8n(){return{uiTableKey:xUo,userFacingName(){return"Slacked"},renderToolUseMessage(e,n){return n.verbose?VEt(e,n):""}}}
export{RUo,xUo,l8n,v6s,d8n};
