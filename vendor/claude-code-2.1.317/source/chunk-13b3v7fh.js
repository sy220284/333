// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{p}from"/$bunfs/root/chunk-c3q80g49.js";import{Xo}from"/$bunfs/root/chunk-b3wp3jfr.js";import{o,O,u,Pr,T}from"/$bunfs/root/chunk-e56bj9s5.js";function XNt(e,t){return t?`Create the project \u201C${e}\u201D and send this message?`:`Send this message to ${e}?`}var JNt="Choose Send again to confirm.",s=p(()=>u({projectName:o(),creates:O(),message:o()})),n=p(()=>Pr("choice",[u({choice:T("send")}),u({choice:T("cancel")})])),U5i=Xo({kind:"continue_in_projects_message",payload:s,result:n,default:{choice:"cancel"},hideWhile:[]});
export{XNt,JNt,U5i};
