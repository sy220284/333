// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
class r{peer;closed=!1;onclose;onerror;onmessage;_setPeer(e){this.peer=e}async start(){}async send(e){if(this.closed)throw Error("Transport is closed");queueMicrotask(()=>{this.peer?.onmessage?.(e)})}async close(){if(this.closed)return;if(this.closed=!0,this.onclose?.(),this.peer&&!this.peer.closed)this.peer.closed=!0,this.peer.onclose?.()}}function iMo(){let e=new r,s=new r;return e._setPeer(s),s._setPeer(e),[e,s]}
export{iMo};
