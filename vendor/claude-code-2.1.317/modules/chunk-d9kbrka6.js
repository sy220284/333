// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{t}from"./chunk-qx8w2w8f.js";import{Ff}from"./chunk-jfgvczh1.js";import{qh}from"./chunk-82rjsyjj.js";import{c1e}from"./chunk-0qfe3r30.js";import{kc}from"./chunk-nj8ddyrh.js";function K4n(o){if(!o||Object.keys(o).length===0)return!1;for(let n of kc){let e=o[n];if(!e||e.length===0)continue;for(let r of e)if((r.hooks?.length??0)>0)return!0}return!1}function xVs(o,n,e,r,m=!1,l=!1,u=!1,p){if(!e||Object.keys(e).length===0)return;c1e(e,p);let s=0;for(let i of kc){let f=e[i];if(!f||f.length===0)continue;let a=i;if(m&&i==="Stop")a="SubagentStop",t(`Converting Stop hook to SubagentStop for ${r} (subagents trigger SubagentStop)`);for(let c of f){let S=c.matcher??"",g=c.hooks;if(!g||g.length===0)continue;for(let h of g)o.add(n,a,S,h,{personal:l,checkout:u}),s++}}if(s>0)t(`Registered ${s} frontmatter hook(s) from ${r} for session ${n}`)}function Fbt(o){return qh()&&o!==void 0&&Ff.has(o)}
export{K4n,xVs,Fbt};
