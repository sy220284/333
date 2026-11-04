// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import o from"path";var Ve="Read",dre="allow_large",Aut=new Set(["png","jpg","jpeg","gif","webp"]);function Phe(t){let e=o.extname(t).toLowerCase().slice(1);return Aut.has(e)||e==="pdf"}
export{Ve,dre,Aut,Phe};
