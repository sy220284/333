// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{v}from"./chunk-yx0yvz1d.js";import{t}from"./chunk-qx8w2w8f.js";import{P}from"./chunk-tkwtwx7k.js";import{freemem as o}from"os";function Evo(){let e=v("tengu_bg_low_mem_mb",1024)*1024*1024;if(e<=0)return{lowMem:!1,level:void 0};if(P()!=="macos")return{lowMem:o()<e,level:void 0};let n=m();return{lowMem:n!==void 0&&n>=l,level:n}}function oAe(){return Evo().lowMem}var r={normal:1,warning:2,critical:4},l=r.critical;function m(){try{let e=Bun.ant.memoryPressureLevel();return e===null?void 0:r[e]}catch(e){t(`bg low-mem: memoryPressureLevel failed: ${e instanceof Error?e.message:String(e)}`,{level:"warn"});return}}function vvo(){return v("tengu_bg_attach_upgrade",!0)}
export{Evo,oAe,vvo};
