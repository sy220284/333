// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{fm}from"./chunk-wxyh2ndv.js";import{Ce}from"./chunk-k4p8c4ay.js";import{QE}from"./chunk-ccfgd08p.js";import{ye}from"./chunk-tgqpevk8.js";import{hDn}from"./chunk-d5z2b50q.js";import{DI,id}from"./chunk-nj8ddyrh.js";function sp(r){console.error(ye.red(r))}function bn(r,e="cli_error"){if(r)sp(r);if(!fm())QE(e);process.exit(1);return}function mj(r){if(r)process.stdout.write(r+`
`);process.exit(0);return}function b9t(r){process.exit(r);return}async function rf(r){await new Promise((e)=>{process.stdout.write(r,()=>e())})}function gj(r){process.stderr.write(ye.yellow(id(r))+`
`)}var i=2000;async function jG({waitForOAuthRefresh:r=!0}={}){if(r)await hDn();await Ce(DI(),i);try{let{flushAnalyticsSinks:e}=await import("./chunk-mv228ga8.js");await e()}catch{}}async function Ho(r){await jG(),process.exit(r);return}async function ms(r){if(r)sp(r);return await jG(),bn()}async function aC(r){if(r)process.stdout.write(r+`
`);return await jG(),mj()}
export{sp,bn,mj,b9t,rf,gj,jG,Ho,ms,aC};
