// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{d}from"/$bunfs/root/chunk-5x4vp4dg.js";import{t}from"/$bunfs/root/chunk-qx8w2w8f.js";import{Dd,Eo,dl,Zv}from"/$bunfs/root/chunk-9w39wpj0.js";import{Bte}from"/$bunfs/root/chunk-4p9zngcm.js";async function fqn(r,o){if(!Bte())return;try{let e=await Eo(r,o);if(!e||!dl(e)||e.state==="stopped"||Zv(e))return;await Dd(r,{...e,state:"stopped",updatedAt:new Date().toISOString()},o)}catch(e){t(`stop not recorded on the job's row: ${d(e)}`,{level:"error"})}}
export{fqn};
