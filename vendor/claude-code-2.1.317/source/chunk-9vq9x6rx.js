// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Jw}from"/$bunfs/root/chunk-78c3zyjp.js";import{Ty}from"/$bunfs/root/chunk-s4ybt8gg.js";var hs="AskUserQuestion",gbi=12,f6t="The user asked for more questions",hbi=`${f6t} before answering; this is a request for another round, not an answer.`;function Kts(e){if(typeof e!=="string")return"";return e.replace(/[\s\u0085]+/g," ").trim().replace(/\\/g,"\\\\").replace(/"/g,"\\\"")}function fur(e){if(typeof e==="number"||typeof e==="boolean")return String(e);return Kts(e)}var ybi="Asks the user multiple choice questions to gather information, clarify ambiguity, understand preferences, make decisions or offer them choices.",_bi={markdown:`
Preview feature:
Use the optional \`preview\` field on options when presenting concrete artifacts that users need to visually compare:
- ASCII mockups of UI layouts or components
- Code snippets showing different implementations
- Diagram variations
- Configuration examples

Preview content is rendered as markdown in a monospace box. Multi-line text with newlines is supported. When any option has a preview, the UI switches to a side-by-side layout with a vertical option list on the left and preview on the right. Do not use previews for simple preference questions where labels and descriptions suffice. Note: previews are only supported for single-select questions (not multiSelect).
`,html:`
Preview feature:
Use the optional \`preview\` field on options when presenting concrete artifacts that users need to visually compare:
- HTML mockups of UI layouts or components
- Formatted code snippets showing different implementations
- Visual comparisons or diagrams

Preview content must be a self-contained HTML fragment (no <html>/<body> wrapper, no <script> or <style> tags \u2014 use inline style attributes instead). Do not use previews for simple preference questions where labels and descriptions suffice. Note: previews are only supported for single-select questions (not multiSelect).
`},Vts=`Use this tool only when you are blocked on a decision that is genuinely the user's to make: one you cannot resolve from the request, the code, or sensible defaults.

Usage notes:
- Users will always be able to select "Other" to provide custom text input
- Use multiSelect: true to allow multiple answers to be selected for a question
- If you recommend a specific option, make that the first option in the list and add "(Recommended)" at the end of the label
`,bbi=`${Vts}
Plan mode note: To switch into plan mode, use ${Jw} (not this tool). Once in plan mode, use this tool to clarify requirements or choose between approaches BEFORE finalizing your plan. Do NOT use this tool to ask "Is my plan ready?", "Should I proceed?", or otherwise reference "the plan" in questions \u2014 the user cannot see the plan until you call ${Ty} for approval.
`,Sbi=`
Extended questions (this host renders them):
- Put the most important question first.
- Omit "kind" for an ordinary choice question. Use "kind": "text" for an open-ended question (a text box, no options) and "kind": "number" with "min"/"max" (optionally "step", "defaultValue", "unit") for a quantity. Prefer choices whenever the likely answers can be listed.
- Set multiSelect: true on choice questions unless the options are mutually exclusive (people answering are often still exploring).
- Optional "title" is one short line above the questions; optional per-question "description" is one helper line. Option descriptions are optional here too: add one only when the label alone would be ambiguous.
- Do not add "Other" or "Skip" options: the user can always type their own answer or leave a question unanswered. The user can also ask you for more questions; when the result says so, call this tool again with follow-up questions before doing the task.
`,wbi=`
Reserve this for decisions where the user's answer changes what you do next \u2014 not for choices with a conventional default or facts you can verify in the codebase yourself. In those cases pick the obvious option, mention it in your response, and proceed.
`,Ebi=`
The user may see only the question dialog: tool results and text you wrote earlier in this turn may not be on their screen while it is open. Make each question stand on its own: if it depends on something you found, say so briefly, and name the items you are asking about in the question itself.
`;
export{hs,gbi,f6t,hbi,Kts,fur,ybi,_bi,Vts,bbi,Sbi,wbi,Ebi};
