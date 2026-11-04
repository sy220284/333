// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
function LL(r){let e=Promise.resolve();return(...i)=>{let o=e.then(()=>r(...i));return e=o.catch(()=>{}),o}}function jQ(){let r=Promise.resolve();return{acquire(){let e=()=>{},i=new Promise((t)=>{e=t}),o=r;return r=i,o.then(()=>e)}}}var n=5;function oy(){let r=new Map;return{run(e,i){let t=(r.get(e)??Promise.resolve()).then(()=>i()),s=t.then(()=>{},()=>{});return r.set(e,s),s.then(()=>{if(r.get(e)===s)r.delete(e)}),t},has(e){return r.has(e)},get size(){return r.size},async settle(){await Promise.all([...r.values()])},async drain(){for(let e=0;e<n;e++){let i=[...r.values()];if(i.length===0)return;await Promise.all(i)}},clearForTest(){r.clear()}}}
export{LL,jQ,oy};
