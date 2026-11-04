// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{nS,v5}from"/$bunfs/root/chunk-wxyh2ndv.js";import{i}from"/$bunfs/root/chunk-jdmxbspc.js";import{ft}from"/$bunfs/root/chunk-mf6cjfte.js";import{Ct}from"/$bunfs/root/chunk-y52m2tkd.js";import{Np}from"/$bunfs/root/chunk-fr3yrzf1.js";import{YN}from"/$bunfs/root/chunk-a9rr68j5.js";import{Vr}from"/$bunfs/root/chunk-5c8f3pvp.js";import{r8,iY}from"/$bunfs/root/chunk-w7ytxe22.js";function u2e(o){return l()&&!iY(YN)&&(o===void 0||r(o))}function l(){if(!Np())return!1;if(r8()||nS())return!1;if(i.CLAUDE_CODE_ENTRYPOINT==="local-agent")return!1;let o=ft().skillOverrides?.[YN];if(o==="off"||o==="user-invocable-only")return!1;let e=v5();if(e!==void 0&&!e.includes(YN))return!1;return!0}function r(o){return o.some((e)=>Ct(e,Vr))}
export{u2e};
