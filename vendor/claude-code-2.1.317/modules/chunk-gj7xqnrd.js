// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Qu}from"./chunk-szrgqdrd.js";import{Np}from"./chunk-fr3yrzf1.js";import{DIo}from"./chunk-k8z66z1y.js";import{cl}from"./chunk-cnpt3zsm.js";import{YN}from"./chunk-a9rr68j5.js";function aNr(){return[{type:"text",text:DIo()}]}function T3i(){cl({name:YN,description:`Reference for writing a ${Qu} tool script (script API and gotchas, resume, quality patterns, worked examples). Load before authoring a script for a workflow the user already opted into; it does not itself authorize running one.`,menuDescription:"Load the reference for writing Workflow tool scripts",userInvocable:!0,isEnabled:()=>Np(),async getPromptForCommand(){return aNr()}})}
export{aNr,T3i};
