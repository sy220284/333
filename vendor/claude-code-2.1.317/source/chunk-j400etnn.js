// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{t}from"/$bunfs/root/chunk-qx8w2w8f.js";function Ic(e,o,r={},u="debug"){let n=e===void 0?"[remote-tools]":`[remote-tools call=${e}]`,g=Object.entries(r).flatMap(([d,i])=>i===void 0?[]:[`${d}=${i}`]).join(" ");t(g===""?`${n} ${o}`:`${n} ${o} ${g}`,{level:u})}function Zcn(e){return e==="outcome_of"?"verbose":"debug"}
export{Ic,Zcn};
