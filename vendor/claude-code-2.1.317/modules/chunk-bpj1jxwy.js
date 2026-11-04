// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ie,qo}from"./chunk-y9ysdmh2.js";import{hu,vF}from"./chunk-wxyh2ndv.js";import{n8e,da,wu,wn,v,un,Fd}from"./chunk-yx0yvz1d.js";import{pf}from"./chunk-v1dhx02j.js";import{i}from"./chunk-jdmxbspc.js";import{t}from"./chunk-qx8w2w8f.js";import{Mh}from"./chunk-bjevk2dr.js";import{Tbs,Lde}from"./chunk-mf6cjfte.js";import{Te}from"./chunk-74x0zd10.js";import{C$,k0}from"./chunk-aqhsn9c5.js";import{Bn}from"./chunk-q8rt2ywd.js";var f="force";function Qfr(){try{if(k0())return!1;if(Te()!=="firstParty")return!1;let e=Lde("ENABLE_TOOL_SEARCH");if(e===f)return!0;if(Tbs()!==f)return!1;if(Ie(Lde("CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS")))return!1;return e===void 0||!h(e)}catch(e){return t(`isToolSearchForceOverride: settings read failed: ${e}`,{level:"error"}),!1}}function h(e){if(e.startsWith("auto:")){let o=pf(e.slice(5));return!isNaN(o)&&o>=100}return qo(e)}function ZCn(){return C$()&&!Qfr()}var g='ToolSearch with query "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp"'.replace(/"$/,',mcp__claude-in-chrome__browser_batch"');function d(e){return e.replace('ToolSearch with query "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp"',g)}var _="Add task-specific tools to the same call when the task obviously needs them: read_console_messages / read_network_requests for debugging, form_input for forms, gif_creator for recordings, javascript_tool for page scripting.",p=`# Claude in Chrome browser automation

You have access to browser automation tools (mcp__claude-in-chrome__*) for interacting with web pages in Chrome. Follow these guidelines for effective browser automation.`,b=`## Loading deferred tools

If the mcp__claude-in-chrome__* tools are deferred (must be loaded via ToolSearch before use), load every tool you expect to need in ONE ToolSearch call \u2014 the select query accepts a comma-separated list \u2014 never one call per tool. Start with the core set:

${'ToolSearch with query "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp"'}

${_}`,m=`## GIF recording

When performing multi-step browser interactions that the user may want to review or share, use mcp__claude-in-chrome__gif_creator to record them.

You must ALWAYS:
* Capture extra frames before and after taking actions to ensure smooth playback
* Name the file meaningfully to help the user identify it later (e.g., "login_process.gif")

## Console log debugging

You can use mcp__claude-in-chrome__read_console_messages to read console output. Console output may be verbose. If you are looking for specific log entries, use the 'pattern' parameter with a regex-compatible pattern. This filters results efficiently and avoids overwhelming output. For example, use pattern: "[MyApp]" to filter for application-specific logs rather than reading all console output.

## Alerts and dialogs

IMPORTANT: Do not trigger JavaScript alerts, confirms, prompts, or browser modal dialogs through your actions. These browser dialogs block all further browser events and will prevent the extension from receiving any subsequent commands. Instead, when possible, use console.log for debugging and then use the mcp__claude-in-chrome__read_console_messages tool to read those log messages. If a page has dialog-triggering elements:
1. Avoid clicking buttons or links that may trigger alerts (e.g., "Delete" buttons with confirmation dialogs)
2. If you must interact with such elements, warn the user first that this may interrupt the session
3. Use mcp__claude-in-chrome__javascript_tool to check for and dismiss any existing dialogs before proceeding

If you accidentally trigger a dialog and lose responsiveness, inform the user they need to manually dismiss it in the browser.

## Avoid rabbit holes and loops

When using browser automation tools, stay focused on the specific task. If you encounter any of the following, stop and ask the user for guidance:
- Unexpected complexity or tangential browser exploration
- Browser tool calls failing or returning errors after 2-3 attempts
- No response from the browser extension
- Page elements not responding to clicks or input
- Pages not loading or timing out
- Unable to complete the browser task despite multiple approaches

Explain what you attempted, what went wrong, and ask how the user would like to proceed. Do not keep retrying the same failing browser action or explore unrelated pages without checking in first.

## Tab context and session startup

IMPORTANT: At the start of each browser automation session, call mcp__claude-in-chrome__tabs_context_mcp first to get information about the user's current browser tabs. Use this context to understand what the user might want to work with before creating new tabs.

Never reuse tab IDs from a previous/other session. Follow these guidelines:
1. Only reuse an existing tab if the user explicitly asks to work with it
2. Otherwise, create a new tab with mcp__claude-in-chrome__tabs_create_mcp
3. If a tool returns an error indicating the tab doesn't exist or is invalid, call tabs_context_mcp to get fresh tab IDs
4. When a tab is closed by the user or a navigation error occurs, call tabs_context_mcp to see what tabs are available`,E=`${p}

${b}

${m}`,S=`${p}

