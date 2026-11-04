// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Fy}from"./chunk-sxtzjrdg.js";import{p}from"./chunk-c3q80g49.js";import{Xo}from"./chunk-b3wp3jfr.js";import{o,E,O,A,u,Pr,F,T}from"./chunk-e56bj9s5.js";var MBt=200;function DBt(e,t){return e===null?"no messages yet":`active ${Fy(new Date(e),{now:t})}`}var n=p(()=>u({sends:F(["message","brief"]),newProjectName:o(),projects:A(u({id:o(),name:o(),lastMessageAtMs:E().nullable()})).max(MBt),truncated:O(),listError:o().optional()})),r=p(()=>Pr("choice",[u({choice:T("new")}),u({choice:T("existing"),projectId:o()}),u({choice:T("cancel")})])),mOo=Xo({kind:"continue_in_projects_target",payload:n,result:r,default:{choice:"cancel"},hideWhile:[]});
export{MBt,DBt,mOo};
