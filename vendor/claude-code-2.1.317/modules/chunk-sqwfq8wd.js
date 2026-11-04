// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Fo}from"./chunk-wxyh2ndv.js";import{W}from"./chunk-agahg8zh.js";function ltn(t){let e;for(let n in t)if(n.startsWith("_PROTO_")){if(e===void 0)e={...t};delete e[n]}return e??t}var u=1000;function l(){return{eventQueue:[],sink:null,droppedEventCount:0}}function i(t,e){if(t.eventQueue.length>=u)t.eventQueue.shift(),t.droppedEventCount++;t.eventQueue.push(e)}class r{state=l()}var c=new W(()=>new r);function s(){return Fo(c)}function nAs(t){let e=s().state;if(e.sink!==null)return!1;if(e.sink=t,e.eventQueue.length>0){let n=e.eventQueue;e.eventQueue=[],queueMicrotask(()=>{for(let o of n)if(o.async)t.logEventAsync(o.eventName,o.metadata);else t.logEvent(o.eventName,o.metadata)})}return!0}function a(t,e){let n=s().state;if(n.sink===null){i(n,{eventName:t,metadata:e,async:!1});return}n.sink.logEvent(t,e)}async function ci(t,e){let n=s().state;if(n.sink===null){i(n,{eventName:t,metadata:e,async:!0});return}await n.sink.logEventAsync(t,e)}
export{ltn,nAs,a,ci};
