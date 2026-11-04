// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Fj}from"/$bunfs/root/chunk-rk598pjj.js";var t=/cloudflare/i;function zEe(e){let n=e("request-id");if(typeof n==="string"&&Fj(n.trim()))return"origin";let r=e("cf-ray"),o=e("server");if(typeof r==="string"&&r!==""||typeof o==="string"&&t.test(o))return"nonorigin_cf";return"nonorigin_other"}function y3e(e){return e==="nonorigin_cf"||e==="nonorigin_other"}function Noo(e){switch(e){case"nonorigin_cf":return"a network edge refused the connection before it reached Anthropic's server (HTTP 403 \u2014 Anthropic's CDN enforcing a region or network policy, or a Cloudflare gateway on this network) rather than this session; this often follows a VPN or network change";case"nonorigin_other":return"the connection was refused before it reached Anthropic (HTTP 403) \u2014 usually a proxy, VPN or firewall on this network"}}
export{zEe,y3e,Noo};
