// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var sDo={killed:"Stopped because the workflow was stopped",failed:"Stopped because the workflow failed",completed:"Stopped because the workflow finished without waiting for it"},d=new Set(Object.values(sDo));function Fqn(e){return e!==void 0&&d.has(e)}var iDo="error details withheld for this workflow",aDo="This workflow run hides its script, and its record of that could not be read or written, so nothing was run.";function F$r(e){return e.type!=="workflow_log"}function lDo(e){let{promptPreview:o,phaseTitle:r,...t}=e,n=r!==void 0&&t.phaseIndex!==void 0;return{...t,...n&&{phaseTitle:`phase ${t.phaseIndex}`},...t.error!==void 0&&{error:"error details withheld for this workflow"}}}function s(e){return e.map((o)=>o.type==="workflow_phase"?{...o,title:`phase ${o.index}`}:lDo(o))}function a1t(e,o){let r=e.filter(F$r);return o?s(r):r}function jdn({startedAt:e,queuedAt:o,tokens:r}){return e!==void 0||o===void 0||(r??0)>0}
export{sDo,Fqn,iDo,aDo,F$r,lDo,a1t,jdn};
