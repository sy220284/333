// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ce}from"./chunk-k4p8c4ay.js";import{Ar}from"./chunk-v1dhx02j.js";import{JEr,dke,NY,ZMe,iNi,aNi}from"./chunk-sak81adv.js";import{execFile as c}from"child_process";var l=1e4,O_s=250,o=null,u;function VQi(){return u===!0}function qQi(){return ZMe().lastKnown}function YQi(n){ZMe().lastKnown=n}function s(n){return new Promise((e)=>{try{c("security",["find-generic-password","-a",NY(),"-w","-s",n],{encoding:"utf-8",timeout:l,windowsHide:!0},(t,i)=>{let a=Boolean(t&&"killed"in t&&t.killed);e(a?null:{stdout:t?null:i?.trim()||null})})}catch{e(null)}})}function M_s(){let n=Ar();if(o||n)return;let e=ZMe(),t=e.generation;return}async function RLn(n){if(!o)return;await(n===void 0?o:Ce(o,n))}function nfo(){ZMe().legacyApiKeyPrefetch=null}
export{O_s,VQi,qQi,YQi,M_s,RLn,nfo};
