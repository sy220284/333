// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ie}from"./chunk-y9ysdmh2.js";import{Qb,Emt}from"./chunk-7bjr5mdw.js";import{Ce}from"./chunk-k4p8c4ay.js";import{Jt}from"./chunk-ft5hc2h0.js";import{b$}from"./chunk-md5wm0jt.js";var l=1000;function eXt(e=process.argv.slice(2)){return Emt(e)&&Qb("--output-format",e)==="stream-json"}function tve(){return Ie(process.env.CLAUDE_CODE_STARTUP_FAILURE_RESULTS)}var d=new Set(["org_config_required_unavailable","org_config_refused"]);function c(e){return d.has(e)||tve()}function tXt(e,t=process.argv.slice(2)){let r=Qb("--session-id",t);return(Qb("--sdk-url",t)===void 0?Jt(r):r)||e}function GBe({sessionId:e,message:t,reason:r,resultIndex:n=0}){return{...b$(e,[t]),...r!==void 0&&{startup_failure_reason:r},...n!==null&&{result_index:n}}}async function VG(e){if(c(e.reason))await Bdt([GBe({...e,sessionId:tXt(e.sessionId)})])}async function Bdt(e,{goesOn:t=!1}={}){let r=process.stdout;if(!eXt()||r.writableEnded||r.destroyed)return!1;let n=e.map((o)=>JSON.stringify(o)+`
`).join(""),s=(o)=>{},u=new Promise((o)=>{s=o}),i=()=>s(!1);r.once("error",i);try{r.write(n,(o)=>s(!o))}catch{return!1}let a=await Ce(u,l)??!1;if(t&&a)r.off("error",i);return a}
export{eXt,tve,tXt,GBe,VG,Bdt};
