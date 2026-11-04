// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{StringDecoder as s}from"string_decoder";var p=1048576;function hsn(o,r){let d=new s("utf8"),e="",t=!1,l=(i)=>{if(t)return;e+=typeof i==="string"?i:d.write(i);let f;while((f=e.indexOf(`
`))>=0){let c=e.slice(0,f);if(e=e.slice(f+1),c)r(c)}if(e.length>p){if(t=!0,e="","destroy"in o)o.destroy()}},n=()=>{if(t)return;if(e+=d.end(),e)r(e),e=""};return o.on("data",l),o.on("end",n),o.on("close",n),()=>{o.off("data",l),o.off("end",n),o.off("close",n)}}
export{hsn};
