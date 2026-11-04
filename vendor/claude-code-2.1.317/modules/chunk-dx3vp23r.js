// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
function t(r,e,a,i=!1,s=!1){return{path:`artifact-type/reference/${r}`,inlinedByCreate:e,printed:a,readByKit:i,needsDesignSystem:s}}var qOo=new Map([["design",[t("format.md",!0,!0,!0),t("design-system-components.md",!0,!1,!0,!0),t("fonts.md",!1,!0),t("craft.md",!1,!0)]],["migrated-design",[t("format.md",!0,!0),t("fonts.md",!1,!0),t("craft.md",!1,!0)]],["slides",[t("format.md",!0,!0,!0),t("fonts.md",!0,!0,!0),t("craft.md",!1,!0),t("deck-files.md",!1,!1,!0)]]]),d=[t("format.md",!1,!0),t("fonts.md",!1,!0),t("craft.md",!1,!0)];function n(r){return(r===void 0?void 0:qOo.get(r))??d}function zzs(r){return n(r).filter((e)=>e.inlinedByCreate).map((e)=>e.path)}function Kzs(r){return n(r).filter((e)=>e.inlinedByCreate&&e.needsDesignSystem).map((e)=>e.path)}function d$r(r){return n(r).filter((e)=>e.printed).map((e)=>e.path)}function Vzs(r){return n(r).filter((e)=>e.readByKit).map((e)=>e.path)}
export{qOo,zzs,Kzs,d$r,Vzs};
