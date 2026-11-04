// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{sep as n}from"path";var t=["/proc","/sys","/dev"];function pUe(r,e=n){return t.some((s)=>r===s||r.startsWith(s+e))}
export{pUe};
