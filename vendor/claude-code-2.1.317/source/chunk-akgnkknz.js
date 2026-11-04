// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
class D2e{#e=void 0;#n=!1;provide(e){this.#e=e}canAsk(){return this.#e!==void 0}askOnce({workerEpoch:e,deadlineMs:n}){if(this.#e===void 0||this.#n)return!1;return this.#n=!0,this.#e({subtype:"remote_tools_reannounce",worker_epoch:e,deadline_ms:n},AbortSignal.timeout(n)),!0}}
export{D2e};
