// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var Ecs="runner-declares";var HPn="diff-finds-nested-repository",vcs="no-repository-checked-out";function kcs(e){return"--runner-declares="+e.join(",")}async function n7i(e){if(!e.startsWith("--runner-declares="))return;let E=e.slice(18).split(","),n=E.includes("diff-finds-nested-repository"),t=!1;if(!n&&!t)return;let{setRunnerDeclaredFreshMachinePerSession:R,setRunnerDeclaredNestedRepositoryDiff:r,setRunnerDeclaredNoRepositoryCheckedOut:s}=await import("./chunk-tf4n4cgm.js");if(n){if(r(!0),E.includes("no-repository-checked-out"))s(!0)}if(t)R(!0)}
export{Ecs,HPn,vcs,kcs,n7i};
