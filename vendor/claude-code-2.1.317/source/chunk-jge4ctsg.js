// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ne,Rt}from"/$bunfs/root/chunk-tm88cq46.js";var r=new Set([Ne,Rt]);function OAe(e){return r.has(e)}function KFs(e,n){return OAe(e)?e:n}function ZQe(e){return e===Rt?"Select-Object -First, Select-Object -Last or Select-String":"head, tail or grep"}function cH(e){return e.isMcp!==!0&&OAe(e.name)}
export{OAe,KFs,ZQe,cH};