${m}`,rEi=`**IMPORTANT: If the Chrome browser tools are deferred (must be loaded via ToolSearch before use), load them with ToolSearch before calling them, and batch every tool you expect to need into ONE ToolSearch call (the select query accepts a comma-separated list). Do NOT load tools one at a time; each separate ToolSearch call wastes a full round-trip.**

Start a browser task whose tools are not yet loaded with a single call loading the core set:

ToolSearch with query "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp"

${_} Only issue a second ToolSearch if the task later needs a tool you did not anticipate.`;function vlt(e){return e?E:S}function bto(e,o){let r=/^claude-([a-z]+)-(\d+(?:-\d+)*)$/.exec(e),n=r?.[1],l=r?.[2];if(!n||!l)return!1;let a=o.find(([s])=>s===n)?.[1];if(!a)return!1;let c=l.split("-").map(Number);for(let s=0;s<Math.max(c.length,a.length);s++){let u=(c[s]??0)-(a[s]??0);if(u!==0)return u>0}return!0}function Uos(e){if(!e.startsWith("auto:"))return null;let o=e.slice(5),r=pf(o);if(isNaN(r))return t(`Invalid ENABLE_TOOL_SEARCH value "${e}": expected auto:N where N is a number.`),null;return Math.max(0,Math.min(100,r))}function O(e){if(!e)return!1;return e==="auto"||e.startsWith("auto:")}function tle(){if(ZCn())return"standard";if(Qfr())return"tst";let e=process.env.ENABLE_TOOL_SEARCH,o=e?Uos(e):null;if(o===0)return"tst";if(o===100)return"standard";if(O(e))return"tst-auto";if(Ie(e))return"tst";if(qo(e))return"standard";return"tst"}var T=["claude-3-opus","claude-3-sonnet","claude-3-haiku","claude-3-5-sonnet","claude-3-5-haiku","claude-3-7-sonnet"],y=[["opus",[4,5]],["sonnet",[4,5]],["haiku",[4,5]]];function rge(e){if(Te()!=="vertex")return!1;let o=Bn(e).replace(/[@-]\d{8}$/,"");if(/^claude-3(-|$)/.test(o))return!0;return/^claude-(opus|sonnet|haiku)-\d/.test(o)&&!bto(o,y)}function w(){try{let e=v("tengu_tool_search_unsupported_models",null);if(Array.isArray(e))return e}catch{}return T}var C=[];function A(e){if(e===null||Array.isArray(e)||typeof e!=="object")return e;let o=e,r=hu(),n=r!==void 0?r:vF();if(typeof n==="string"){let l=n.toLowerCase();for(let a of Object.keys(o))if(a!=="*"&&a.length>0&&l.includes(a.toLowerCase()))return o[a]}return o["*"]}function aI(){let e=new Set;try{let o=A(v("tengu_non_deferrable_builtins",null));if(Array.isArray(o)){for(let r of o)if(typeof r==="string")e.add(r)}}catch{}try{let o=Fd()?.non_deferrable_builtins;if(Array.isArray(o)){for(let r of o)if(typeof r==="string")e.add(r)}}catch{}if(e.size===0)return C;return[...e]}function oEi(){return un("tengu_shiny_stardust",!1)}var R="tengu_drifting_heron";function sEi(){return un(R,!0)!==!1}var x="tengu_fancy_milner";function Sto(){return wu()&&un(x,!0)!==!1}function Bos(e){let o=e.toLowerCase(),r=w();for(let n of r)if(o.includes(n.toLowerCase()))return!1;return!0}function oge(e){if(Bos(e))return!0;let o=v("tengu_swift_pelican",null);return Te()==="firstParty"&&Array.isArray(o)&&n8e(e,o)}function GIe(e){let o=d(e);return o!==e&&un("tengu_tranquil_starlight",!1)?o:e}function Wh(){let e=tle();if(e==="standard"){if(da().claim("tool_search_optimistic_decision"))t(`[ToolSearch:optimistic] mode=${e}, ENABLE_TOOL_SEARCH=${i.ENABLE_TOOL_SEARCH}, result=false`);return!1}if(da().claim("tool_search_optimistic_decision"))t(`[ToolSearch:optimistic] mode=${e}, ENABLE_TOOL_SEARCH=${i.ENABLE_TOOL_SEARCH}, result=true`);return!0}function wto(){return v("tengu_surface_failed_mcp_servers",!0)}function g6e(){let e=i.CLAUDE_CODE_SORTED_OTTER;if(e!==void 0)return e;return v("tengu_sorted_otter",!1)}function iEi(){let{value:e,source:o}=wn("tengu_precious_koala","off"),r=typeof e==="string"?e.trim().toLowerCase():e,n=Mh();return{inForce:r==="everywhere"||r==="hosted"&&n,flagSource:o,coworkSurface:n}}
export{Qfr,ZCn,rEi,vlt,bto,Uos,tle,rge,aI,oEi,sEi,Sto,Bos,oge,GIe,Wh,wto,g6e,iEi};
