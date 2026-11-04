// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
function MHe(t,r){switch(r){case"bash":return`!${t}`;default:return t}}function Hw(t){if(t.startsWith("!"))return"bash";return"prompt"}function ZI(t){if(Hw(t)==="prompt")return t;return t.slice(1)}function jUt(t){return t==="!"}function j1s({nextValue:t,value:r,cursorOffset:n,mode:o}){let e=Hw(t);if(n!==0||e==="prompt"||e===o)return!1;return t.length===r.length+1||r.length===0}
export{MHe,Hw,ZI,jUt,j1s};
