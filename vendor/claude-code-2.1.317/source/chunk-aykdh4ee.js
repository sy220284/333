// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Jt}from"/$bunfs/root/chunk-ft5hc2h0.js";import{i}from"/$bunfs/root/chunk-jdmxbspc.js";import{Um,uu}from"/$bunfs/root/chunk-yx0yvz1d.js";function uWo({storedAccountUuid:t,hostAccountUuid:e}){if(!e)return t?{status:"resolved",accountUuid:t,source:"stored"}:{status:"missing"};if(!t)return{status:"resolved",accountUuid:e,source:"env"};return t.trim().toLowerCase()===e.toLowerCase()?{status:"resolved",accountUuid:t,source:"env"}:{status:"mismatch"}}async function fWo(t){let e=Jt(i.CLAUDE_CODE_ACCOUNT_UUID)?.toLowerCase();if(e===void 0)return;try{let n=await Um(t);return n==="env"||n==="fd"?e:void 0}catch{return}}async function iee(t){let e;try{e=uu()?.accountUuid}catch{e=void 0}return uWo({storedAccountUuid:e,hostAccountUuid:await fWo(t)})}
export{uWo,fWo,iee};
