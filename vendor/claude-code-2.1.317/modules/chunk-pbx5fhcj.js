// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{w}from"./chunk-fdshth00.js";import{tt,s,n}from"./chunk-26xg87f0.js";import{e,r}from"./chunk-map0z771.js";function zp(u){let h=w(10),{children:i,color:o,title:t}=u,f=tt();const l=f?void 0:"round",m=f?0:1,a=t?1:0;let c;if(h[0]!==o||h[1]!==t)c=t&&e(n,{bold:!0,color:o,children:t}),h[0]=o,h[1]=t,h[2]=c;else c=h[2];let y;if(h[3]!==i||h[4]!==o||h[5]!==l||h[6]!==m||h[7]!==a||h[8]!==c)y=r(s,{borderStyle:l,borderColor:o,flexDirection:"column",paddingX:m,gap:a,children:[c,i]}),h[3]=i,h[4]=o,h[5]=l,h[6]=m,h[7]=a,h[8]=c,h[9]=y;else y=h[9];return y}
export{zp};
