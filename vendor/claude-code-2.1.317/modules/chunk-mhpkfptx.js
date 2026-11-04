// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Xs}from"./chunk-nj8ddyrh.js";import{rct,sA,kIn}from"./chunk-f4jap23z.js";import{rr}from"./chunk-wz7db6sp.js";var XAe="cc-plugin-you-should-know";var WNr={id:"you-should-know-plugin",providerAgnostic:!0,advertisedCommand:"plugin",cooldownSessions:10,maxLifetimeShows:3,content:async(o)=>`Want a side agent watching your back while Claude works? Turn on You should know:
${rr("suggestion",o.theme)(`/plugin enable ${XAe}@${Xs}`)}`,isRelevant:async()=>rct(XAe)&&sA(XAe)?.defaultEnabled===!1&&kIn(`${XAe}@${Xs}`)===void 0};export{XAe,WNr};
