// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
async function Q6n(e,i,n){if(i===null||e.behavior==="deny")return e;return e.behavior==="ask"?{...e,matchedAskRule:e.matchedAskRule??i}:{behavior:"ask",message:await n(),decisionReason:{type:"rule",rule:i},..."updatedInput"in e&&e.updatedInput!==void 0&&{updatedInput:e.updatedInput}}}
export{Q6n};
