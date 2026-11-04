// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var _tn="pasted_content",g$n=4,dCr='<pasted_content id="',RAs=`">
`,_ji='</pasted_content id="';function cCr(t){return`<pasted_content id="${t}">
`}function h$n(t){return`</pasted_content id="${t}">
`}function xAs(t){if(t.length!==4)return!1;for(let e=0;e<t.length;e++){let n=t.charCodeAt(e);if(!(n>=48&&n<=57||n>=97&&n<=102))return!1}return!0}var PAs=/[([{"'`]/,IAs=/[)\]}"'`.,;:!?]/;function OAs(t,e=0,n=t.length){let s=e;while(s<n&&IAs.test(t[s]))s++;return s>=n||/\s/.test(t[s])}function l0t(t){let e=[],n=0,s=0;for(;;){let c=t.indexOf('<pasted_content id="',s);if(c===-1)break;let r=c+20,o=t.slice(r,r+4);if(!xAs(o)||!t.startsWith(`">
`,r+4)){s=r;continue}let i=r+4+3,f=h$n(o).slice(0,-1),l=t.indexOf(`
${f}`,i-1)+1;if(l===0)break;let d=c;for(let a=0;a<2&&d>n&&t[d-1]===`
`;a++)d--;if(d>n)e.push({kind:"text",text:t.slice(n,d)});n=l+f.length;for(let a=0;a<2&&t[n]===`
`;a++)n++;e.push({kind:"block",id:o,body:t.slice(i,l-1),raw:t.slice(d,n)}),s=n}if(n<t.length)e.push({kind:"text",text:t.slice(n)});return e}function bji(t){let e=l0t(t);if(!e.some((n)=>n.kind==="block"))return t;return e.map((n)=>n.kind==="text"?n.text:n.body).join(`

`).trim()}function Ice(t){let e=l0t(t);if(e.length===1&&e[0].kind==="text")return t;return e.map((n)=>n.kind==="text"?n.text:n.body).join("")}function MAs(t,e){let n=l0t(t);if(!n.some((r)=>r.kind==="block"&&r.id===e))return t;let s="",c=!1;for(let[r,o]of n.entries()){let i=n[r+1],u=i?.kind==="block"&&i.id===e;if(o.kind==="text"||o.id!==e){let E=o.kind==="text"?o.text:o.raw;if(c)E=E.replace(/^\s+/,"");if(u&&i.body.includes(`
`))E=E.replace(/\s+$/,"");if(E==="")continue;if(c&&s!=="")s+=`
`;s+=E,c=!1;continue}let f=o.body.includes(`
`),l=s.length;while(l>0&&PAs.test(s[l-1]))l--;let d=l===0||/\s/.test(s[l-1]);if((f||c||!d)&&s!=="")s+=`
`;s+=o.body;let a=i===void 0?"":i.kind==="text"?i.text:i.raw;c=f||u||/^\s\s/.test(a)||!OAs(a)}return s}function Fye(t){let e=0;for(let n=0;n<t.length;n++)e=(e<<5)-e+t.charCodeAt(n)|0;return e}function Tk(t){return Bun.hash(t).toString()}function a0t(t,e){return Bun.hash(e,Bun.hash(t)).toString()}
export{Fye,Tk,a0t,_tn,g$n,dCr,RAs,_ji,cCr,h$n,xAs,PAs,IAs,OAs,l0t,bji,Ice,MAs};
