// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{ne}from"/$bunfs/root/chunk-sctdt2my.js";import{Ice}from"/$bunfs/root/chunk-rr6ae05m.js";var XNn=`

This is how Claude Code surfaces a prompt a plugin submits between `+"turns \u2014 it starts this turn in the user's place. Address the message above.",MTs=(t)=>"The "+t+` plugin sent a message:
`,jgo=(t)=>`Prompt from the ${t} plugin`,m=(t)=>typeof t==="object"&&t!==null&&("text"in t)&&typeof t.text==="string"&&t.text!=="",_=(t)=>t.length>28&&t.startsWith("The ")&&t.endsWith(` plugin sent a message:
`);function Jen(t,n){let r=t.slice(0,t.indexOf(`
`)+1);return m(n)&&_(r)&&t===r+n.text+XNn?{label:r.slice(4,-24),text:n.text}:void 0}function l(t,n,r){let s=Jen(t,n);if(s===void 0)return t;return`${jgo(s.label)}${r}${s.text}`}var BQ=(t,n)=>l(t,n,": "),DTs=(t,n)=>l(t,n,`
`);var LTs=/^(?:\s*<[a-z][\w-]*[\s>]|\[Request interrupted by user[^\]]*\])/,f=/<command-name>(.*?)<\/command-name>/;function ymt(t,n,r="stored"){if(t.type!=="user")return;if(t.isMeta===!0||t.isCompactSummary===!0)return;let s=t.message;if(!s)return;let i=s.content,u=r==="shown"&&typeof i==="string"?BQ(i,t.pluginPrompt):i,c=u!==i,p=[];if(typeof u==="string")p.push(u);else if(Array.isArray(i))for(let e of i){if(!e||typeof e!=="object")continue;if(e.type==="tool_result")return;if(e.type==="text"&&typeof e.text==="string")p.push(e.text)}for(let e of p){let o=Ice(e).replaceAll(`
`," ").trim();if(!o)continue;let a=c?null:f.exec(o);if(a){if(!n.commandFallback)n.commandFallback=a[1];continue}let g=c?null:/<bash-input>([\s\S]*?)<\/bash-input>/.exec(o);if(g)return`! ${g[1].trim()}`;if(LTs.test(o))continue;if(o.length>200)o=ne(o,200).trim()+"\u2026";return o}return}
export{XNn,MTs,jgo,Jen,BQ,DTs,LTs,ymt};
