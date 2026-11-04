// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Fo}from"./chunk-wxyh2ndv.js";import{Q}from"./chunk-k4p8c4ay.js";import{W}from"./chunk-agahg8zh.js";async function Q4(){try{let s=t();if(s.length>0)await Promise.race([Promise.allSettled(s),Q(200)]),s.length=0;let[{settle1PEventLoggingBeforeExit:e,shutdown1PEventLogging:r},{shutdownDatadog:n},{shutdownErrorTracking:a}]=await Promise.all([import("./chunk-7atz6cc8.js"),import("./chunk-28vwn8z6.js"),import("./chunk-9384n6wk.js")]),i=e(),c=[r(),n(),a()];await Promise.race([Promise.all(c),Q(500)]),await i}catch{}}class o{tasks=[]}var u=new W(()=>new o);function t(){return Fo(u).tasks}function Nls(s){t().push(s.catch(()=>{}))}
export{Q4,Nls};
