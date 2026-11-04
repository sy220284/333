// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{pf}from"/$bunfs/root/chunk-v1dhx02j.js";var a=120000,s=600000;function yte(n=process.env){let e=n.BASH_DEFAULT_TIMEOUT_MS;if(e){let t=pf(e);if(!isNaN(t)&&t>0)return t}return a}function mme(n=process.env){let e=n.BASH_MAX_TIMEOUT_MS;if(e){let t=pf(e);if(!isNaN(t)&&t>0)return Math.max(t,yte(n))}return Math.max(s,yte(n))}var Xmi=1800000,RJr=7200000;function Jmi(n){return Math.min(Math.max(n,mme()),2147483647)}function Qmi(n,e){return Math.max(n,yte(e))}function ait(n,e){return n!==void 0&&n>0?e:void 0}var i=2000;function llr({requestedTimeoutMs:n,isMainAgent:e,canAutoBackground:t,subagentCapMs:o=0,env:u=process.env}){if(!t)return n;let r=e?pf(u.CLAUDE_CODE_AUTO_BACKGROUND_TIMEOUT_MS):o;if(isNaN(r)||r<=0)return n;return Math.min(n,Math.max(r,i))}
export{yte,mme,Xmi,RJr,Jmi,Qmi,ait,llr};
