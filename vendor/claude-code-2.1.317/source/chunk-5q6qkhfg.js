// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{qN}from"/$bunfs/root/chunk-ky8kdffw.js";function Ite(n){if(n?.kind!=="task-notification")return n;let e=qN(n.runId);return{kind:"task-notification",...n.subkind!==void 0&&{subkind:n.subkind},...n.fireReason!==void 0&&{fireReason:n.fireReason},...n.producer!==void 0&&{producer:n.producer},...e!==void 0&&{runId:e},...n.taskKind==="mcp-task"&&{taskKind:n.taskKind}}}function F1(n,e,t){let i=Ite(n)??(e==="task-notification"?{kind:"task-notification"}:void 0),d=qN(t);return d!==void 0&&i?.kind==="task-notification"&&i.runId===void 0?{...i,runId:d}:i}function GJ(n){return n?.kind==="task-notification"&&n.producer==="session-task"}function k4(n){return n?.kind==="task-notification"&&Object.keys(n).every((e)=>e==="kind"||e==="producer"||e==="runId"||e==="taskKind")}function qYe(n,e){return k4(n)&&(GJ(n)||e===!0)}
export{Ite,F1,GJ,k4,qYe};
