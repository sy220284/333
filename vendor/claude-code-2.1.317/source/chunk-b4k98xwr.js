// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Fo}from"/$bunfs/root/chunk-wxyh2ndv.js";import{Q}from"/$bunfs/root/chunk-k4p8c4ay.js";import{W}from"/$bunfs/root/chunk-agahg8zh.js";async function Q4(){try{let s=t();if(s.length>0)await Promise.race([Promise.allSettled(s),Q(200)]),s.length=0;let[{settle1PEventLoggingBeforeExit:e,shutdown1PEventLogging:r},{shutdownDatadog:n},{shutdownErrorTracking:a}]=await Promise.all([import("/$bunfs/root/chunk-7atz6cc8.js"),import("/$bunfs/root/chunk-28vwn8z6.js"),import("/$bunfs/root/chunk-9384n6wk.js")]),i=e(),c=[r(),n(),a()];await Promise.race([Promise.all(c),Q(500)]),await i}catch{}}class o{tasks=[]}var u=new W(()=>new o);function t(){return Fo(u).tasks}function Nls(s){t().push(s.catch(()=>{}))}
export{Q4,Nls};
