// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{o2}from"./chunk-mm2314jb.js";import{Ae}from"./chunk-h16yd173.js";import{s,gq,ps}from"./chunk-26xg87f0.js";import{e}from"./chunk-map0z771.js";import{Se,qt,R,y,j}from"./chunk-3j5jca5v.js";j();function z9({children:w,lock:o="always",restartKey:i}){let[H,{isVisible:x},d]=gq(),{rows:r,columns:c}=Ae(),m=R(null),[t,u]=y({minHeight:0,rows:r,columns:c,restartKey:i}),l=o==="always"&&(t.rows!==r||t.columns!==c||t.restartKey!==i),p=(o==="always"||!x)&&!l,a=R(0),g=Math.max(t.minHeight,a.current),E=Se(o2)!==null;return qt(()=>{if(!m.current)return;let{height:h}=ps(m.current),n=Math.min(h,r);if(l){u({minHeight:n,rows:r,columns:c,restartKey:i});return}if(h>g){if(E&&o==="offscreen"&&!p&&n>=t.minHeight&&d()){a.current=n;return}a.current=0,u((f)=>f.minHeight===n?f:{...f,minHeight:n})}}),e(s,{minHeight:p?g:void 0,ref:H,children:e(s,{ref:m,flexDirection:"column",children:w})})}
export{z9};
