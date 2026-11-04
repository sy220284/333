// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{z4}from"/$bunfs/root/chunk-hq6a4gxw.js";import{Mf,ERn,oj}from"/$bunfs/root/chunk-y0kzwxaj.js";import{fe}from"/$bunfs/root/chunk-gfgmnhge.js";import{randomBytes as l}from"crypto";function S5i(o,t){let e=o.mapToolResultToToolResultBlockParam(t.data,`toolu_serve_${l(12).toString("hex")}`);return ixr(e?.content??"",t.data,e?.is_error===!0)}function ixr(o,t,e=!1,r=[]){return oj({envelope:{v:Mf,outcome:"completed",target:cNt(),is_error:e,content:ERn(o),output:t,...r.length>0&&{notes:r}},content:o})}function cNt(){return{name:z4(),working_dir:fe()}}
export{S5i,ixr,cNt};
