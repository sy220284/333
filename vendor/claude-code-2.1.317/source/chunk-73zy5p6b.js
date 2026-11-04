// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{basename as t,join as r}from"path";var ezr="bundles",d9s=r("claude.app","Contents","MacOS","claude"),e=String.raw`(\d[A-Za-z0-9._+-]*)@[0-9a-f]{12}\.[0-9a-f]{8}`,c9s=new RegExp(`^${e}$`),o=new RegExp(String.raw`[\\/]versions[\\/]bundles[\\/]${e}[\\/]claude\.app[\\/]Contents[\\/]MacOS[\\/]claude$`);function RRe(n){return o.exec(n)?.[1]}function tzr(n){return RRe(n)??t(n)}
export{ezr,d9s,c9s,RRe,tzr};
